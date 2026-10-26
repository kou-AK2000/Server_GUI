import express, { type NextFunction, type Request, type Response } from 'express'
import { z, ZodError } from 'zod'
import { requireUser, requireWorkspaceRole } from './auth.js'
import { pool, transaction } from './database.js'
import { parseDiagramDocument } from './documents.js'
import { config } from './config.js'

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '5mb' }))
app.use((request, response, next) => {
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('X-Frame-Options', 'DENY')
  response.setHeader('Referrer-Policy', 'no-referrer')
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Access-Control-Allow-Origin', config.allowedOrigin)
  response.setHeader('Vary', 'Origin')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Orden-Dev-User-Id, X-Orden-Dev-User-Email, X-Orden-Dev-Display-Name')
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS')
  if (request.method === 'OPTIONS') return response.sendStatus(204)
  next()
})

const workspaceInput = z.object({ name: z.string().trim().min(1).max(120) })
const projectInput = z.object({ name: z.string().trim().min(1).max(120), description: z.string().trim().max(1000).optional().default('') })
const diagramInput = z.object({ name: z.string().trim().min(1).max(120), document: z.unknown() })
const updateDiagramInput = z.object({ expectedRevision: z.number().int().positive(), document: z.unknown() })

async function workspaceForProject(projectId: string) {
  const result = await pool.query<{ workspace_id: string }>('SELECT workspace_id FROM projects WHERE id = $1', [projectId])
  return result.rows[0]?.workspace_id
}

async function workspaceForDiagram(diagramId: string) {
  const result = await pool.query<{ workspace_id: string }>(
    `SELECT projects.workspace_id FROM diagrams
     JOIN projects ON projects.id = diagrams.project_id
     WHERE diagrams.id = $1`,
    [diagramId],
  )
  return result.rows[0]?.workspace_id
}

app.get('/health', async (_request, response) => {
  await pool.query('SELECT 1')
  response.json({ status: 'ok' })
})

app.use('/api/v1', requireUser)

app.get('/api/v1/workspaces', async (request, response) => {
  const result = await pool.query(
    `SELECT w.id, w.name, wm.role, w.created_at AS "createdAt"
     FROM workspaces w JOIN workspace_members wm ON wm.workspace_id = w.id
     WHERE wm.user_id = $1 ORDER BY w.created_at DESC`,
    [request.user!.id],
  )
  response.json({ workspaces: result.rows })
})

app.post('/api/v1/workspaces', async (request, response) => {
  const { name } = workspaceInput.parse(request.body)
  const workspace = await transaction(async (client) => {
    const created = await client.query<{ id: string; name: string; createdAt: string }>(
      'INSERT INTO workspaces (name, created_by) VALUES ($1, $2) RETURNING id, name, created_at AS "createdAt"',
      [name, request.user!.id],
    )
    await client.query('INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, $3)', [created.rows[0].id, request.user!.id, 'owner'])
    return created.rows[0]
  })
  response.status(201).json({ workspace: { ...workspace, role: 'owner' } })
})

app.get('/api/v1/workspaces/:workspaceId/projects', async (request, response) => {
  if (!await requireWorkspaceRole(request, response, request.params.workspaceId, 'viewer')) return
  const result = await pool.query(
    `SELECT id, name, description, created_at AS "createdAt", updated_at AS "updatedAt"
     FROM projects WHERE workspace_id = $1 ORDER BY updated_at DESC`,
    [request.params.workspaceId],
  )
  response.json({ projects: result.rows })
})

app.post('/api/v1/workspaces/:workspaceId/projects', async (request, response) => {
  if (!await requireWorkspaceRole(request, response, request.params.workspaceId, 'editor')) return
  const { name, description } = projectInput.parse(request.body)
  const result = await pool.query(
    `INSERT INTO projects (workspace_id, name, description, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, description, created_at AS "createdAt", updated_at AS "updatedAt"`,
    [request.params.workspaceId, name, description, request.user!.id],
  )
  response.status(201).json({ project: result.rows[0] })
})

app.get('/api/v1/projects/:projectId/diagrams', async (request, response) => {
  const workspaceId = await workspaceForProject(request.params.projectId)
  if (!workspaceId) return response.status(404).json({ error: 'project_not_found' })
  if (!await requireWorkspaceRole(request, response, workspaceId, 'viewer')) return
  const result = await pool.query(
    `SELECT id, name, schema_version AS "schemaVersion", revision, created_at AS "createdAt", updated_at AS "updatedAt"
     FROM diagrams WHERE project_id = $1 ORDER BY updated_at DESC`,
    [request.params.projectId],
  )
  response.json({ diagrams: result.rows })
})

app.post('/api/v1/projects/:projectId/diagrams', async (request, response) => {
  const workspaceId = await workspaceForProject(request.params.projectId)
  if (!workspaceId) return response.status(404).json({ error: 'project_not_found' })
  if (!await requireWorkspaceRole(request, response, workspaceId, 'editor')) return
  const { name, document } = diagramInput.parse(request.body)
  const parsed = parseDiagramDocument(document)
  const diagram = await transaction(async (client) => {
    const created = await client.query<{ id: string; revision: number; createdAt: string; updatedAt: string }>(
      `INSERT INTO diagrams (project_id, name, document_json, schema_version, revision, created_by, updated_by)
       VALUES ($1, $2, $3, $4, 1, $5, $5)
       RETURNING id, revision, created_at AS "createdAt", updated_at AS "updatedAt"`,
      [request.params.projectId, name, parsed, parsed.schemaVersion, request.user!.id],
    )
    await client.query(
      `INSERT INTO diagram_revisions (diagram_id, revision, document_json, schema_version, created_by)
       VALUES ($1, 1, $2, $3, $4)`,
      [created.rows[0].id, parsed, parsed.schemaVersion, request.user!.id],
    )
    return created.rows[0]
  })
  response.status(201).json({ diagram })
})

app.get('/api/v1/diagrams/:diagramId', async (request, response) => {
  const workspaceId = await workspaceForDiagram(request.params.diagramId)
  if (!workspaceId) return response.status(404).json({ error: 'diagram_not_found' })
  if (!await requireWorkspaceRole(request, response, workspaceId, 'viewer')) return
  const result = await pool.query(
    `SELECT id, project_id AS "projectId", name, document_json AS document, schema_version AS "schemaVersion", revision,
       created_at AS "createdAt", updated_at AS "updatedAt"
     FROM diagrams WHERE id = $1`,
    [request.params.diagramId],
  )
  response.json({ diagram: result.rows[0] })
})

app.put('/api/v1/diagrams/:diagramId', async (request, response) => {
  const workspaceId = await workspaceForDiagram(request.params.diagramId)
  if (!workspaceId) return response.status(404).json({ error: 'diagram_not_found' })
  if (!await requireWorkspaceRole(request, response, workspaceId, 'editor')) return
  const { expectedRevision, document } = updateDiagramInput.parse(request.body)
  const parsed = parseDiagramDocument(document)
  const saved = await transaction(async (client) => {
    const current = await client.query<{ revision: number }>('SELECT revision FROM diagrams WHERE id = $1 FOR UPDATE', [request.params.diagramId])
    if (!current.rows[0]) return undefined
    if (current.rows[0].revision !== expectedRevision) return { conflict: true, revision: current.rows[0].revision }
    const nextRevision = expectedRevision + 1
    const updated = await client.query(
      `UPDATE diagrams SET document_json = $2, schema_version = $3, revision = $4, updated_by = $5, updated_at = NOW()
       WHERE id = $1
       RETURNING id, revision, updated_at AS "updatedAt"`,
      [request.params.diagramId, parsed, parsed.schemaVersion, nextRevision, request.user!.id],
    )
    await client.query(
      `INSERT INTO diagram_revisions (diagram_id, revision, document_json, schema_version, created_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [request.params.diagramId, nextRevision, parsed, parsed.schemaVersion, request.user!.id],
    )
    return { conflict: false, diagram: updated.rows[0] }
  })
  if (!saved) return response.status(404).json({ error: 'diagram_not_found' })
  if (saved.conflict) return response.status(409).json({ error: 'revision_conflict', currentRevision: saved.revision })
  response.json(saved)
})

app.get('/api/v1/diagrams/:diagramId/revisions', async (request, response) => {
  const workspaceId = await workspaceForDiagram(request.params.diagramId)
  if (!workspaceId) return response.status(404).json({ error: 'diagram_not_found' })
  if (!await requireWorkspaceRole(request, response, workspaceId, 'viewer')) return
  const result = await pool.query(
    `SELECT revision, schema_version AS "schemaVersion", created_at AS "createdAt", created_by AS "createdBy"
     FROM diagram_revisions WHERE diagram_id = $1 ORDER BY revision DESC`,
    [request.params.diagramId],
  )
  response.json({ revisions: result.rows })
})

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  // Never log request bodies: they may contain infrastructure design data.
  if (error instanceof ZodError) return response.status(400).json({ error: 'invalid_request', details: error.issues.map((issue) => issue.path.join('.')) })
  if (error instanceof Error && error.message === 'diagram_document_contains_secret_like_field') return response.status(400).json({ error: error.message })
  console.error('orden-api request failed', error instanceof Error ? error.message : 'unknown error')
  response.status(500).json({ error: 'internal_error' })
})

app.listen(config.port, () => {
  console.log(`Orden API listening on http://127.0.0.1:${config.port}`)
})

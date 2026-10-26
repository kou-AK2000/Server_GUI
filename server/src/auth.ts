import type { NextFunction, Request, Response } from 'express'
import { config } from './config.js'
import { pool } from './database.js'

export type AuthenticatedUser = {
  id: string
  email: string
  displayName: string
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser
    }
  }
}

/**
 * Development-only identity adapter.
 * It intentionally refuses requests unless ORDEN_DEV_AUTH=true. Replace this
 * adapter with verified OIDC/session authentication before any deployment.
 */
export async function requireUser(request: Request, response: Response, next: NextFunction) {
  if (!config.allowDevelopmentIdentity) {
    response.status(503).json({ error: 'authentication_not_configured' })
    return
  }

  const id = request.header('x-orden-dev-user-id')
  const email = request.header('x-orden-dev-user-email')
  const displayName = request.header('x-orden-dev-display-name') ?? 'Orden developer'
  if (!id || !email) {
    response.status(401).json({ error: 'development_identity_required' })
    return
  }

  const result = await pool.query<AuthenticatedUser>(
    `INSERT INTO users (id, email, display_name)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, display_name = EXCLUDED.display_name
     RETURNING id, email, display_name AS "displayName"`,
    [id, email, displayName],
  )
  request.user = result.rows[0]
  next()
}

export type WorkspaceRole = 'viewer' | 'editor' | 'owner'

export async function requireWorkspaceRole(
  request: Request,
  response: Response,
  workspaceId: string,
  requiredRole: WorkspaceRole,
) {
  const hierarchy: Record<WorkspaceRole, number> = { viewer: 1, editor: 2, owner: 3 }
  const result = await pool.query<{ role: WorkspaceRole }>(
    'SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2',
    [workspaceId, request.user!.id],
  )
  const role = result.rows[0]?.role
  if (!role || hierarchy[role] < hierarchy[requiredRole]) {
    response.status(403).json({ error: 'insufficient_workspace_role' })
    return false
  }
  return true
}

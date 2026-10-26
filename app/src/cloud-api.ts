type CloudIdentity = {
  id: string
  email: string
  displayName: string
}

type ApiWorkspace = { id: string; name: string; role: 'viewer' | 'editor' | 'owner' }
type ApiProject = { id: string; name: string; description: string }
type ApiDiagramSummary = { id: string; name: string; revision: number; updatedAt: string }

export type CloudDiagram = ApiDiagramSummary & { projectId: string; projectName: string; workspaceId: string; workspaceName: string }
export type CloudBinding = { workspaceId: string; projectId: string; diagramId: string; revision: number }

const apiUrl = (import.meta.env.VITE_ORDEN_API_URL ?? '').replace(/\/$/, '')
const developmentIdentity: CloudIdentity | null = import.meta.env.DEV && import.meta.env.VITE_ORDEN_DEV_USER_ID && import.meta.env.VITE_ORDEN_DEV_USER_EMAIL
  ? {
      id: import.meta.env.VITE_ORDEN_DEV_USER_ID,
      email: import.meta.env.VITE_ORDEN_DEV_USER_EMAIL,
      displayName: import.meta.env.VITE_ORDEN_DEV_DISPLAY_NAME ?? 'Orden developer',
    }
  : null

export const cloudApiConfigured = Boolean(apiUrl && developmentIdentity)

async function request<T>(path: string, init: RequestInit = {}) {
  if (!cloudApiConfigured || !developmentIdentity) throw new Error('cloud_not_configured')
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Orden-Dev-User-Id': developmentIdentity.id,
      'X-Orden-Dev-User-Email': developmentIdentity.email,
      'X-Orden-Dev-Display-Name': developmentIdentity.displayName,
      ...init.headers,
    },
  })
  const body = await response.json().catch(() => ({})) as T & { error?: string; currentRevision?: number }
  if (!response.ok) {
    const error = new Error(body.error ?? 'cloud_request_failed') as Error & { currentRevision?: number }
    error.currentRevision = body.currentRevision
    throw error
  }
  return body
}

export async function saveDocumentToCloud(document: Record<string, unknown>, binding?: CloudBinding): Promise<CloudBinding> {
  if (binding) {
    const result = await request<{ diagram: { revision: number } }>(`/api/v1/diagrams/${binding.diagramId}`, {
      method: 'PUT', body: JSON.stringify({ expectedRevision: binding.revision, document }),
    })
    return { ...binding, revision: result.diagram.revision }
  }

  const workspaces = (await request<{ workspaces: ApiWorkspace[] }>('/api/v1/workspaces')).workspaces
  const workspace = workspaces[0] ?? (await request<{ workspace: ApiWorkspace }>('/api/v1/workspaces', {
    method: 'POST', body: JSON.stringify({ name: 'My Orden workspace' }),
  })).workspace
  const projects = (await request<{ projects: ApiProject[] }>(`/api/v1/workspaces/${workspace.id}/projects`)).projects
  const name = String(document.name ?? 'Untitled system')
  const project = projects.find((item) => item.name === name) ?? (await request<{ project: ApiProject }>(`/api/v1/workspaces/${workspace.id}/projects`, {
    method: 'POST', body: JSON.stringify({ name, description: '' }),
  })).project
  const created = await request<{ diagram: { id: string; revision: number } }>(`/api/v1/projects/${project.id}/diagrams`, {
    method: 'POST', body: JSON.stringify({ name, document }),
  })
  return { workspaceId: workspace.id, projectId: project.id, diagramId: created.diagram.id, revision: created.diagram.revision }
}

export async function listCloudDiagrams(): Promise<CloudDiagram[]> {
  const workspaces = (await request<{ workspaces: ApiWorkspace[] }>('/api/v1/workspaces')).workspaces
  const diagrams = await Promise.all(workspaces.map(async (workspace) => {
    const projects = (await request<{ projects: ApiProject[] }>(`/api/v1/workspaces/${workspace.id}/projects`)).projects
    return Promise.all(projects.map(async (project) => {
      const listed = (await request<{ diagrams: ApiDiagramSummary[] }>(`/api/v1/projects/${project.id}/diagrams`)).diagrams
      return listed.map((diagram) => ({ ...diagram, projectId: project.id, projectName: project.name, workspaceId: workspace.id, workspaceName: workspace.name }))
    }))
  }))
  return diagrams.flat(2).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function loadCloudDiagram(diagramId: string) {
  const result = await request<{ diagram: { document: Record<string, unknown>; revision: number; projectId: string } }>(`/api/v1/diagrams/${diagramId}`)
  return result.diagram
}

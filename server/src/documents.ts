import { z } from 'zod'

const documentSchema = z.object({
  schemaVersion: z.string().min(1),
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  updatedAt: z.string().datetime(),
  nodes: z.array(z.unknown()),
  edges: z.array(z.unknown()),
}).passthrough()

const forbiddenKey = /(?:password|passphrase|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|private[_-]?key)/i

function containsSecret(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsSecret)
  if (!value || typeof value !== 'object') return false
  return Object.entries(value).some(([key, nested]) => forbiddenKey.test(key) || containsSecret(nested))
}

export function parseDiagramDocument(value: unknown) {
  const document = documentSchema.parse(value)
  if (containsSecret(document)) {
    throw new Error('diagram_document_contains_secret_like_field')
  }
  return document
}

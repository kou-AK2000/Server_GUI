import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'

dotenv.config({ path: process.env.ORDEN_ENV_FILE ?? fileURLToPath(new URL('../.env', import.meta.url)) })

const required = (name: string, fallback?: string) => {
  const value = process.env[name] ?? fallback
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

export const config = {
  port: Number(process.env.PORT ?? 8787),
  databaseUrl: required('DATABASE_URL'),
  // This is deliberately opt-in. Production must use a verified identity provider.
  allowDevelopmentIdentity: process.env.ORDEN_DEV_AUTH === 'true',
  allowedOrigin: process.env.ORDEN_ALLOWED_ORIGIN ?? 'http://localhost:5173',
}

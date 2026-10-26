import { readFile } from 'node:fs/promises'
import { pool } from './database.js'

const migration = await readFile(new URL('../migrations/001_initial.sql', import.meta.url), 'utf8')

try {
  await pool.query(migration)
  console.log('Orden database migration completed.')
} finally {
  await pool.end()
}

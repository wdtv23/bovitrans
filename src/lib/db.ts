import { Pool } from 'pg'

declare global {
  // eslint-disable-next-line no-var
  var _pgPool: Pool | undefined
}

// Singleton para no agotar conexiones en hot-reload de desarrollo.
const pool =
  globalThis._pgPool ??
  new Pool({ connectionString: process.env.DATABASE_URL })

if (process.env.NODE_ENV !== 'production') {
  globalThis._pgPool = pool
}

export default pool

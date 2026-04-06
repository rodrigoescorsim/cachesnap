import postgres from 'postgres'

declare global {
  var _sql: ReturnType<typeof postgres> | undefined
}

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL is not set')

// Singleton to avoid multiple connections in dev (hot reload)
const sql = global._sql ?? postgres(connectionString)
if (process.env.NODE_ENV !== 'production') global._sql = sql

export default sql

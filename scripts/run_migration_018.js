/* eslint-disable @typescript-eslint/no-require-imports */
const postgres = require('postgres')
const fs = require('fs')
const path = require('path')

const env = fs.readFileSync(path.join(__dirname, '../.env'), 'utf8')
const dbUrlMatch = env.match(/DATABASE_URL=(.+)/)
const dbUrl = dbUrlMatch ? dbUrlMatch[1].trim() : null

if (!dbUrl) { console.error('Could not find DATABASE_URL in .env'); process.exit(1) }

const sql = postgres(dbUrl)

async function run() {
  const sqlContent = fs.readFileSync(path.join(__dirname, '../migrations/018_rate_limit.sql'), 'utf8')
  console.log('Applying migration 018...')
  try {
    await sql.unsafe(sqlContent)
    console.log('Migration 018 applied successfully.')
  } catch (err) {
    console.error('Error:', err.message)
  } finally {
    await sql.end()
  }
}

run()

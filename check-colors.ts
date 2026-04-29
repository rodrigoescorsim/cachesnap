import sql from './src/lib/db'

async function checkColors() {
  const regions = await sql`SELECT id, label, color FROM regions WHERE enabled = true`
  console.log(JSON.stringify(regions, null, 2))
  process.exit(0)
}

checkColors()

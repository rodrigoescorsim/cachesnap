const postgres = require('postgres');
const fs = require('fs');
const path = require('path');

const env = fs.readFileSync(path.join(__dirname, '../.env'), 'utf8');
const dbUrl = env.split('\n').find(line => line.startsWith('DATABASE_URL=')).split('=')[1].trim();
const sql = postgres(dbUrl);

async function debug() {
  const monitors = await sql`SELECT id, url FROM monitors`;
  for(const m of monitors) {
    const [{ count }] = await sql`SELECT COUNT(*)::int as count FROM probe_results WHERE monitor_id = ${m.id} AND bypass_ttfb_ms IS NOT NULL`;
    console.log(`Monitor: ${m.url} | ID: ${m.id} | Bypass Results: ${count}`);
  }
  process.exit(0);
}

debug().catch(err => { console.error(err); process.exit(1); });

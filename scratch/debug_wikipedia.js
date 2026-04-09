const postgres = require('postgres');
const fs = require('fs');
const path = require('path');

const env = fs.readFileSync(path.join(__dirname, '../.env'), 'utf8');
const dbUrl = env.split('\n').find(line => line.startsWith('DATABASE_URL=')).split('=')[1].trim();
const sql = postgres(dbUrl);

async function debug() {
  const monitors = await sql`SELECT id, url FROM monitors WHERE url ILIKE '%wikipedia%'`;
  if (monitors.length === 0) {
    console.log("Wikipedia monitor not found.");
    process.exit(0);
  }

  const m = monitors[0];
  console.log(`Target: ${m.url} (ID: ${m.id})`);

  const results = await sql`
    SELECT region, served_by, ttfb_ms, time 
    FROM probe_results 
    WHERE monitor_id = ${m.id} 
    ORDER BY time DESC 
    LIMIT 20
  `;

  console.table(results);
  process.exit(0);
}

debug().catch(err => { console.error(err); process.exit(1); });

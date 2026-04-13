const postgres = require('postgres');
const fs = require('fs');
const path = require('path');

const env = fs.readFileSync(path.join(__dirname, '../.env'), 'utf8');
const dbUrlMatch = env.match(/DATABASE_URL=(.+)/);
const dbUrl = dbUrlMatch ? dbUrlMatch[1].trim() : null;

const sql = postgres(dbUrl);

async function run() {
  console.log('Checking last 5 audit results...');
  try {
    const results = await sql`
      SELECT time, region, edge_cache_status, origin_cache_status, edge_ttfb_ms 
      FROM audit_results 
      ORDER BY time DESC 
      LIMIT 10
    `;
    console.table(results);
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await sql.end();
  }
}

run();

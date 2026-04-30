/* eslint-disable @typescript-eslint/no-require-imports */
const postgres = require('postgres');
const fs = require('fs');
const path = require('path');

const env = fs.readFileSync(path.join(__dirname, '../.env'), 'utf8');
const dbUrl = env.split('\n').find(line => line.startsWith('DATABASE_URL=')).split('=')[1].trim();
const sql = postgres(dbUrl);

async function debug() {
  console.log('--- Deep Debug: Last 10 Probes ---');
  const results = await sql`
    SELECT 
      m.url, 
      pr.region, 
      pr.ttfb_ms, 
      pr.bypass_ttfb_ms, 
      pr.bypass_error,
      pr.error,
      pr.time 
    FROM probe_results pr
    JOIN monitors m ON m.id = pr.monitor_id
    ORDER BY pr.time DESC 
    LIMIT 10
  `;
  
  results.forEach(row => {
    console.log(`URL: ${row.url} | Reg: ${row.region} | TTFB: ${row.ttfb_ms} | Bypass: ${row.bypass_ttfb_ms} | B-Err: ${row.bypass_error || 'none'} | Err: ${row.error || 'none'}`);
  });

  process.exit(0);
}

debug().catch(err => {
  console.error(err);
  process.exit(1);
});

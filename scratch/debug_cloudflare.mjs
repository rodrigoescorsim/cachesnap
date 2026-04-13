import postgres from 'postgres';

const sql = postgres('postgresql://cachesnap:changeme_local@localhost:5432/cachesnap');

async function run() {
  console.log('--- Checking Cloudflare Cache Status Distribution ---');
  const results = await sql`
    SELECT 
      cache_status, 
      COUNT(*) as count,
      AVG(ttfb_ms) as avg_ttfb
    FROM probe_results
    WHERE monitor_id IN (SELECT id FROM monitors WHERE url ILIKE '%cloudflare.com%')
    GROUP BY cache_status
    ORDER BY count DESC;
  `;
  console.table(results);

  console.log('\n--- Checking Server Timing presence ---');
  const timings = await sql`
    SELECT 
      cache_status,
      server_timing,
      ttfb_ms
    FROM probe_results
    WHERE 
      monitor_id IN (SELECT id FROM monitors WHERE url ILIKE '%cloudflare.com%')
      AND server_timing IS NOT NULL
    LIMIT 5;
  `;
  console.table(timings);
  
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

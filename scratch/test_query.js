const postgres = require('postgres');
const fs = require('fs');
const path = require('path');

const env = fs.readFileSync(path.join(__dirname, '../.env'), 'utf8');
const dbUrlMatch = env.split('\n').find(line => line.startsWith('DATABASE_URL='));
const dbUrl = dbUrlMatch.split('=')[1].trim();
const sql = postgres(dbUrl);

async function check() {
  const userId = '...'; // I don't know the actual user id, but I can just query for all
  
  console.log('Running Dashboard Query Mock...');
  const results = await sql`
    WITH alert_counts AS (
      SELECT monitor_id, COUNT(*)::int AS cnt
      FROM alerts
      WHERE created_at > NOW() - INTERVAL '24 hours'
      GROUP BY monitor_id
    ),
    latest_security AS (
      SELECT DISTINCT ON (monitor_id)
        monitor_id,
        (security_headers->>'score')::int AS security_score
      FROM probe_results
      WHERE time > NOW() - INTERVAL '24 hours'
        AND security_headers IS NOT NULL
      ORDER BY monitor_id, time DESC
    )
    SELECT
      m.id,
      m.url,
      m.name,
      m.is_active,
      ROUND(AVG(pr.ttfb_ms)::numeric, 0)                          AS ttfb_avg_ms,
      ROUND(MAX(pr.ttfb_ms)::numeric, 0)                          AS ttfb_worst_ms,
      ROUND(AVG(pr.dns_ms)::numeric, 0)                           AS dns_avg_ms,
      ROUND(AVG(pr.tls_ms)::numeric, 0)                           AS tls_avg_ms,
      COUNT(*) FILTER (WHERE pr.error IS NOT NULL)::int            AS error_count,
      ROUND(
        100.0 * COUNT(*) FILTER (WHERE pr.cache_status = 'HIT')
               / NULLIF(COUNT(pr.time), 0),
        0
      )                                                            AS cache_hit_pct,
      MODE() WITHIN GROUP (ORDER BY pr.cache_status)               AS cache_status,
      ROUND(
        100.0 * COUNT(*) FILTER (WHERE pr.error IS NULL AND pr.status_code < 500)
               / NULLIF(COUNT(pr.time), 0),
        1
      )                                                            AS uptime_pct,
      ROUND(AVG(pr.redirect_count)::numeric, 0)                    AS redirect_avg,
      MAX(pr.time)                                                 AS last_probe_at,
      COALESCE(ac.cnt, 0)                                          AS alert_count,
      ls.security_score                                            AS security_score
    FROM monitors m
    LEFT JOIN probe_results pr ON pr.monitor_id = m.id
    LEFT JOIN alert_counts ac ON ac.monitor_id = m.id
    LEFT JOIN latest_security ls ON ls.monitor_id = m.id
    GROUP BY m.id, ac.cnt, ls.security_score
    ORDER BY alert_count DESC, m.created_at DESC
  `;
  
  console.log(`Query returned ${results.length} monitors`);
  results.forEach(m => {
    console.log(`ID: ${m.id} | URL: ${m.url} | Last: ${m.last_probe_at}`);
  });
  
  process.exit(0);
}

check().catch(err => {
  console.error(err);
  process.exit(1);
});

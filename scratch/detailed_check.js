const postgres = require('postgres');
const fs = require('fs');
const path = require('path');

const env = fs.readFileSync(path.join(__dirname, '../.env'), 'utf8');
const dbUrlMatch = env.split('\n').find(line => line.startsWith('DATABASE_URL='));
const dbUrl = dbUrlMatch.split('=')[1].trim();
const sql = postgres(dbUrl);

async function check() {
  console.log('Detailed Query Check...');
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
      COALESCE(ac.cnt, 0) AS alert_count,
      ls.security_score
    FROM monitors m
    LEFT JOIN probe_results pr ON pr.monitor_id = m.id
    LEFT JOIN alert_counts ac ON ac.monitor_id = m.id
    LEFT JOIN latest_security ls ON ls.monitor_id = m.id
    GROUP BY m.id, ac.cnt, ls.security_score
    ORDER BY m.created_at DESC
  `;
  
  results.forEach(m => {
    console.log(`ID: ${m.id.slice(0,8)} | Alerts: ${m.alert_count} | Sec: ${m.security_score} | URL: ${m.url}`);
  });
  
  process.exit(0);
}

check().catch(err => {
  console.error(err);
  process.exit(1);
});

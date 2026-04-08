import os
import postgres
import json

db_url = os.environ.get('DATABASE_URL')
db = postgres.Postgres(url=db_url)

query = """
SELECT 
    m.url, 
    pr.region, 
    pr.ttfb_ms, 
    pr.bypass_ttfb_ms, 
    pr.time 
FROM probe_results pr
JOIN monitors m ON m.id = pr.monitor_id
ORDER BY pr.time DESC 
LIMIT 10;
"""

print("Checking last 10 probe results:")
for row in db.query(query):
    print(f"URL: {row.url} | Region: {row.region} | TTFB: {row.ttfb_ms} | Bypass: {row.bypass_ttfb_ms} | Time: {row.time}")

# Check if there are ANY bypass results at all
bypass_count = db.one("SELECT COUNT(*) FROM probe_results WHERE bypass_ttfb_ms IS NOT NULL")
print(f"\nTotal results with bypass data: {bypass_count}")

const postgres = require('postgres');
const fs = require('fs');
const path = require('path');

const env = fs.readFileSync(path.join(__dirname, '../.env'), 'utf8');
const dbUrlMatch = env.split('\n').find(line => line.startsWith('DATABASE_URL='));
const dbUrl = dbUrlMatch.split('=')[1].trim();
const sql = postgres(dbUrl);

async function check() {
  const monitorId = 'ecdf9062-ac65-442c-8390-8813297b9e08';
  console.log(`Checking alerts for ${monitorId}...`);
  const alerts = await sql`SELECT * FROM alerts WHERE monitor_id = ${monitorId} ORDER BY created_at DESC`;
  console.table(alerts);
  process.exit(0);
}

check().catch(err => {
  console.error(err);
  process.exit(1);
});

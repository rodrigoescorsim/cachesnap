const postgres = require('postgres');
const fs = require('fs');
const path = require('path');

const env = fs.readFileSync(path.join(__dirname, '../.env'), 'utf8');
const dbUrlMatch = env.split('\n').find(line => line.startsWith('DATABASE_URL='));
if (!dbUrlMatch) {
    console.error('DATABASE_URL not found in .env');
    process.exit(1);
}
const dbUrl = dbUrlMatch.split('=')[1].trim();
const sql = postgres(dbUrl);

async function check() {
  console.log('Checking for suspicious monitors...');
  const monitors = await sql`
    SELECT id, url, name, is_active, created_at FROM monitors
    ORDER BY created_at DESC
  `;
  
  console.log(`Total monitors: ${monitors.length}`);
  monitors.forEach(m => {
    console.log(`[${m.id}] ${m.url} | Active: ${m.is_active} | Created: ${m.created_at}`);
  });
  
  process.exit(0);
}

check().catch(err => {
  console.error(err);
  process.exit(1);
});

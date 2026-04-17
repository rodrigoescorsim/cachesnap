const postgres = require('postgres');
const fs = require('fs');
const path = require('path');

const env = fs.readFileSync(path.join(__dirname, '../.env'), 'utf8');
const dbUrlMatch = env.split('\n').find(line => line.startsWith('DATABASE_URL='));
const dbUrl = dbUrlMatch.split('=')[1].trim();
const sql = postgres(dbUrl);

async function check() {
  const monitors = await sql`
    SELECT id, url, user_id FROM monitors
    WHERE url IN (
      'https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js',
      'https://github.com/fluidicon.png'
    )
  `;
  
  monitors.forEach(m => {
    console.log(`ID: ${m.id} | URL: ${m.url} | UserID: ${m.user_id}`);
  });
  
  const sessions = await sql`SELECT user_id FROM sessions`;
  console.log('Active user sessions in DB:', sessions.map(s => s.user_id));

  process.exit(0);
}

check().catch(err => {
  console.error(err);
  process.exit(1);
});

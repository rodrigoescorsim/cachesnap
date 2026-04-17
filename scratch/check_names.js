const postgres = require('postgres');
const fs = require('fs');
const path = require('path');

const env = fs.readFileSync(path.join(__dirname, '../.env'), 'utf8');
const dbUrlMatch = env.split('\n').find(line => line.startsWith('DATABASE_URL='));
const dbUrl = dbUrlMatch.split('=')[1].trim();
const sql = postgres(dbUrl);

async function check() {
  const monitors = await sql`
    SELECT id, url, name, is_active FROM monitors
    WHERE url IN (
      'https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js',
      'https://github.com/fluidicon.png'
    )
  `;
  
  monitors.forEach(m => {
    console.log(`ID: ${m.id} | Name: [${m.name}] | URL: ${m.url}`);
  });
  
  process.exit(0);
}

check().catch(err => {
  console.error(err);
  process.exit(1);
});

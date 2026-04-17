const postgres = require('postgres');
const fs = require('fs');
const path = require('path');

const env = fs.readFileSync(path.join(__dirname, '../.env'), 'utf8');
const dbUrlMatch = env.split('\n').find(line => line.startsWith('DATABASE_URL='));
const dbUrl = dbUrlMatch.split('=')[1].trim();
const sql = postgres(dbUrl);

async function check() {
  const triggers = await sql`
    SELECT trigger_name, event_manipulation, event_object_table, action_statement 
    FROM information_schema.triggers
  `;
  console.log('Triggers:', triggers);
  process.exit(0);
}

check().catch(err => {
  console.error(err);
  process.exit(1);
});

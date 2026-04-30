/* eslint-disable @typescript-eslint/no-require-imports */
const postgres = require('postgres');
const fs = require('fs');
const path = require('path');

// Read DATABASE_URL from .env file manually
const env = fs.readFileSync(path.join(__dirname, '../.env'), 'utf8');
const dbUrlMatch = env.match(/DATABASE_URL=(.+)/);
const dbUrl = dbUrlMatch ? dbUrlMatch[1].trim() : null;

if (!dbUrl) {
  console.error('Could not find DATABASE_URL in .env');
  process.exit(1);
}

const sql = postgres(dbUrl);

async function run() {
  const migPath = path.join(__dirname, '../migrations/010_add_origin_cache_to_audit.sql');
  const sqlContent = fs.readFileSync(migPath, 'utf8');
  
  console.log('Applying migration 010...');
  try {
    await sql.unsafe(sqlContent);
    console.log('Migration 010 applied successfully.');
  } catch (err) {
    console.error('Error applying migration:', err.message);
  } finally {
    await sql.end();
  }
}

run();

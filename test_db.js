/* eslint-disable */
const { db } = require('@vercel/postgres'); 
async function run() { 
  const client = await db.connect(); 
  const res = await client.query(`SELECT time_bucket('1h', created_at) AS bucket, COUNT(*)::int FROM alerts GROUP BY bucket ORDER BY bucket ASC LIMIT 5`); 
  console.log(res.rows); 
  client.release(); 
} 
run();

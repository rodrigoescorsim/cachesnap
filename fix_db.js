/* eslint-disable */
const { db } = require('@vercel/postgres'); 
async function run() { 
  const client = await db.connect(); 
  await client.query(`UPDATE alerts SET alert_type = 'TTFB_SPIKE_REGION' WHERE alert_type = 'OFFLINE' AND diagnosis LIKE '%Cache MISS%';`); 
  console.log("Updated bad mock data"); 
  client.release(); 
} 
run();

const postgres = require('postgres');

const dbUrl = process.env.DATABASE_URL || "postgresql://cachesnap:changeme_local@localhost:5432/cachesnap";
const sql = postgres(dbUrl);

async function checkIngest() {
    try {
        const results = await sql`
            SELECT region, ttfb_ms, time 
            FROM probe_results 
            ORDER BY time DESC 
            LIMIT 5
        `;
        console.log('--- Last 5 Probe Results ---');
        console.table(results);
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkIngest();

const postgres = require('postgres');

// Fallback to the URL from the .env I saw earlier
const dbUrl = process.env.DATABASE_URL || "postgresql://cachesnap:changeme_local@localhost:5432/cachesnap";
const sql = postgres(dbUrl);

async function checkRegions() {
    try {
        const regions = await sql`SELECT id, enabled, lambda_url FROM regions`;
        console.log('--- Regions Table ---');
        console.table(regions);
        
        const monitors = await sql`SELECT count(*) FROM monitors WHERE is_active = true`;
        console.log(`Active Monitors: ${monitors[0].count}`);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkRegions();

const postgres = require('postgres');
const fs = require('fs');
const path = require('path');

// Carrega a URL do banco do .env
const envPath = path.join(__dirname, '../.env');
const env = fs.readFileSync(envPath, 'utf8');
const dbUrl = env.split('\n')
  .find(line => line.startsWith('DATABASE_URL='))
  .split('=')[1]
  .trim()
  .replace(/^"|"$/g, ''); // Remove aspas se existirem

const sql = postgres(dbUrl);

async function runUpdate() {
  console.log('--- Aplicando atualização de cor para Oregon ---');
  try {
    const result = await sql`
      UPDATE regions 
      SET color = '#f97316' 
      WHERE id = 'us-west'
    `;
    console.log('Sucesso: Cor do Oregon alterada para Coral (#f97316)');
  } catch (err) {
    console.error('Erro ao atualizar banco:', err);
  } finally {
    await sql.end();
    process.exit(0);
  }
}

runUpdate();

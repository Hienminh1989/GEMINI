const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres.nahnbiidpdqfnrqcpzxz:b2Aaqq7trcCyr6KM@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  const res = await client.query("SELECT id, date_str FROM duty_shifts WHERE date_str IS NULL OR date_str = '' LIMIT 10");
  console.log(res.rows);
  await client.end();
}
run().catch(console.error);

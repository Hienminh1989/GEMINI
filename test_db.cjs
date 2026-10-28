const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres.nahnbiidpdqfnrqcpzxz:b2Aaqq7trcCyr6KM@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  const res = await client.query("SELECT data FROM settings WHERE id = 'config'");
  console.log(res.rows[0].data);
  await client.end();
}
run().catch(console.error);

const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres.nahnbiidpdqfnrqcpzxz:b2Aaqq7trcCyr6KM@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  const res = await client.query("SELECT * FROM attendance_failed ORDER BY id DESC LIMIT 5");
  console.log(JSON.stringify(res.rows, null, 2));
  await client.end();
}
run().catch(console.error);

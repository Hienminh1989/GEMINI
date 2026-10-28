const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres.nahnbiidpdqfnrqcpzxz:b2Aaqq7trcCyr6KM@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  let res = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'attendance'");
  console.log("attendance:", res.rows);
  res = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'attendance_failed'");
  console.log("attendance_failed:", res.rows);
  await client.end();
}
run().catch(console.error);

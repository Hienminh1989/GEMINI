import { Pool } from 'pg';
const client = new Pool({
  ssl: { rejectUnauthorized: false },
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres.nahnbiidpdqfnrqcpzxz:b2Aaqq7trcCyr6KM@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres'
});
async function test() {
  const res = await client.query('SELECT * FROM special_employees');
  console.log(res.rows);
  client.end();
}
test();

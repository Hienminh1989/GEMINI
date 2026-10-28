const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres.nahnbiidpdqfnrqcpzxz:b2Aaqq7trcCyr6KM@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres' });
async function main() {
  const res = await pool.query("SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN ('special_employees', 'attendance');");
  console.log(res.rows);
  pool.end();
}
main();

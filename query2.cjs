const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres.nahnbiidpdqfnrqcpzxz:b2Aaqq7trcCyr6KM@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres' });
async function main() {
  const res = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';");
  console.log(res.rows);
  pool.end();
}
main();

const { Pool } = require('pg');
const pool = new Pool({
  ssl: { rejectUnauthorized: false },
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres.nahnbiidpdqfnrqcpzxz:b2Aaqq7trcCyr6KM@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres'
});

async function check() {
  const c = await pool.query(`SELECT * FROM user_devices LIMIT 5`);
  console.log(c.rows);
  await pool.end();
}
check();

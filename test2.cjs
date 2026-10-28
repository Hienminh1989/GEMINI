const { Pool } = require('pg');
const pool = new Pool({
  ssl: { rejectUnauthorized: false },
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres.nahnbiidpdqfnrqcpzxz:b2Aaqq7trcCyr6KM@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres'
});

async function check() {
  const c = await pool.query(`SELECT data FROM settings WHERE id = 'config'`);
  console.log(c.rows[0].data);
  await pool.end();
}
check();

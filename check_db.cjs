const { Pool } = require('pg');
const pool = new Pool({
  ssl: { rejectUnauthorized: false },
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres.nahnbiidpdqfnrqcpzxz:b2Aaqq7trcCyr6KM@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres'
});

async function check() {
  try {
    // Top 5 largest tables
    const tableRes = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM attendance) as attendance_count,
        (SELECT COUNT(*) FROM attendance_failed) as failed_count
    `);
    console.log(tableRes.rows[0]);
  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}
check();

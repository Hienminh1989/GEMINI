const { Pool } = require('pg');
const pool = new Pool({
  ssl: { rejectUnauthorized: false },
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres.nahnbiidpdqfnrqcpzxz:b2Aaqq7trcCyr6KM@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres'
});

async function check() {
  const users = await pool.query(`SELECT uid, name, department FROM users LIMIT 1`);
  if (users.rows.length > 0) {
     const u = users.rows[0];
     // Insert a fake device binding for this user
     await pool.query(`
        INSERT INTO user_devices (user_id, user_name, department, device_fingerprint)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT(user_id) DO UPDATE SET device_fingerprint = $4
     `, [u.uid, u.name, u.department, 'fake-fp-123']);
     console.log("User:", u);
  }
  await pool.end();
}
check();

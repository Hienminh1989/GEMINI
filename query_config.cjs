const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_1aZHYD2GcwjX@ep-crimson-brook-a1599u9a-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require'
});
async function run() {
  const res = await pool.query("SELECT data FROM settings WHERE id = 'config'");
  console.log(JSON.stringify(res.rows, null, 2));
  process.exit(0);
}
run();

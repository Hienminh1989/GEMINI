import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  const res = await pool.query('SELECT * FROM special_employees');
  console.log(JSON.stringify(res.rows, null, 2));
  process.exit(0);
}
run();

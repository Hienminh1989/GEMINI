import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  const res = await pool.query('SELECT * FROM attendance WHERE id = 7078');
  console.log(JSON.stringify(res.rows[0], null, 2));
  process.exit(0);
}
run();

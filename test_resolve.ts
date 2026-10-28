import { Pool } from 'pg';
import { format, differenceInMinutes, parseISO } from 'date-fns';

const client = new Pool({
  ssl: { rejectUnauthorized: false },
  connectionString: process.env.DATABASE_URL
});

async function test() {
  const result = await client.query('SELECT NOW()');
  console.log(result.rows[0]);
  client.end();
}
test();

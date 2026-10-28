const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres:b2Aaqq7trcCyr6KM@db.nahnbiidpdqfnrqcpzxz.supabase.co:5432/postgres'
});
async function run() {
  await client.connect();
  const res = await client.query('SELECT * FROM special_employees LIMIT 5');
  console.log("special_employees:", res.rows);
  await client.end();
}
run();

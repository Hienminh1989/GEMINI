const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres:b2Aaqq7trcCyr6KM@db.nahnbiidpdqfnrqcpzxz.supabase.co:5432/postgres'
});
async function run() {
  await client.connect();
  const tables = ['users', 'attendance', 'special_employees', 'attendance_failed'];
  for (const table of tables) {
    console.log(`\n--- ${table} ---`);
    const res = await client.query(`
      SELECT column_name, data_type, character_maximum_length
      FROM information_schema.columns
      WHERE table_name = $1;
    `, [table]);
    res.rows.forEach(r => console.log(`${r.column_name}: ${r.data_type}`));
  }
  await client.end();
}
run();

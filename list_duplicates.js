const { Client } = require('pg');
const client = new Client({
  connectionString: process.env.DATABASE_URL
});
async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT name, count(*) as c
    FROM users
    GROUP BY name
    HAVING count(*) > 1
  `);
  if (res.rows.length === 0) {
    console.log("No duplicates found.");
  } else {
    for (const row of res.rows) {
      console.log(`Name: ${row.name}, Count: ${row.c}`);
      const res2 = await client.query('SELECT * FROM users WHERE name = $1', [row.name]);
      for (const u of res2.rows) {
        console.log(`  - UID: ${u.uid}, Email: ${u.email}, Dept: ${u.department}`);
      }
    }
  }
  await client.end();
}
run().catch(console.error);

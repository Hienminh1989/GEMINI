const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres.nahnbiidpdqfnrqcpzxz:b2Aaqq7trcCyr6KM@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
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
    console.log("Không có người nào trùng họ tên.");
  } else {
    for (const row of res.rows) {
      console.log(`Họ tên: ${row.name} (Số lượng: ${row.c})`);
      const res2 = await client.query('SELECT * FROM users WHERE name = $1', [row.name]);
      for (const u of res2.rows) {
        console.log(`  - UID: ${u.uid}, Phòng ban: ${u.department}, Vị trí: ${u.position}, Email: ${u.email}`);
      }
    }
  }
  await client.end();
}
run().catch(console.error);

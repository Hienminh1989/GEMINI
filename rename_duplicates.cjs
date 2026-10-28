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
  
  const suffix = ['A', 'B', 'C', 'D', 'E'];
  let updatedCount = 0;

  for (const row of res.rows) {
    const res2 = await client.query('SELECT uid, name FROM users WHERE name = $1 ORDER BY uid::int ASC', [row.name]);
    
    for (let i = 0; i < res2.rows.length; i++) {
      const u = res2.rows[i];
      const newName = `${u.name} (${suffix[i]})`;
      console.log(`Renaming ${u.uid}: ${u.name} -> ${newName}`);
      await client.query('UPDATE users SET name = $1 WHERE uid = $2', [newName, u.uid]);
      updatedCount++;
    }
  }
  
  console.log(`Updated ${updatedCount} users.`);
  await client.end();
}
run().catch(console.error);

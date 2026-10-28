const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres:b2Aaqq7trcCyr6KM@db.nahnbiidpdqfnrqcpzxz.supabase.co:5432/postgres'
});
async function run() {
  await client.connect();
  
  // Delete orphaned attendance records
  const res = await client.query(`
    DELETE FROM attendance 
    WHERE user_id NOT IN (SELECT uid FROM users);
  `);
  console.log("Deleted orphaned attendance:", res.rowCount);

  try {
    await client.query(`
      ALTER TABLE attendance 
      ADD CONSTRAINT fk_attendance_user 
      FOREIGN KEY (user_id) 
      REFERENCES users (uid) 
      ON DELETE CASCADE;
    `);
    console.log("Added FK to attendance");
  } catch (e) {
    console.log("Error attendance:", e.message);
  }

  await client.end();
}
run();

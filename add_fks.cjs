const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres:b2Aaqq7trcCyr6KM@db.nahnbiidpdqfnrqcpzxz.supabase.co:5432/postgres'
});
async function run() {
  await client.connect();
  
  // Try to add foreign keys. Might fail if there are orphaned records.
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

  try {
    await client.query(`
      ALTER TABLE attendance_failed 
      ADD CONSTRAINT fk_attendance_failed_user 
      FOREIGN KEY (user_id) 
      REFERENCES users (uid) 
      ON DELETE CASCADE;
    `);
    console.log("Added FK to attendance_failed");
  } catch (e) {
    console.log("Error attendance_failed:", e.message);
  }

  await client.end();
}
run();

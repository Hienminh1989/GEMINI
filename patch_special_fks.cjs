const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres:b2Aaqq7trcCyr6KM@db.nahnbiidpdqfnrqcpzxz.supabase.co:5432/postgres'
});
async function run() {
  await client.connect();
  
  try {
    await client.query(`
      ALTER TABLE special_employees 
      ADD COLUMN user_id VARCHAR(255);
    `);
    console.log("Added user_id column");
  } catch (e) {
    console.log("Error adding column:", e.message);
  }

  // Populate existing data? The table is empty, so we don't need to populate.

  try {
    await client.query(`
      ALTER TABLE special_employees 
      ADD CONSTRAINT fk_special_employee_user 
      FOREIGN KEY (user_id) 
      REFERENCES users (uid) 
      ON DELETE CASCADE;
    `);
    console.log("Added FK to special_employees");
  } catch (e) {
    console.log("Error adding FK:", e.message);
  }

  await client.end();
}
run();

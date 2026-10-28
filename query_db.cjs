const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_1aZHYD2GcwjX@ep-crimson-brook-a1599u9a-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require'
});
async function run() {
  await pool.query(`
    INSERT INTO users (uid, name, department) 
    VALUES ('1001', 'Test Mom', 'Khoa Nhi') 
    ON CONFLICT (uid) DO NOTHING;
    
    INSERT INTO special_employees (user_id, user_name, department, employee_type, early_minutes)
    VALUES ('1001', 'Test Mom', 'Khoa Nhi', 'Nuôi con nhỏ', 30)
    ON CONFLICT DO NOTHING;
  `);
  console.log('Test mom setup');
  process.exit(0);
}
run();

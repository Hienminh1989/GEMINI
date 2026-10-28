import { Pool } from 'pg';

const client = new Pool({
  ssl: { rejectUnauthorized: false },
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres.nahnbiidpdqfnrqcpzxz:b2Aaqq7trcCyr6KM@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres'
});

async function main() {
  await client.query(`
    CREATE TABLE IF NOT EXISTS duty_shifts (
      id SERIAL PRIMARY KEY,
      employee_id VARCHAR(255),
      shift_start_datetime TIMESTAMP WITH TIME ZONE,
      shift_end_datetime TIMESTAMP WITH TIME ZONE,
      shift_type VARCHAR(255),
      status VARCHAR(50) DEFAULT 'active',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);
  
  await client.query(`
      ALTER TABLE attendance ADD COLUMN IF NOT EXISTS applied_schedule JSONB;
      ALTER TABLE attendance ADD COLUMN IF NOT EXISTS shift_id VARCHAR(50);
  `);

  console.log("duty_shifts created and attendance altered!");
  await client.end();
}
main();

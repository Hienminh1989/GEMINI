import { Client } from 'pg';

const client = new Client({
  connectionString: 'postgresql://postgres:b2Aaqq7trcCyr6KM@db.nahnbiidpdqfnrqcpzxz.supabase.co:5432/postgres'
});

async function main() {
  await client.connect();
  console.log("Connected to Postgres!");
  
  // Create tables for our app matching the Firestore data structure

  await client.query(`
    CREATE TABLE IF NOT EXISTS users (
      uid VARCHAR(255) PRIMARY KEY,
      email VARCHAR(255) UNIQUE,
      name VARCHAR(255),
      role VARCHAR(50),
      department VARCHAR(255)
    );
  `);
  
  await client.query(`
    CREATE TABLE IF NOT EXISTS settings (
      id VARCHAR(255) PRIMARY KEY,
      data JSONB
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS qr_codes (
      id VARCHAR(255) PRIMARY KEY,
      token VARCHAR(255)
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS attendance (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR(255),
      user_name VARCHAR(255),
      department VARCHAR(255),
      timestamp BIGINT,
      date_str VARCHAR(255),
      status VARCHAR(50),
      type VARCHAR(50),
      location JSONB,
      device_info JSONB,
      reason TEXT,
      shift VARCHAR(50),
      late_minutes INTEGER,
      early_leave_minutes INTEGER
    );
  `);
  
  await client.query(`
    CREATE TABLE IF NOT EXISTS departments (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255)
    );
  `);
  
  console.log("Database initialized");
  await client.end();
}

main().catch(console.error);

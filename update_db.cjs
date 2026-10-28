const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres.nahnbiidpdqfnrqcpzxz:b2Aaqq7trcCyr6KM@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  const res = await client.query("SELECT data FROM settings WHERE id = 'config'");
  let config = res.rows[0].data || {};
  config.targetLat = 19.867467;
  config.targetLng = 105.676884;
  config.radius = 600; // Just to be safe, I'll set it to 600m
  await client.query("UPDATE settings SET data = $1 WHERE id = 'config'", [config]);
  console.log("Updated config to:", config);
  await client.end();
}
run().catch(console.error);

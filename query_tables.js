const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres:b2Aaqq7trcCyr6KM@db.nahnbiidpdqfnrqcpzxz.supabase.co:5432/postgres'
});
client.connect()
  .then(() => client.query("SELECT table_name, column_name, data_type, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'departments';"))
  .then(res => {
    console.table(res.rows);
    process.exit(0);
  });

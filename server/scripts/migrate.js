// Applies db/schema.sql to DATABASE_URL. Idempotent.
require('dotenv').config({ path: require('node:path').resolve(__dirname, '..', '..', '.env') }); require('dotenv').config({ path: require('node:path').resolve(__dirname, '..', '.env') });
const { Pool } = require('pg');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set — nothing to migrate (file store will be used).');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  await pool.query(sql);
  await pool.end();
  console.log('Schema applied.');
})().catch((e) => { console.error(e); process.exit(1); });

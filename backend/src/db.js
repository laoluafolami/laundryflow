const { Pool } = require('pg');
const { log } = require('./log');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Azure PostgreSQL requires TLS. Locally (docker) we leave it off.
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});
pool.on('error', (e) => log('error', 'idle pool client error', { err: e.message }));

module.exports = { pool };

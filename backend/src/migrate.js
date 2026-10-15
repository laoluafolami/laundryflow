const fs = require('fs');
const path = require('path');
const { pool } = require('./db');
const { log } = require('./log');

// Tiny migration runner. An advisory lock makes sure only ONE container migrates at a time
// (important during blue/green deploys when two versions briefly overlap).
async function migrate() {
  const dir = path.join(__dirname, '..', 'migrations');
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(727274)');
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz DEFAULT now())'
    );
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    for (const f of files) {
      const done = await client.query('SELECT 1 FROM schema_migrations WHERE name=$1', [f]);
      if (done.rowCount) continue;
      log('info', 'applying migration', { file: f });
      await client.query('BEGIN');
      try {
        await client.query(fs.readFileSync(path.join(dir, f), 'utf8'));
        await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [f]);
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(727274)').catch(() => {});
    client.release();
  }
}
module.exports = { migrate };

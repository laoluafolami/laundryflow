require('./telemetry'); // keep first
const { createApp } = require('./app');
const { migrate } = require('./migrate');
const { pool } = require('./db');
const { log } = require('./log');

for (const k of ['DATABASE_URL', 'JWT_SECRET', 'ADMIN_PASSWORD']) {
  if (!process.env[k]) { log('error', `missing env var ${k}`); process.exit(1); } // fail fast
}

(async () => {
  await migrate();
  const port = Number(process.env.PORT) || 3000;
  const server = createApp().listen(port, () =>
    log('info', 'server started', { port, version: process.env.APP_VERSION || 'dev' }));

  // Graceful shutdown: finish in-flight requests before exiting (this is what makes deploys zero-downtime).
  const stop = (sig) => {
    log('info', 'shutting down', { sig });
    server.close(async () => { await pool.end(); process.exit(0); });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));
})().catch((e) => { log('error', 'startup failed', { err: e.message }); process.exit(1); });

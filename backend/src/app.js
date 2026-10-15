const crypto = require('crypto');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const { pool } = require('./db');
const { log } = require('./log');

const STATUSES = ['received', 'washing', 'drying', 'ready', 'delivered', 'cancelled'];
const httpError = (status, message) => Object.assign(new Error(message), { status });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();

function createApp() {
  const app = express();
  app.set('trust proxy', 1); // we sit behind Caddy
  app.use(helmet());
  app.use(express.json({ limit: '100kb' }));

  // One JSON log line per request (method, path, status, duration).
  app.use((req, res, next) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      if (req.path === '/healthz' || req.path === '/readyz') return;
      log('info', 'request', {
        method: req.method, path: req.path, status: res.statusCode,
        ms: Number(process.hrtime.bigint() - start) / 1e6,
      });
    });
    next();
  });

  // ---- Health endpoints (used by Docker, deploy script, Azure availability test) ----
  app.get('/healthz', (req, res) => res.json({ status: 'ok', version: process.env.APP_VERSION || 'dev' }));
  app.get('/readyz', wrap(async (req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ready', version: process.env.APP_VERSION || 'dev' });
    } catch (e) {
      res.status(503).json({ status: 'db-unavailable' });
    }
  }));

  // ---- Auth ----
  const loginLimiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false });
  app.post('/api/auth/login', loginLimiter, (req, res) => {
    const ok = crypto.timingSafeEqual(sha(req.body?.password ?? ''), sha(process.env.ADMIN_PASSWORD ?? ''));
    if (!ok) return res.status(401).json({ error: 'Wrong password' });
    const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '12h' });
    res.json({ token });
  });

  const requireAuth = (req, res, next) => {
    const h = req.headers.authorization || '';
    try {
      jwt.verify(h.replace(/^Bearer /, ''), process.env.JWT_SECRET);
      next();
    } catch {
      res.status(401).json({ error: 'Unauthorized' });
    }
  };
  app.use('/api', (req, res, next) => (req.path === '/auth/login' ? next() : requireAuth(req, res, next)));

  // ---- Customers ----
  app.get('/api/customers', wrap(async (req, res) => {
    const q = `%${req.query.q || ''}%`;
    const r = await pool.query(
      `SELECT c.*, COUNT(o.id)::int AS orders
         FROM customers c LEFT JOIN orders o ON o.customer_id = c.id
        WHERE c.name ILIKE $1 OR c.phone ILIKE $1
        GROUP BY c.id ORDER BY c.created_at DESC LIMIT 200`, [q]);
    res.json(r.rows);
  }));

  app.post('/api/customers', wrap(async (req, res) => {
    const { name, phone, email, address } = req.body || {};
    if (!name || String(name).trim().length < 2) throw httpError(400, 'Name is required');
    const r = await pool.query(
      'INSERT INTO customers(name, phone, email, address) VALUES ($1,$2,$3,$4) RETURNING *',
      [String(name).trim(), phone || null, email || null, address || null]);
    res.status(201).json(r.rows[0]);
  }));

  // ---- Services ----
  app.get('/api/services', wrap(async (req, res) => {
    const r = await pool.query('SELECT id, name, unit, price::float AS price FROM services WHERE active ORDER BY id');
    res.json(r.rows);
  }));

  // ---- Orders (the "search" feature lives here: ?q= matches customer name or order #) ----
  app.get('/api/orders', wrap(async (req, res) => {
    const { status, q } = req.query;
    // TRAINING ONLY: simulates a flaky search feature (Part B of the challenge). 0 = off (default).
    const chaos = Number(process.env.CHAOS_SEARCH_FAIL_RATE || 0);
    if (q && chaos > 0 && Math.random() < chaos) throw httpError(500, 'simulated search failure');
    const params = [];
    let where = 'WHERE 1=1';
    if (status && STATUSES.includes(status)) { params.push(status); where += ` AND o.status = $${params.length}`; }
    if (q) {
      params.push(`%${q}%`);
      where += ` AND (c.name ILIKE $${params.length} OR o.id::text ILIKE $${params.length} OR c.phone ILIKE $${params.length})`;
    }
    const r = await pool.query(
      `SELECT o.id, o.status, o.total::float AS total, o.pickup_date, o.notes, o.created_at,
              c.id AS customer_id, c.name AS customer_name, c.phone AS customer_phone
         FROM orders o JOIN customers c ON c.id = o.customer_id
         ${where} ORDER BY o.created_at DESC LIMIT 200`, params);
    res.json(r.rows);
  }));

  app.get('/api/orders/:id', wrap(async (req, res) => {
    const o = await pool.query(
      `SELECT o.*, o.total::float AS total, c.name AS customer_name
         FROM orders o JOIN customers c ON c.id=o.customer_id WHERE o.id=$1`, [req.params.id]);
    if (!o.rowCount) throw httpError(404, 'Order not found');
    const items = await pool.query(
      `SELECT oi.quantity::float AS quantity, oi.unit_price::float AS unit_price, s.name, s.unit
         FROM order_items oi JOIN services s ON s.id=oi.service_id WHERE oi.order_id=$1`, [req.params.id]);
    res.json({ ...o.rows[0], items: items.rows });
  }));

  app.post('/api/orders', wrap(async (req, res) => {
    const { customer_id, items, notes, pickup_date } = req.body || {};
    if (!Number.isInteger(customer_id) || !Array.isArray(items) || !items.length)
      throw httpError(400, 'customer_id and at least one item are required');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const sv = await client.query(
        'SELECT id, price FROM services WHERE active AND id = ANY($1::int[])', [items.map((i) => i.service_id)]);
      const price = new Map(sv.rows.map((r) => [r.id, Number(r.price)]));
      let total = 0;
      const lines = items.map((it) => {
        const qty = Number(it.quantity);
        if (!price.has(it.service_id) || !(qty > 0) || qty > 1000) throw httpError(400, 'Invalid item');
        total += price.get(it.service_id) * qty; // price is decided by the SERVER, never the browser
        return { service_id: it.service_id, qty, unit_price: price.get(it.service_id) };
      });
      const o = await client.query(
        'INSERT INTO orders(customer_id, notes, pickup_date, total) VALUES ($1,$2,$3,$4) RETURNING *',
        [customer_id, notes || null, pickup_date || null, total.toFixed(2)]);
      for (const l of lines) {
        await client.query(
          'INSERT INTO order_items(order_id, service_id, quantity, unit_price) VALUES ($1,$2,$3,$4)',
          [o.rows[0].id, l.service_id, l.qty, l.unit_price]);
      }
      await client.query('COMMIT');
      res.status(201).json(o.rows[0]);
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }));

  app.patch('/api/orders/:id/status', wrap(async (req, res) => {
    const { status } = req.body || {};
    if (!STATUSES.includes(status)) throw httpError(400, 'Invalid status');
    const r = await pool.query(
      'UPDATE orders SET status=$1, updated_at=now() WHERE id=$2 RETURNING id, status', [status, req.params.id]);
    if (!r.rowCount) throw httpError(404, 'Order not found');
    res.json(r.rows[0]);
  }));

  // ---- Dashboard stats ----
  app.get('/api/stats', wrap(async (req, res) => {
    const [byStatus, week, totals] = await Promise.all([
      pool.query('SELECT status, COUNT(*)::int AS count FROM orders GROUP BY status'),
      pool.query(
        `SELECT to_char(d::date,'Dy') AS day,
                COALESCE(SUM(o.total) FILTER (WHERE o.status <> 'cancelled'),0)::float AS revenue,
                COUNT(o.id)::int AS orders
           FROM generate_series(current_date-6, current_date, '1 day') d
           LEFT JOIN orders o ON o.created_at::date = d::date
          GROUP BY d ORDER BY d`),
      pool.query(
        `SELECT COALESCE(SUM(total) FILTER (WHERE status <> 'cancelled' AND created_at::date = current_date),0)::float AS revenue_today,
                COUNT(*) FILTER (WHERE status NOT IN ('delivered','cancelled'))::int AS active_orders,
                (SELECT COUNT(*)::int FROM customers) AS customers
           FROM orders`),
    ]);
    res.json({ byStatus: byStatus.rows, week: week.rows, ...totals.rows[0] });
  }));

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  // ---- Serve the built React app (same origin = no CORS headaches) ----
  const pub = path.join(__dirname, '..', 'public');
  app.use(express.static(pub));
  app.get('*', (req, res) => res.sendFile(path.join(pub, 'index.html'), (err) => err && res.status(404).end()));

  // ---- Error handler ----
  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    const status = err.status || (err.code === '23503' ? 400 : 500);
    if (status >= 500) log('error', 'unhandled error', { path: req.path, err: err.message });
    res.status(status).json({ error: status >= 500 ? 'Internal server error' : err.message });
  });

  return app;
}
module.exports = { createApp };

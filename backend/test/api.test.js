const { test, before, after } = require('node:test');
const assert = require('node:assert');
process.env.JWT_SECRET = 'test-secret';
process.env.ADMIN_PASSWORD = 'test-pass';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://laundry:laundry@localhost:5432/laundry';
const { createApp } = require('../src/app');
const { migrate } = require('../src/migrate');
const { pool } = require('../src/db');

let server, base, token;
before(async () => {
  await migrate();
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.close(); await pool.end(); });

const call = (p, opts = {}) => fetch(base + p, {
  ...opts,
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...opts.headers },
});

test('healthz and readyz are public', async () => {
  assert.equal((await call('/healthz')).status, 200);
  assert.equal((await call('/readyz')).status, 200);
});

test('API rejects requests without a token', async () => {
  assert.equal((await call('/api/orders')).status, 401);
});

test('login fails with a wrong password, works with the right one', async () => {
  const bad = await call('/api/auth/login', { method: 'POST', body: JSON.stringify({ password: 'nope' }) });
  assert.equal(bad.status, 401);
  const good = await call('/api/auth/login', { method: 'POST', body: JSON.stringify({ password: 'test-pass' }) });
  assert.equal(good.status, 200);
  token = (await good.json()).token;
});

test('create customer -> create order (server computes total) -> search -> change status', async () => {
  const c = await (await call('/api/customers', { method: 'POST', body: JSON.stringify({ name: 'Test Customer', phone: '0800' }) })).json();
  const services = await (await call('/api/services')).json();
  const o = await (await call('/api/orders', {
    method: 'POST', body: JSON.stringify({ customer_id: c.id, items: [{ service_id: services[0].id, quantity: 4 }] }),
  })).json();
  assert.equal(Number(o.total), services[0].price * 4);
  const found = await (await call('/api/orders?q=Test%20Customer')).json();
  assert.ok(found.some((x) => x.id === o.id));
  const upd = await call(`/api/orders/${o.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'washing' }) });
  assert.equal(upd.status, 200);
  const bad = await call(`/api/orders/${o.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'flying' }) });
  assert.equal(bad.status, 400);
});

CREATE TABLE customers (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  phone      TEXT,
  email      TEXT,
  address    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE services (
  id     SERIAL PRIMARY KEY,
  name   TEXT NOT NULL UNIQUE,
  unit   TEXT NOT NULL CHECK (unit IN ('kg','item')),
  price  NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE orders (
  id          SERIAL PRIMARY KEY,
  customer_id INT NOT NULL REFERENCES customers(id),
  status      TEXT NOT NULL DEFAULT 'received'
              CHECK (status IN ('received','washing','drying','ready','delivered','cancelled')),
  pickup_date DATE,
  notes       TEXT,
  total       NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE order_items (
  id         SERIAL PRIMARY KEY,
  order_id   INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  service_id INT NOT NULL REFERENCES services(id),
  quantity   NUMERIC(8,2) NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(10,2) NOT NULL
);

CREATE INDEX idx_orders_status  ON orders(status);
CREATE INDEX idx_orders_created ON orders(created_at);
CREATE INDEX idx_orders_customer ON orders(customer_id);

INSERT INTO services (name, unit, price) VALUES
  ('Wash & Fold',        'kg',   2.50),
  ('Dry Cleaning',       'item', 6.00),
  ('Ironing / Pressing', 'item', 1.50),
  ('Duvet / Bedding',    'item', 12.00),
  ('Express Service',    'kg',   1.50);

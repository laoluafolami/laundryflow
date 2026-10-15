INSERT INTO services (name, unit, price) VALUES ('Shoe Cleaning', 'item', 8.00)
ON CONFLICT (name) DO NOTHING;
-- Chạy script này trong Supabase: SQL Editor → New query → Run

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  tg_id BIGINT UNIQUE NOT NULL,
  username TEXT DEFAULT '',
  first_name TEXT DEFAULT '',
  balance NUMERIC(12, 0) DEFAULT 0,
  role TEXT DEFAULT 'user',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categories (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  price NUMERIC(12, 0) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS items (
  id BIGSERIAL PRIMARY KEY,
  category_id BIGINT REFERENCES categories(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  status TEXT DEFAULT 'available',
  buyer_id BIGINT,
  sold_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
  id BIGSERIAL PRIMARY KEY,
  order_code BIGINT UNIQUE NOT NULL,
  tg_id BIGINT NOT NULL,
  amount NUMERIC(12, 0) NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
  tg_id BIGINT NOT NULL,
  category_id BIGINT REFERENCES categories(id),
  item_id BIGINT REFERENCES items(id),
  price NUMERIC(12, 0) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_tg_id ON users(tg_id);
CREATE INDEX IF NOT EXISTS idx_items_category_status ON items(category_id, status);
CREATE INDEX IF NOT EXISTS idx_transactions_order_code ON transactions(order_code);
CREATE INDEX IF NOT EXISTS idx_orders_tg_id ON orders(tg_id);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Cho phép anon key (bot backend) đọc/ghi toàn bộ
CREATE POLICY "anon_all_users" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_categories" ON categories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_items" ON items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_transactions" ON transactions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_orders" ON orders FOR ALL USING (true) WITH CHECK (true);
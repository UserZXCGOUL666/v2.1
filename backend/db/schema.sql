CREATE TABLE IF NOT EXISTS admin_users (
  id TEXT PRIMARY KEY,
  email VARCHAR(320) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(30) NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  sku VARCHAR(100) UNIQUE NOT NULL,
  slug VARCHAR(180) UNIQUE NOT NULL,
  title VARCHAR(180) NOT NULL,
  brand VARCHAR(180) NOT NULL,
  gender VARCHAR(20) NOT NULL CHECK (gender IN ('male', 'female', 'unisex')),
  concentration VARCHAR(20) NOT NULL CHECK (concentration IN ('EDT', 'EDP', 'Parfum')),
  volume_ml INTEGER NOT NULL CHECK (volume_ml > 0),
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  compare_at_price_cents INTEGER CHECK (compare_at_price_cents IS NULL OR compare_at_price_cents >= 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  image_tone VARCHAR(30) NOT NULL DEFAULT 'amber',
  description TEXT NOT NULL DEFAULT '',
  category VARCHAR(20) NOT NULL CHECK (category IN ('new', 'hit', 'sale', 'classic')),
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_images (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  public_id TEXT NOT NULL,
  alt_text VARCHAR(250) NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_images_product_position
  ON product_images(product_id, position);

CREATE TABLE IF NOT EXISTS product_notes (
  id BIGSERIAL PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  tier VARCHAR(20) NOT NULL CHECK (tier IN ('top', 'middle', 'base')),
  name VARCHAR(120) NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_product_notes_product_tier
  ON product_notes(product_id, tier, position);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  status VARCHAR(30) NOT NULL DEFAULT 'created',
  customer_name VARCHAR(180) NOT NULL DEFAULT '',
  phone VARCHAR(80) NOT NULL DEFAULT '',
  city VARCHAR(180) NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  comment TEXT NOT NULL DEFAULT '',
  delivery_method VARCHAR(40) NOT NULL DEFAULT 'delivery',
  payment_method VARCHAR(40) NOT NULL DEFAULT 'cash_on_delivery',
  telegram_user_id TEXT,
  total_amount_cents INTEGER NOT NULL DEFAULT 0,
  currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
  title_snapshot VARCHAR(180) NOT NULL,
  price_snapshot_cents INTEGER NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS idx_products_status_updated ON products(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT,
  password_hash TEXT,
  google_sub TEXT UNIQUE,
  phone TEXT UNIQUE,
  provider_category TEXT CHECK (provider_category IN
    ('car_service','fuel','car_wash','restaurant','accommodation')),
  role TEXT NOT NULL DEFAULT 'customer'
    CHECK (role IN ('customer','provider','tro_admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider_category TEXT;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_provider_category_check;
ALTER TABLE users ADD CONSTRAINT users_provider_category_check
  CHECK (provider_category IS NULL OR provider_category IN
    ('car_service','fuel','car_wash','restaurant','accommodation'));
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('customer','provider','tro_admin'));
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique
  ON users (lower(email)) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS providers (
  id BIGSERIAL PRIMARY KEY,
  owner_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  business_name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN
    ('car_service','fuel','car_wash','restaurant','accommodation')),
  description TEXT DEFAULT '',
  address TEXT NOT NULL,
  location GEOGRAPHY(POINT, 4326),
  phone TEXT,
  verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS providers_location_idx
  ON providers USING GIST(location);
CREATE INDEX IF NOT EXISTS providers_category_idx ON providers(category);
ALTER TABLE providers ADD COLUMN IF NOT EXISTS till_number TEXT;
CREATE INDEX IF NOT EXISTS providers_owner_user_idx ON providers(owner_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS providers_owner_user_unique
  ON providers(owner_user_id) WHERE owner_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS services (
  id BIGSERIAL PRIMARY KEY,
  provider_id BIGINT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  price_kes NUMERIC(12,2) NOT NULL CHECK (price_kes >= 0),
  duration_minutes INTEGER,
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS bookings (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES users(id),
  provider_id BIGINT NOT NULL REFERENCES providers(id),
  service_id BIGINT REFERENCES services(id),
  booking_type TEXT NOT NULL DEFAULT 'service',
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  quantity NUMERIC(10,2),
  vehicle_type TEXT,
  guest_count INTEGER,
  customer_note TEXT NOT NULL DEFAULT '',
  check_in DATE,
  check_out DATE,
  total_kes NUMERIC(12,2) NOT NULL CHECK (total_kes >= 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','cancelled','completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS customer_note TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS payments (
  id BIGSERIAL PRIMARY KEY,
  booking_id BIGINT NOT NULL REFERENCES bookings(id),
  amount_kes NUMERIC(12,2) NOT NULL CHECK (amount_kes >= 0),
  method TEXT NOT NULL DEFAULT 'mpesa',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','paid','failed','refunded')),
  mpesa_receipt TEXT UNIQUE,
  checkout_request_id TEXT,
  qr_token_hash TEXT,
  qr_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGSERIAL PRIMARY KEY,
  booking_id BIGINT REFERENCES bookings(id) ON DELETE SET NULL,
  sender_user_id BIGINT NOT NULL REFERENCES users(id),
  recipient_user_id BIGINT REFERENCES users(id),
  room_type TEXT NOT NULL DEFAULT 'provider',
  message TEXT NOT NULL CHECK (length(message) BETWEEN 1 AND 4000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS provider_id BIGINT REFERENCES providers(id) ON DELETE CASCADE;
ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_room_type_check;
ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_room_type_check
  CHECK (room_type IN ('provider','tro_support'));
CREATE INDEX IF NOT EXISTS chat_messages_booking_idx
  ON chat_messages(booking_id, created_at);
CREATE INDEX IF NOT EXISTS chat_messages_provider_idx
  ON chat_messages(provider_id, created_at);

CREATE TABLE IF NOT EXISTS traffic_reports (
  id BIGSERIAL PRIMARY KEY,
  road_name TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('light','moderate','heavy','blocked')),
  description TEXT DEFAULT '',
  location GEOGRAPHY(POINT, 4326),
  source TEXT NOT NULL DEFAULT 'manual',
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS traffic_location_idx
  ON traffic_reports USING GIST(location);

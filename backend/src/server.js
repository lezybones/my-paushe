import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { OAuth2Client } from 'google-auth-library';
import { pool } from './db.js';
import {
  createAccessToken, hashPassword, requireAuth, verifyPassword
} from './auth.js';

dotenv.config();
const app = express();
app.use(helmet());
const configuredClientOrigins = String(process.env.CLIENT_ORIGIN || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
const localClientOrigins = [
  'http://localhost:8081',
  'http://127.0.0.1:8081',
  'http://localhost:8082',
  'http://127.0.0.1:8082'
];
const allowedClientOrigins = new Set([...configuredClientOrigins, ...localClientOrigins]);
app.use(cors({
  origin: configuredClientOrigins.length
    ? (origin, callback) => callback(null, !origin || allowedClientOrigins.has(origin))
    : true
}));
app.use(express.json({ limit: '1mb' }));

const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const googleOAuthClient = new OAuth2Client();

app.get('/api/health', asyncRoute(async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true, app: 'My Paushe API', database: 'connected' });
}));

function publicUser(user) {
  return { id: user.id, full_name: user.full_name, email: user.email };
}

app.post('/api/auth/signup', asyncRoute(async (req, res) => {
  const fullName = String(req.body?.fullName || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (fullName.length < 2 || fullName.length > 120) {
    return res.status(400).json({ error: 'Enter a name between 2 and 120 characters.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }
  if (password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: 'Password must be between 8 and 128 characters.' });
  }

  const passwordHash = await hashPassword(password);
  const { rows } = await pool.query(`
    INSERT INTO users (full_name, email, password_hash)
    VALUES ($1, $2, $3)
    ON CONFLICT (lower(email)) WHERE email IS NOT NULL DO NOTHING
    RETURNING id, full_name, email`, [fullName, email, passwordHash]);
  if (!rows.length) return res.status(409).json({ error: 'An account with this email already exists. Sign in instead.' });
  res.status(201).json({ user: publicUser(rows[0]), token: createAccessToken(rows[0].id) });
}));

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password) {
    return res.status(400).json({ error: 'Enter your email and password.' });
  }
  const { rows } = await pool.query(
    'SELECT id, full_name, email, password_hash FROM users WHERE lower(email)=$1 AND role=$2 LIMIT 1',
    [email, 'customer']
  );
  const user = rows[0];
  if (!user || !user.password_hash || !(await verifyPassword(password, user.password_hash))) {
    return res.status(401).json({ error: 'Email or password is incorrect.' });
  }
  res.json({ user: publicUser(user), token: createAccessToken(user.id) });
}));

app.post('/api/auth/google', asyncRoute(async (req, res) => {
  const audiences = String(process.env.GOOGLE_CLIENT_IDS || '')
    .split(',')
    .map(clientId => clientId.trim())
    .filter(Boolean);
  if (audiences.length === 0) {
    return res.status(503).json({ error: 'Google sign-in is not configured on the server yet.' });
  }

  const idToken = String(req.body?.idToken || '');
  if (!idToken || idToken.length > 8192) {
    return res.status(400).json({ error: 'A valid Google ID token is required.' });
  }

  let googleUser;
  try {
    const ticket = await googleOAuthClient.verifyIdToken({ idToken, audience: audiences });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email || payload.email_verified !== true) {
      return res.status(401).json({ error: 'Google must provide a verified email address.' });
    }
    googleUser = {
      googleSub: payload.sub,
      email: payload.email.toLowerCase(),
      fullName: String(payload.name || payload.given_name || payload.email).trim().slice(0, 120)
    };
  } catch {
    return res.status(401).json({ error: 'Google sign-in could not verify this account.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`
      SELECT id, full_name, email, google_sub
      FROM users
      WHERE google_sub=$1 OR lower(email)=$2
      ORDER BY (google_sub=$1) DESC
      FOR UPDATE`, [googleUser.googleSub, googleUser.email]);
    if (rows.length > 1 || (rows[0]?.google_sub && rows[0].google_sub !== googleUser.googleSub)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'This Google account conflicts with an existing account. Sign in using its original method.' });
    }

    let user = rows[0];
    if (user) {
      const updated = await client.query(`
        UPDATE users
        SET google_sub=$1, email=$2, full_name=$3
        WHERE id=$4 AND role='customer'
        RETURNING id, full_name, email`,
      [googleUser.googleSub, googleUser.email, googleUser.fullName, user.id]);
      if (!updated.rows.length) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'This account cannot sign in as a customer.' });
      }
      user = updated.rows[0];
    } else {
      const created = await client.query(`
        INSERT INTO users (full_name, email, google_sub)
        VALUES ($1, $2, $3)
        RETURNING id, full_name, email`,
      [googleUser.fullName, googleUser.email, googleUser.googleSub]);
      user = created.rows[0];
    }
    await client.query('COMMIT');
    res.json({ user: publicUser(user), token: createAccessToken(user.id) });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') {
      return res.status(409).json({ error: 'An account with this email already exists. Sign in using its original method.' });
    }
    throw error;
  } finally {
    client.release();
  }
}));

app.get('/api/auth/me', requireAuth, asyncRoute(async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, full_name, email FROM users WHERE id=$1 AND role=$2',
    [req.user.id, 'customer']
  );
  if (!rows.length) return res.status(401).json({ error: 'Account no longer exists. Please sign in again.' });
  res.json({ user: publicUser(rows[0]) });
}));

app.post('/api/provider-auth/signup', asyncRoute(async (req, res) => {
  const fullName = String(req.body?.fullName || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const category = String(req.body?.category || '');
  const categories = new Set(['car_service', 'fuel', 'car_wash', 'restaurant', 'accommodation']);
  if (fullName.length < 2 || fullName.length > 120) {
    return res.status(400).json({ error: 'Enter a name between 2 and 120 characters.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }
  if (password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: 'Password must be between 8 and 128 characters.' });
  }
  if (!categories.has(category)) {
    return res.status(400).json({ error: 'Choose the type of business you are registering.' });
  }
  const passwordHash = await hashPassword(password);
  const { rows } = await pool.query(`
    INSERT INTO users (full_name, email, password_hash, role, provider_category)
    VALUES ($1,$2,$3,'provider',$4)
    ON CONFLICT (lower(email)) WHERE email IS NOT NULL DO NOTHING
    RETURNING id, full_name, email`, [fullName, email, passwordHash, category]);
  if (!rows.length) {
    return res.status(409).json({ error: 'An account with this email already exists. Use its original app to sign in.' });
  }
  res.status(201).json({
    user: { ...publicUser(rows[0]), businessCategory: category },
    token: createAccessToken(rows[0].id, 'provider')
  });
}));

app.post('/api/provider-auth/login', asyncRoute(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password) {
    return res.status(400).json({ error: 'Enter your email and password.' });
  }
  const { rows } = await pool.query(
    'SELECT id, full_name, email, password_hash, provider_category FROM users WHERE lower(email)=$1 AND role=$2 LIMIT 1',
    [email, 'provider']
  );
  const user = rows[0];
  if (!user?.password_hash || !(await verifyPassword(password, user.password_hash))) {
    return res.status(401).json({ error: 'Email or password is incorrect.' });
  }
  res.json({
    user: { ...publicUser(user), businessCategory: user.provider_category },
    token: createAccessToken(user.id, 'provider')
  });
}));

function requireStoredRole(role) {
  return [requireAuth, asyncRoute(async (req, res, next) => {
    const { rowCount } = await pool.query(
      'SELECT 1 FROM users WHERE id=$1 AND role=$2',
      [req.user.id, role]
    );
    if (!rowCount) {
      return res.status(403).json({ error: 'This account does not have permission to use this feature.' });
    }
    return next();
  })];
}

const providerOnly = requireStoredRole('provider');
const customerOnly = requireStoredRole('customer');

app.get('/api/provider/account', ...providerOnly, asyncRoute(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT full_name, email, provider_category AS "businessCategory"
    FROM users WHERE id=$1 AND role='provider'`, [req.user.id]);
  if (!rows.length) return res.status(404).json({ error: 'Provider account not found.' });
  res.json({ user: rows[0] });
}));

app.get('/api/provider/profile', ...providerOnly, asyncRoute(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT p.id, p.business_name, COALESCE(u.provider_category,p.category) AS category,
           p.description, p.address, p.phone, p.till_number,
           p.verified, ST_Y(p.location::geometry) AS latitude,
           ST_X(p.location::geometry) AS longitude
    FROM providers p JOIN users u ON u.id=p.owner_user_id
    WHERE p.owner_user_id=$1 ORDER BY p.id LIMIT 1`, [req.user.id]);
  res.json(rows[0] || null);
}));

app.put('/api/provider/profile', ...providerOnly, asyncRoute(async (req, res) => {
  const businessName = String(req.body?.businessName || '').trim();
  const category = String(req.body?.category || '');
  const description = String(req.body?.description || '').trim();
  const address = String(req.body?.address || '').trim();
  const phone = String(req.body?.phone || '').trim();
  const tillNumber = String(req.body?.tillNumber || '').trim();
  const latitudeValue = req.body?.latitude;
  const longitudeValue = req.body?.longitude;
  const latitude = Number(latitudeValue);
  const longitude = Number(longitudeValue);
  const categories = new Set(['car_service', 'fuel', 'car_wash', 'restaurant', 'accommodation']);
  if (businessName.length < 2 || businessName.length > 160 ||
      !categories.has(category) || address.length < 3 || address.length > 300 ||
      description.length > 2000 || phone.length > 40 ||
      latitudeValue == null || String(latitudeValue).trim() === '' ||
      longitudeValue == null || String(longitudeValue).trim() === '' ||
      !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return res.status(400).json({ error: 'Check the business details and provide valid map coordinates.' });
  }
  if (tillNumber && !/^[0-9]{5,10}$/.test(tillNumber)) {
    return res.status(400).json({ error: 'Till number must contain 5–10 digits.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const account = await client.query(
      "SELECT id, provider_category FROM users WHERE id=$1 AND role='provider' FOR UPDATE",
      [req.user.id]
    );
    if (!account.rowCount) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Provider account is unavailable.' });
    }
    const existing = await client.query(
      'SELECT id, category FROM providers WHERE owner_user_id=$1 ORDER BY id LIMIT 1 FOR UPDATE',
      [req.user.id]
    );
    const registeredCategory = account.rows[0].provider_category || existing.rows[0]?.category;
    if (registeredCategory && registeredCategory !== category) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'This owner account is registered for a different business type.' });
    }
    if (!account.rows[0].provider_category) {
      await client.query('UPDATE users SET provider_category=$1 WHERE id=$2', [category, req.user.id]);
    }
    let rows;
    if (existing.rowCount) {
      ({ rows } = await client.query(`
        UPDATE providers
        SET business_name=$1, category=$2, description=$3, address=$4,
            phone=$5, till_number=$6,
            location=ST_SetSRID(ST_MakePoint($7,$8),4326)::geography
        WHERE id=$9
        RETURNING id, business_name, category, description, address, phone, till_number,
                  verified, ST_Y(location::geometry) AS latitude,
                  ST_X(location::geometry) AS longitude`,
      [businessName, category, description, address, phone || null, tillNumber || null,
        longitude, latitude, existing.rows[0].id]));
    } else {
      ({ rows } = await client.query(`
        INSERT INTO providers
          (owner_user_id, business_name, category, description, address, phone,
           till_number, location)
        VALUES ($1,$2,$3,$4,$5,$6,$7,ST_SetSRID(ST_MakePoint($8,$9),4326)::geography)
        RETURNING id, business_name, category, description, address, phone, till_number,
                  verified, ST_Y(location::geometry) AS latitude,
                  ST_X(location::geometry) AS longitude`,
      [req.user.id, businessName, category, description, address, phone || null,
        tillNumber || null, longitude, latitude]));
    }
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

app.get('/api/provider/services', ...providerOnly, asyncRoute(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT s.id, s.name, s.description, s.price_kes, s.duration_minutes, s.active
    FROM services s JOIN providers p ON p.id=s.provider_id
    WHERE p.owner_user_id=$1 ORDER BY s.id DESC`, [req.user.id]);
  res.json(rows);
}));

app.post('/api/provider/services', ...providerOnly, asyncRoute(async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const description = String(req.body?.description || '').trim();
  const price = Number(req.body?.priceKes);
  const duration = req.body?.durationMinutes ? Number(req.body.durationMinutes) : null;
  if (name.length < 2 || name.length > 120 || description.length > 1000 ||
      !Number.isFinite(price) || price < 0 || price > 100000000 ||
      (duration !== null && (!Number.isInteger(duration) || duration < 1 || duration > 1440))) {
    return res.status(400).json({ error: 'Enter a valid item name, price, description and optional duration.' });
  }
  const provider = await pool.query(
    'SELECT id FROM providers WHERE owner_user_id=$1 ORDER BY id LIMIT 1', [req.user.id]
  );
  if (!provider.rowCount) return res.status(409).json({ error: 'Create your business profile before adding offerings.' });
  const { rows } = await pool.query(`
    INSERT INTO services (provider_id, name, description, price_kes, duration_minutes)
    VALUES ($1,$2,$3,$4,$5)
    RETURNING id, name, description, price_kes, duration_minutes, active`,
  [provider.rows[0].id, name, description, price, duration]);
  res.status(201).json(rows[0]);
}));

app.put('/api/provider/services/:id', ...providerOnly, asyncRoute(async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const description = String(req.body?.description || '').trim();
  const price = Number(req.body?.priceKes);
  const duration = req.body?.durationMinutes ? Number(req.body.durationMinutes) : null;
  const active = req.body?.active !== false;
  if (!/^[0-9]+$/.test(String(req.params.id)) || name.length < 2 || name.length > 120 ||
      description.length > 1000 || !Number.isFinite(price) || price < 0 || price > 100000000 ||
      (duration !== null && (!Number.isInteger(duration) || duration < 1 || duration > 1440))) {
    return res.status(400).json({ error: 'Enter a valid item name, price, description and optional duration.' });
  }
  const { rows } = await pool.query(`
    UPDATE services s SET name=$1, description=$2, price_kes=$3, duration_minutes=$4, active=$5
    FROM providers p
    WHERE s.id=$6 AND p.id=s.provider_id AND p.owner_user_id=$7
    RETURNING s.id, s.name, s.description, s.price_kes, s.duration_minutes, s.active`,
  [name, description, price, duration, active, req.params.id, req.user.id]);
  if (!rows.length) return res.status(404).json({ error: 'Offering not found.' });
  res.json(rows[0]);
}));

app.get('/api/provider/bookings', ...providerOnly, asyncRoute(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT b.*, p.business_name, s.name AS service_name,
           u.full_name AS customer_name, u.email AS customer_email
    FROM bookings b JOIN providers p ON p.id=b.provider_id
    JOIN users u ON u.id=b.customer_id
    LEFT JOIN services s ON s.id=b.service_id
    WHERE p.owner_user_id=$1 ORDER BY b.created_at DESC LIMIT 100`, [req.user.id]);
  res.json(rows);
}));

app.patch('/api/provider/bookings/:id', ...providerOnly, asyncRoute(async (req, res) => {
  const status = String(req.body?.status || '');
  if (!/^[0-9]+$/.test(String(req.params.id)) ||
      !['confirmed', 'cancelled', 'completed'].includes(status)) {
    return res.status(400).json({ error: 'Choose a valid booking status.' });
  }
  const { rows } = await pool.query(`
    UPDATE bookings b SET status=$1
    FROM providers p
    WHERE b.id=$2 AND p.id=b.provider_id AND p.owner_user_id=$3
      AND (b.status='pending' OR (b.status='confirmed' AND $1 IN ('completed','cancelled')))
    RETURNING b.*`, [status, req.params.id, req.user.id]);
  if (!rows.length) return res.status(404).json({ error: 'Booking not found or its status can no longer be changed.' });
  res.json(rows[0]);
}));

app.get('/api/provider/messages', ...providerOnly, asyncRoute(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT DISTINCT ON (m.provider_id, customer.id)
      m.provider_id, customer.id AS customer_id, customer.full_name AS customer_name,
      m.message, m.sender_user_id, m.created_at
    FROM chat_messages m
    JOIN providers p ON p.id=m.provider_id
    JOIN users customer
      ON customer.id=CASE WHEN m.sender_user_id=p.owner_user_id THEN m.recipient_user_id ELSE m.sender_user_id END
    WHERE p.owner_user_id=$1 AND m.provider_id IS NOT NULL AND m.room_type='provider'
    ORDER BY m.provider_id, customer.id, m.created_at DESC`, [req.user.id]);
  res.json(rows);
}));

app.get('/api/provider/messages/:providerId/:customerId', ...providerOnly, asyncRoute(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT m.id, m.provider_id, m.sender_user_id, m.recipient_user_id, m.message, m.created_at
    FROM chat_messages m JOIN providers p ON p.id=m.provider_id
    WHERE p.id=$1 AND p.owner_user_id=$2 AND m.room_type='provider'
      AND ((m.sender_user_id=$2 AND m.recipient_user_id=$3)
        OR (m.sender_user_id=$3 AND m.recipient_user_id=$2))
    ORDER BY m.created_at ASC LIMIT 200`,
  [req.params.providerId, req.user.id, req.params.customerId]);
  res.json(rows);
}));

app.post('/api/provider/messages/:providerId/:customerId', ...providerOnly, asyncRoute(async (req, res) => {
  const body = String(req.body?.message || '').trim();
  if (!body || body.length > 4000) return res.status(400).json({ error: 'Message must be 1–4000 characters.' });
  const { rows } = await pool.query(`
    INSERT INTO chat_messages (provider_id, sender_user_id, recipient_user_id, room_type, message)
    SELECT p.id, p.owner_user_id, customer.id, 'provider', $4
    FROM providers p JOIN users customer ON customer.id=$3 AND customer.role='customer'
    WHERE p.id=$1 AND p.owner_user_id=$2 AND EXISTS (
      SELECT 1 FROM chat_messages existing
      WHERE existing.provider_id=p.id AND existing.room_type='provider'
        AND ((existing.sender_user_id=p.owner_user_id AND existing.recipient_user_id=customer.id)
          OR (existing.sender_user_id=customer.id AND existing.recipient_user_id=p.owner_user_id))
    )
    RETURNING id, provider_id, sender_user_id, recipient_user_id, message, created_at`,
  [req.params.providerId, req.user.id, req.params.customerId, body]);
  if (!rows.length) return res.status(404).json({ error: 'Conversation not found.' });
  res.status(201).json(rows[0]);
}));

app.get('/api/providers/:id/messages', ...customerOnly, asyncRoute(async (req, res) => {
  const provider = await pool.query(
    "SELECT id, owner_user_id FROM providers WHERE id=$1 AND verified=true", [req.params.id]
  );
  if (!provider.rowCount) return res.status(404).json({ error: 'Provider not found.' });
  const ownerId = provider.rows[0].owner_user_id;
  if (!ownerId) return res.json([]);
  const { rows } = await pool.query(`
    SELECT id, provider_id, sender_user_id, recipient_user_id, message, created_at
    FROM chat_messages WHERE provider_id=$1 AND room_type='provider'
      AND ((sender_user_id=$2 AND recipient_user_id=$3)
        OR (sender_user_id=$3 AND recipient_user_id=$2))
    ORDER BY created_at ASC LIMIT 200`, [req.params.id, req.user.id, ownerId]);
  res.json(rows);
}));

app.post('/api/providers/:id/messages', ...customerOnly, asyncRoute(async (req, res) => {
  const body = String(req.body?.message || '').trim();
  if (!body || body.length > 4000) return res.status(400).json({ error: 'Message must be 1–4000 characters.' });
  const { rows } = await pool.query(`
    INSERT INTO chat_messages (provider_id, sender_user_id, recipient_user_id, room_type, message)
    SELECT p.id, $2, p.owner_user_id, 'provider', $3
    FROM providers p JOIN users owner ON owner.id=p.owner_user_id AND owner.role='provider'
    WHERE p.id=$1 AND p.verified=true
    RETURNING id, provider_id, sender_user_id, recipient_user_id, message, created_at`,
  [req.params.id, req.user.id, body]);
  if (!rows.length) return res.status(404).json({ error: 'Provider messaging is not available.' });
  res.status(201).json(rows[0]);
}));

app.get('/api/customer/messages', ...customerOnly, asyncRoute(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT DISTINCT ON (p.id)
      p.id AS provider_id, p.business_name, m.message, m.sender_user_id, m.created_at
    FROM chat_messages m JOIN providers p ON p.id=m.provider_id
    WHERE m.room_type='provider' AND (
      (m.sender_user_id=$1 AND m.recipient_user_id=p.owner_user_id)
      OR (m.sender_user_id=p.owner_user_id AND m.recipient_user_id=$1)
    )
    ORDER BY p.id, m.created_at DESC`, [req.user.id]);
  res.json(rows);
}));

app.get('/api/categories', (_req, res) => res.json([
  { id: 'car_service', name: 'Car Services', icon: '🔧' },
  { id: 'fuel', name: 'Fueling', icon: '⛽' },
  { id: 'car_wash', name: 'Car & Bike Wash', icon: '🚿' },
  { id: 'restaurant', name: 'Restaurants', icon: '🍽️' },
  { id: 'accommodation', name: 'Stays & Airbnb', icon: '🛏️' }
]));

app.get('/api/providers', asyncRoute(async (req, res) => {
  const { category, lat, lng, q } = req.query;
  const params = [];
  const filters = ['p.verified = true'];
  const allowedCategories = new Set([
    'car_service', 'fuel', 'car_wash', 'restaurant', 'accommodation'
  ]);
  if (category) {
    if (!allowedCategories.has(String(category))) {
      return res.status(400).json({ error: 'Unknown service category.' });
    }
    params.push(category);
    filters.push(`p.category = $${params.length}`);
  }
  if (q) {
    params.push(`%${String(q).slice(0, 80)}%`);
    filters.push(`(
      p.business_name ILIKE $${params.length}
      OR p.description ILIKE $${params.length}
      OR p.address ILIKE $${params.length}
      OR EXISTS (
        SELECT 1
        FROM services s
        WHERE s.provider_id=p.id AND s.active=true
          AND (s.name ILIKE $${params.length} OR s.description ILIKE $${params.length})
      )
    )`);
  }

  const hasLatitude = lat !== undefined;
  const hasLongitude = lng !== undefined;
  if (hasLatitude !== hasLongitude) {
    return res.status(400).json({ error: 'Provide both lat and lng to search by distance.' });
  }

  const hasLocation = hasLatitude && hasLongitude;
  let distance = 'NULL::float AS distance_m';
  const coordinates = 'ST_Y(p.location::geometry) AS latitude, ST_X(p.location::geometry) AS longitude';
  if (hasLocation) {
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
        !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return res.status(400).json({ error: 'lat or lng is outside valid coordinate bounds.' });
    }
    params.push(longitude, latitude);
    const point = `ST_SetSRID(ST_MakePoint($${params.length - 1}, $${params.length}),4326)::geography`;
    distance = `ST_Distance(p.location, ${point}) AS distance_m`;
    filters.push('p.location IS NOT NULL');
  }
  const sql = `
    SELECT p.id, p.business_name, p.category, p.description, p.address,
           p.phone, p.till_number, ${distance}, ${coordinates}
    FROM providers p
    WHERE ${filters.join(' AND ')}
    ORDER BY ${hasLocation ? 'distance_m ASC NULLS LAST,' : ''} p.business_name
    LIMIT 100`;
  const { rows } = await pool.query(sql, params);
  res.json(rows);
}));

app.get('/api/providers/:id/services', asyncRoute(async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, provider_id, name, description, price_kes, duration_minutes FROM services WHERE provider_id=$1 AND active=true ORDER BY name',
    [req.params.id]
  );
  res.json(rows);
}));

app.post('/api/bookings', ...customerOnly, asyncRoute(async (req, res) => {
  const {
    providerId, serviceId = null, bookingType = 'service', startAt = null,
    quantity = null, vehicleType = null, guestCount = null,
    checkIn = null, checkOut = null, customerNote = ''
  } = req.body || {};

  const note = String(customerNote || '').trim();
  const guestCountValue = guestCount == null || guestCount === '' ? null : Number(guestCount);
  const requestedAt = startAt ? new Date(startAt) : null;
  if (!Number.isInteger(Number(providerId)) || Number(providerId) < 1 ||
      !['service', 'reservation'].includes(String(bookingType)) ||
      note.length > 1000 ||
      (guestCountValue !== null &&
        (!Number.isInteger(guestCountValue) || guestCountValue < 1 || guestCountValue > 100)) ||
      (requestedAt && Number.isNaN(requestedAt.getTime()))) {
    return res.status(400).json({ error: 'Check the provider, reservation details, and optional guest count.' });
  }
  if (bookingType === 'reservation' && (!requestedAt || requestedAt <= new Date())) {
    return res.status(400).json({ error: 'Reservation requests need a date and time in the future.' });
  }
  const provider = await pool.query(
    'SELECT id, category FROM providers WHERE id=$1 AND verified=true', [providerId]
  );
  if (!provider.rowCount) return res.status(404).json({ error: 'Provider not found or not verified.' });
  let bookingTotal = 0;
  if (serviceId !== null) {
    if (bookingType !== 'service') {
      return res.status(400).json({ error: 'Choose either a service booking or a reservation request.' });
    }
    if (!Number.isInteger(Number(serviceId)) || Number(serviceId) < 1) {
      return res.status(400).json({ error: 'Choose a valid service.' });
    }
    const offering = await pool.query(
      'SELECT price_kes FROM services WHERE id=$1 AND provider_id=$2 AND active=true',
      [serviceId, providerId]
    );
    if (!offering.rowCount) return res.status(400).json({ error: 'This service is no longer available.' });
    bookingTotal = Number(offering.rows[0].price_kes);
  } else if (bookingType !== 'reservation') {
    return res.status(400).json({ error: 'Choose a service or request a reservation.' });
  }

  const { rows } = await pool.query(`
    INSERT INTO bookings
      (customer_id, provider_id, service_id, booking_type, start_at, quantity,
       vehicle_type, guest_count, check_in, check_out, total_kes, customer_note)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    RETURNING *`,
    [req.user.id, providerId, serviceId, bookingType, requestedAt, quantity,
     vehicleType, guestCountValue, checkIn, checkOut, bookingTotal, note]
  );
  res.status(201).json(rows[0]);
}));

app.get('/api/bookings', ...customerOnly, asyncRoute(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT b.*, p.business_name, s.name AS service_name
    FROM bookings b JOIN providers p ON p.id=b.provider_id
    LEFT JOIN services s ON s.id=b.service_id
    WHERE b.customer_id=$1 ORDER BY b.created_at DESC LIMIT 100`, [req.user.id]);
  res.json(rows);
}));

app.get('/api/payments', ...customerOnly, asyncRoute(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT payment.id, payment.booking_id, payment.amount_kes, payment.method,
           payment.status, payment.mpesa_receipt, payment.created_at,
           provider.business_name
    FROM payments payment
    JOIN bookings booking ON booking.id=payment.booking_id
    JOIN providers provider ON provider.id=booking.provider_id
    WHERE booking.customer_id=$1
    ORDER BY payment.created_at DESC
    LIMIT 100`, [req.user.id]);
  res.json(rows);
}));

app.post('/api/chat/messages', ...customerOnly, asyncRoute(async (req, res) => {
  const { bookingId = null, recipientUserId = null, roomType = 'provider', message } = req.body || {};
  const body = String(message || '').trim();
  if (!body || body.length > 4000) return res.status(400).json({ error: 'Message must be 1–4000 characters.' });
  if (!['provider', 'tro_support'].includes(roomType)) return res.status(400).json({ error: 'Invalid room type.' });
  if (bookingId) {
    const booking = await pool.query(
      'SELECT id FROM bookings WHERE id=$1 AND customer_id=$2',
      [bookingId, req.user.id]
    );
    if (!booking.rowCount) return res.status(404).json({ error: 'Booking not found.' });
  }
  const { rows } = await pool.query(`
    INSERT INTO chat_messages (booking_id, sender_user_id, recipient_user_id, room_type, message)
    VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [bookingId, req.user.id, recipientUserId, roomType, body]);
  res.status(201).json(rows[0]);
}));

app.get('/api/chat/messages', ...customerOnly, asyncRoute(async (req, res) => {
  const bookingId = req.query.bookingId ? Number(req.query.bookingId) : null;
  const roomType = req.query.roomType === 'tro_support' ? 'tro_support' : 'provider';
  const { rows } = await pool.query(`
    SELECT id, booking_id, sender_user_id, recipient_user_id, room_type, message, created_at
    FROM chat_messages
    WHERE room_type=$1 AND ($2::bigint IS NULL OR booking_id=$2)
      AND (sender_user_id=$3 OR recipient_user_id=$3)
    ORDER BY created_at ASC LIMIT 200`, [roomType, bookingId, req.user.id]);
  res.json(rows);
}));

// Traffic reports are only as live as their data source. In production, ingest a real provider feed.
app.get('/api/traffic', asyncRoute(async (req, res) => {
  const { lat, lng } = req.query;
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
    return res.status(400).json({ error: 'lat and lng are required.' });
  }
  const { rows } = await pool.query(`
    SELECT id, road_name, severity, description, source, observed_at,
           ST_Distance(location, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography) AS distance_m
    FROM traffic_reports
    WHERE location IS NOT NULL AND observed_at > now() - interval '2 hours'
    ORDER BY distance_m LIMIT 100`, [Number(lng), Number(lat)]);
  res.json(rows);
}));

// Payment intent starter: creates a pending record only. Add authenticated Daraja STK Push here.
app.post('/api/payments/mpesa/initiate', ...customerOnly, asyncRoute(async (req, res) => {
  const { bookingId, amountKes } = req.body || {};
  if (!Number.isInteger(Number(bookingId)) || !Number.isFinite(Number(amountKes)) || Number(amountKes) <= 0) {
    return res.status(400).json({ error: 'Valid bookingId and amountKes are required.' });
  }
  const booking = await pool.query('SELECT id, total_kes FROM bookings WHERE id=$1 AND customer_id=$2', [bookingId, req.user.id]);
  if (!booking.rowCount) return res.status(404).json({ error: 'Booking not found.' });
  if (Number(booking.rows[0].total_kes) !== Number(amountKes)) {
    return res.status(400).json({ error: 'Payment amount must match booking total.' });
  }
  const { rows } = await pool.query(
    "INSERT INTO payments (booking_id, amount_kes, method, status) VALUES ($1,$2,'mpesa','pending') RETURNING id, booking_id, amount_kes, status",
    [bookingId, amountKes]
  );
  res.status(202).json({
    payment: rows[0],
    message: 'Pending payment record created. Daraja STK Push is not configured in this starter.',
    configure: 'Implement server-side OAuth, STK Push, and callback validation before accepting real payments.'
  });
}));

// QR confirmation must be performed by an authenticated server-side scanner/merchant endpoint.
// This endpoint intentionally does not mark payments as paid.
app.post('/api/payments/qr/verify', (_req, res) => {
  res.status(501).json({ error: 'QR verification is not enabled until secure token issuance and payment-provider verification are implemented.' });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  if (['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', '3D000'].includes(err.code)) {
    return res.status(503).json({
      error: 'Database unavailable. Set DATABASE_URL and make sure PostgreSQL with PostGIS is running.'
    });
  }
  res.status(500).json({ error: 'Unexpected server error.' });
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => console.log(`My Paushe API listening on ${port}`));

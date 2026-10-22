import {
  createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual
} from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const TOKEN_LIFETIME_SECONDS = 60 * 60 * 24 * 30;

function getTokenSecret() {
  const secret = process.env.AUTH_TOKEN_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error('AUTH_TOKEN_SECRET must be set to a random value of at least 32 characters.');
  }
  return secret;
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const derivedKey = await scrypt(password, salt, 64);
  return `${salt.toString('hex')}:${derivedKey.toString('hex')}`;
}

export async function verifyPassword(password, encodedHash) {
  const [saltHex, keyHex] = String(encodedHash || '').split(':');
  if (!/^[a-f0-9]{32}$/.test(saltHex || '') || !/^[a-f0-9]{128}$/.test(keyHex || '')) return false;
  const storedKey = Buffer.from(keyHex, 'hex');
  const derivedKey = await scrypt(password, Buffer.from(saltHex, 'hex'), storedKey.length);
  return timingSafeEqual(storedKey, derivedKey);
}

export function createAccessToken(userId, role = 'customer') {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    sub: String(userId),
    role,
    iat: now,
    exp: now + TOKEN_LIFETIME_SECONDS
  })).toString('base64url');
  const content = `${header}.${payload}`;
  const signature = createHmac('sha256', getTokenSecret()).update(content).digest('base64url');
  return `${content}.${signature}`;
}

export function verifyAccessToken(token) {
  const [header, payload, signature, extra] = String(token || '').split('.');
  if (!header || !payload || !signature || extra) return null;
  const content = `${header}.${payload}`;
  const expected = createHmac('sha256', getTokenSecret()).update(content).digest();
  let actual;
  try {
    actual = Buffer.from(signature, 'base64url');
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

  let claims;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  const userId = Number(claims.sub);
  if (!Number.isSafeInteger(userId) || userId < 1 || !Number.isInteger(claims.exp) || claims.exp <= Date.now() / 1000) {
    return null;
  }
  return { id: userId, role: claims.role || 'customer' };
}

export function requireAuth(req, res, next) {
  const authorization = req.get('authorization') || '';
  const match = /^Bearer ([^\s]+)$/.exec(authorization);
  let user;
  try {
    user = match ? verifyAccessToken(match[1]) : null;
  } catch (error) {
    return next(error);
  }
  if (!user) return res.status(401).json({ error: 'Sign in to continue.' });
  req.user = user;
  return next();
}

export function requireRole(role) {
  return (req, res, next) => {
    if (req.user?.role !== role) {
      return res.status(403).json({ error: 'This account does not have permission to use this feature.' });
    }
    return next();
  };
}

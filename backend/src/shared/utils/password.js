import crypto from 'crypto';
import bcrypt from 'bcryptjs';

export async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

export async function comparePassword(candidate, hash) {
  return bcrypt.compare(candidate, hash);
}

/** Legacy rows may still store the raw JWT until the next login/refresh. */
export function isPlaintextRefreshToken(stored) {
  return typeof stored === 'string' && stored.startsWith('eyJ');
}

function isBcryptHash(stored) {
  return typeof stored === 'string' && /^\$2[aby]\$/.test(stored);
}

/**
 * Refresh tokens are high-entropy JWTs — HMAC-SHA256 is enough and far faster
 * than bcrypt on small Render CPUs (bcrypt cost 12 was taking multiple seconds).
 */
function hmacRefreshToken(token) {
  const secret = process.env.JWT_REFRESH_SECRET || '';
  return crypto.createHmac('sha256', secret).update(token).digest('hex');
}

export async function hashRefreshToken(token) {
  return hmacRefreshToken(token);
}

export async function compareRefreshToken(candidate, stored) {
  if (!stored || !candidate) return false;

  // Legacy plaintext JWT (pre-hashing)
  if (isPlaintextRefreshToken(stored)) {
    return candidate === stored;
  }

  // Legacy bcrypt hashes — still verify, then next refresh stores HMAC
  if (isBcryptHash(stored)) {
    return bcrypt.compare(candidate, stored);
  }

  const expected = hmacRefreshToken(candidate);
  const actual = String(stored);
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}

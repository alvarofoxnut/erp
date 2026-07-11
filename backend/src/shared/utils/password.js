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

export async function hashRefreshToken(token) {
  return bcrypt.hash(token, 12);
}

export async function compareRefreshToken(candidate, stored) {
  if (!stored || !candidate) return false;
  if (isPlaintextRefreshToken(stored)) {
    return candidate === stored;
  }
  return bcrypt.compare(candidate, stored);
}

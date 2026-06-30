import bcrypt from 'bcryptjs';

export async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

export async function comparePassword(candidate, hash) {
  return bcrypt.compare(candidate, hash);
}

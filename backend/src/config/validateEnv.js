import { parseDurationMs, MAX_ACCESS_TOKEN_MS } from '../shared/utils/parseDuration.js';

const isProd = process.env.NODE_ENV === 'production';

const ALWAYS_REQUIRED = [
  'DATABASE_URL',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
];

const PROD_REQUIRED = [
  'CLIENT_URL',
  'DIRECT_DATABASE_URL',
];

const WEAK_SECRET_PATTERNS = [
  /^change_me/i,
  /^your_/i,
  /^dev[-_]?secret/i,
  /^secret$/i,
  /^test$/i,
];

function isWeakSecret(value) {
  const trimmed = value?.trim() || '';
  if (trimmed.length < 32) return true;
  return WEAK_SECRET_PATTERNS.some((p) => p.test(trimmed));
}

function isLocalDatabase(url) {
  return /@(localhost|127\.0\.0\.1|postgres)(:|\/)/i.test(url || '');
}

export function validateEnv() {
  const missing = [];

  for (const key of ALWAYS_REQUIRED) {
    if (!process.env[key]?.trim()) missing.push(key);
  }

  if (isProd) {
    for (const key of PROD_REQUIRED) {
      if (!process.env[key]?.trim()) missing.push(key);
    }

    for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
      if (isWeakSecret(process.env[key])) {
        console.error(`[FATAL] ${key} is missing or too weak for production (min 32 chars, no placeholder values)`);
        process.exit(1);
      }
    }

    const accessTtlMs = parseDurationMs(process.env.JWT_ACCESS_EXPIRES);
    if (accessTtlMs > MAX_ACCESS_TOKEN_MS) {
      console.error('[FATAL] JWT_ACCESS_EXPIRES must not exceed 15m in production');
      process.exit(1);
    }

    const dbUrl = process.env.DATABASE_URL?.trim() || '';
    if (dbUrl && !isLocalDatabase(dbUrl) && !/sslmode=require|ssl=true/i.test(dbUrl)) {
      console.error('[FATAL] DATABASE_URL must include sslmode=require (or ssl=true) for remote production databases');
      process.exit(1);
    }
  }

  if (missing.length) {
    console.error(`[FATAL] Missing required environment variable(s): ${missing.join(', ')}`);
    process.exit(1);
  }
}

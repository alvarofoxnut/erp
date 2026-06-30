/**
 * CLIENT_URL may be a single origin or comma-separated list.
 * Set ALLOW_VERCEL_PREVIEWS=true to allow any *.vercel.app origin (preview deploys).
 */
export function getAllowedOrigins() {
  const raw = process.env.CLIENT_URL || 'http://localhost:5173';
  return raw.split(',').map((o) => o.trim()).filter(Boolean);
}

export function corsOriginDelegate(origin, callback) {
  const allowed = getAllowedOrigins();

  if (!origin) {
    callback(null, true);
    return;
  }

  if (allowed.includes(origin)) {
    callback(null, true);
    return;
  }

  if (
    process.env.ALLOW_VERCEL_PREVIEWS === 'true'
    && /^https:\/\/[\w-]+\.vercel\.app$/.test(origin)
  ) {
    callback(null, true);
    return;
  }

  callback(null, false);
}

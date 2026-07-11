/**
 * CLIENT_URL may be a single origin or comma-separated list.
 * Set ALLOW_VERCEL_PREVIEWS=true to allow any *.vercel.app origin (preview deploys).
 */
function normalizeOrigin(origin) {
  if (!origin) return origin;
  return origin.replace(/\/$/, '');
}

export function getAllowedOrigins() {
  const raw = process.env.CLIENT_URL;
  if (!raw?.trim()) {
    if (process.env.NODE_ENV === 'production') return [];
    return ['http://localhost:5173'];
  }
  return raw.split(',').map((o) => normalizeOrigin(o.trim())).filter(Boolean);
}

export function corsOriginDelegate(origin, callback) {
  const allowed = getAllowedOrigins();
  const normalizedOrigin = normalizeOrigin(origin);

  if (!origin) {
    callback(null, true);
    return;
  }

  if (allowed.includes(normalizedOrigin)) {
    callback(null, true);
    return;
  }

  if (
    process.env.ALLOW_VERCEL_PREVIEWS === 'true'
    && /^https:\/\/[\w-]+\.vercel\.app$/.test(normalizedOrigin)
  ) {
    callback(null, true);
    return;
  }

  callback(null, false);
}

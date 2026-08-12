/**
 * Short-lived in-memory session cache to avoid a Neon round-trip on every request.
 * Invalidated on logout / password change / user updates.
 */
const DEFAULT_TTL_MS = 45_000;

const cache = new Map();

export function getCachedSession(userId) {
  const entry = cache.get(String(userId));
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(String(userId));
    return null;
  }
  return entry.user;
}

export function setCachedSession(user, ttlMs = DEFAULT_TTL_MS) {
  if (!user?.id) return;
  cache.set(String(user.id), {
    user,
    expiresAt: Date.now() + ttlMs,
  });
}

export function invalidateSession(userId) {
  if (userId == null) return;
  cache.delete(String(userId));
}

export function clearSessionCache() {
  cache.clear();
}

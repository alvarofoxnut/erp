/**
 * Refresh-token cookie options.
 * Vercel (frontend) + Render (API) are different sites — set COOKIE_CROSS_ORIGIN=true on Render.
 */
export function refreshTokenCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  const crossOrigin = process.env.COOKIE_CROSS_ORIGIN === 'true';

  return {
    httpOnly: true,
    secure: isProd,
    sameSite: crossOrigin && isProd ? 'none' : 'strict',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

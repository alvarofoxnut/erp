/**
 * Auth cookie options.
 * Vercel (frontend) + Render (API) are different sites — set COOKIE_CROSS_ORIGIN=true on Render.
 */
import { parseDurationMs } from './parseDuration.js';

function baseCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  const crossOrigin = process.env.COOKIE_CROSS_ORIGIN === 'true';

  return {
    httpOnly: true,
    secure: isProd,
    sameSite: crossOrigin && isProd ? 'none' : 'strict',
    path: '/',
  };
}

export function accessTokenCookieOptions() {
  return {
    ...baseCookieOptions(),
    maxAge: parseDurationMs(process.env.JWT_ACCESS_EXPIRES),
  };
}

export function refreshTokenCookieOptions() {
  return {
    ...baseCookieOptions(),
    maxAge: parseDurationMs(process.env.JWT_REFRESH_EXPIRES, '7d'),
  };
}

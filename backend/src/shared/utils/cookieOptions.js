/**
 * Auth cookie options.
 * Split deploy (Vercel UI + Render API): cookies need SameSite=None + Secure.
 * Set COOKIE_CROSS_ORIGIN=true to force, or rely on auto-detect when CLIENT_URL is a remote HTTPS origin.
 */
import { parseDurationMs } from './parseDuration.js';

function isCrossOriginDeployment() {
  if (process.env.COOKIE_CROSS_ORIGIN === 'true') return true;
  if (process.env.COOKIE_CROSS_ORIGIN === 'false') return false;
  if (process.env.NODE_ENV !== 'production') return false;

  const clientUrl = process.env.CLIENT_URL?.split(',')[0]?.trim();
  if (!clientUrl) return false;

  try {
    const { hostname, protocol } = new URL(clientUrl);
    if (protocol !== 'https:') return false;
    return hostname !== 'localhost' && hostname !== '127.0.0.1';
  } catch {
    return false;
  }
}

function baseCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  const crossOrigin = isCrossOriginDeployment();

  return {
    httpOnly: true,
    secure: isProd,
    sameSite: crossOrigin ? 'none' : 'strict',
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

export function getCookieDeploymentMode() {
  const crossOrigin = isCrossOriginDeployment();
  return crossOrigin ? 'cross-origin (SameSite=None)' : 'same-site (SameSite=strict)';
}

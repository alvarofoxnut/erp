/** Parse env duration strings like 15m, 8h, 7d into milliseconds. */
export function parseDurationMs(expires, fallback = '15m') {
  const str = String(expires || fallback).trim();
  const match = str.match(/^(\d+)([smhd])?$/i);
  if (!match) return parseDurationMs(fallback, '15m');
  const n = parseInt(match[1], 10);
  const unit = (match[2] || 's').toLowerCase();
  const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return n * multipliers[unit];
}

export const MAX_ACCESS_TOKEN_MS = 15 * 60 * 1000;

import { prisma } from '../../config/db.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { verifyAccessToken } from '../utils/helpers.js';
import {
  getCachedSession,
  setCachedSession,
  invalidateSession,
} from '../utils/sessionCache.js';

const userPublicOmit = { password: true, refreshToken: true };

async function loadUserForAuth(userId) {
  return prisma.user.findUnique({
    where: { id: userId },
    omit: userPublicOmit,
  });
}

/**
 * Verify JWT, then attach req.user.
 * Uses a short in-memory session cache so warm requests skip the DB.
 * tokenVersion is still enforced (cache miss / mismatch → DB → reject if revoked).
 */
export const protect = asyncHandler(async (req, res, next) => {
  let token;
  if (req.headers.authorization?.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies?.accessToken) {
    token = req.cookies.accessToken;
  }

  if (!token) {
    throw new AppError('Not authorized, no token', 401);
  }

  const decoded = verifyAccessToken(token);
  const userId = decoded.id;

  let user = getCachedSession(userId);

  if (!user || user.tokenVersion !== decoded.tokenVersion) {
    user = await loadUserForAuth(userId);
    if (!user || !user.isActive) {
      invalidateSession(userId);
      throw new AppError('User not found or inactive', 401);
    }
    if (decoded.tokenVersion !== user.tokenVersion) {
      invalidateSession(userId);
      throw new AppError('Session expired, please log in again', 401);
    }
    setCachedSession(user);
  } else if (!user.isActive) {
    invalidateSession(userId);
    throw new AppError('User not found or inactive', 401);
  }

  req.user = { ...user, _id: user.id };
  next();
});

/**
 * Always reload user from DB (profile pages / after sensitive account changes).
 */
export const protectFresh = asyncHandler(async (req, res, next) => {
  let token;
  if (req.headers.authorization?.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies?.accessToken) {
    token = req.cookies.accessToken;
  }

  if (!token) {
    throw new AppError('Not authorized, no token', 401);
  }

  const decoded = verifyAccessToken(token);
  const user = await loadUserForAuth(decoded.id);

  if (!user || !user.isActive) {
    invalidateSession(decoded.id);
    throw new AppError('User not found or inactive', 401);
  }

  if (decoded.tokenVersion !== user.tokenVersion) {
    invalidateSession(decoded.id);
    throw new AppError('Session expired, please log in again', 401);
  }

  setCachedSession(user);
  req.user = { ...user, _id: user.id };
  next();
});

export const authorize = (...permissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Not authorized', 401));
    }
    if (req.user.role === 'admin') return next();
    const hasPermission = permissions.some((p) => req.user.permissions?.includes(p));
    if (!hasPermission) {
      return next(new AppError('Forbidden: insufficient permissions', 403));
    }
    next();
  };
};

export const authorizeRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new AppError('Forbidden: insufficient role', 403));
    }
    next();
  };
};

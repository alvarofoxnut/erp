import { prisma } from '../../config/db.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { verifyAccessToken } from '../utils/helpers.js';

const userPublicOmit = { password: true, refreshToken: true };

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
  const user = await prisma.user.findUnique({
    where: { id: decoded.id },
    omit: userPublicOmit,
  });

  if (!user || !user.isActive) {
    throw new AppError('User not found or inactive', 401);
  }

  if (decoded.tokenVersion !== user.tokenVersion) {
    throw new AppError('Session expired, please log in again', 401);
  }

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

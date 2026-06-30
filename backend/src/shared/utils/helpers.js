import jwt from 'jsonwebtoken';
import AppError from './AppError.js';

export const generateAccessToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_ACCESS_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES || '15m',
  });
};

export const generateRefreshToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES || '7d',
  });
};

export const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
  } catch {
    throw new AppError('Invalid or expired access token', 401);
  }
};

export const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  } catch {
    throw new AppError('Invalid or expired refresh token', 401);
  }
};

export const buildPagination = (page = 1, limit = 10) => {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
  const skip = (pageNum - 1) * limitNum;
  return { page: pageNum, limit: limitNum, skip };
};

export const buildPaginationMeta = (total, page, limit) => ({
  total,
  page,
  limit,
  totalPages: Math.ceil(total / limit) || 1,
});

export const getFinancialYear = (date = new Date()) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth();
  if (month >= 3) {
    return { start: new Date(year, 3, 1), end: new Date(year + 1, 2, 31, 23, 59, 59) };
  }
  return { start: new Date(year - 1, 3, 1), end: new Date(year, 2, 31, 23, 59, 59) };
};

export const getDateRange = (startDate, endDate) => {
  const start = startDate ? new Date(startDate) : new Date(0);
  const end = endDate ? new Date(endDate) : new Date();
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

export const toDateTime = (value) => {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  const str = String(value).trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(str)
    ? new Date(`${str}T00:00:00.000Z`)
    : new Date(str);
  if (Number.isNaN(date.getTime())) {
    throw new AppError(`Invalid date: ${value}`, 400);
  }
  return date;
};

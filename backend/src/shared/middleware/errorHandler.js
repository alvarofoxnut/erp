import AppError from '../utils/AppError.js';
import logger from '../utils/logger.js';

const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  const correlationId = req.correlationId || 'unknown';

  logger.error(err.message, {
    correlationId,
    stack: err.stack,
    path: req.originalUrl,
    method: req.method,
  });

  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message);
    error = new AppError(messages.join(', '), 400);
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    error = new AppError(`${field} already exists`, 409);
  }

  if (err.code === 'P2002') {
    const field = err.meta?.target?.[0] || 'value';
    error = new AppError(`${field} already exists`, 409);
  }

  if (err.name === 'CastError') {
    error = new AppError('Invalid resource ID', 400);
  }

  if (err.name === 'JsonWebTokenError') {
    error = new AppError('Invalid token', 401);
  }

  if (err.name === 'TokenExpiredError') {
    error = new AppError('Token expired', 401);
  }

  const statusCode = error.statusCode || 500;
  const isProd = process.env.NODE_ENV === 'production';
  const message = error.isOperational
    ? error.message
    : (isProd ? 'An unexpected error occurred. Please try again.' : 'Internal server error');

  res.status(statusCode).json({
    success: false,
    message,
    correlationId,
    errors: error.errors || null,
    ...(!isProd && { stack: err.stack }),
  });
};

export default errorHandler;

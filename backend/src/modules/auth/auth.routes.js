import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { login, logout, refresh, getMe, loginValidation } from './auth.controller.js';
import { protect } from '../../shared/middleware/auth.js';
import { validate } from '../../shared/middleware/validate.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts. Please try again later.' },
});

const refreshLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many token refresh attempts. Please try again later.' },
});

router.post('/login', loginLimiter, loginValidation, validate, login);
router.post('/refresh', refreshLimiter, refresh);
router.post('/logout', protect, logout);
router.get('/me', protect, getMe);

export default router;

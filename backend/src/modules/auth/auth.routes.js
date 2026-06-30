import { Router } from 'express';
import { login, logout, refresh, getMe, loginValidation } from './auth.controller.js';
import { protect } from '../../shared/middleware/auth.js';
import { validate } from '../../shared/middleware/validate.js';

const router = Router();

router.post('/login', loginValidation, validate, login);
router.post('/refresh', refresh);
router.post('/logout', protect, logout);
router.get('/me', protect, getMe);

export default router;

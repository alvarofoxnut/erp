import { Router } from 'express';
import { getDashboard } from './dashboard.controller.js';
import { protect, authorize } from '../../shared/middleware/auth.js';
import { PERMISSIONS } from '../../shared/constants/index.js';

const router = Router();
router.use(protect, authorize(PERMISSIONS.DASHBOARD_READ));
router.get('/', getDashboard);

export default router;

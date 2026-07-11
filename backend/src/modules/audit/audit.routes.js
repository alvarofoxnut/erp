import { Router } from 'express';
import {
  getAuditLogs,
  getAuditLogById,
  getDashboardStats,
  getFilterOptions,
  exportAuditLogs,
  getInventoryAuditLogs,
  getSecurityEvents,
} from './audit.controller.js';
import { protect, authorizeRole } from '../../shared/middleware/auth.js';
import { ROLES } from '../../shared/constants/index.js';

const router = Router();

router.use(protect, authorizeRole(ROLES.ADMIN));

router.get('/dashboard-stats', getDashboardStats);
router.get('/security-events', getSecurityEvents);
router.get('/filter-options', getFilterOptions);

router.get('/logs', getAuditLogs);
router.get('/logs/export', exportAuditLogs);
router.get('/logs/:id', getAuditLogById);

router.get('/inventory', getInventoryAuditLogs);

export default router;

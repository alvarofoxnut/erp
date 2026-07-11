import { Router } from 'express';
import {
  listModules,
  getDeletedCounts,
  listDeleted,
  restoreDeleted,
} from './deletedRecords.controller.js';
import { protect, authorizeRole } from '../../shared/middleware/auth.js';
import { ROLES } from '../../shared/constants/index.js';
import { auditLog } from '../../shared/middleware/auditLog.js';

const router = Router();

router.use(protect, authorizeRole(ROLES.ADMIN));

router.get('/modules', listModules);
router.get('/counts', getDeletedCounts);
router.get('/:module', listDeleted);
router.post('/:module/:id/restore', auditLog('restore', 'deletedRecord'), restoreDeleted);

export default router;

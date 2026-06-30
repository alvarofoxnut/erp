import { Router } from 'express';
import {
  getRoles, getPermissionCatalog, createRole, updateRole, deleteRole,
  createRoleValidation, updateRoleValidation,
} from './role.controller.js';
import { protect, authorize } from '../../shared/middleware/auth.js';
import { validate } from '../../shared/middleware/validate.js';
import { PERMISSIONS } from '../../shared/constants/index.js';
import { auditLog } from '../../shared/middleware/auditLog.js';

const router = Router();
router.use(protect);

router.get('/permissions', authorize(PERMISSIONS.ROLES_READ), getPermissionCatalog);
router.get('/', authorize(PERMISSIONS.ROLES_READ), getRoles);
router.post('/', authorize(PERMISSIONS.ROLES_WRITE), createRoleValidation, validate, auditLog('create', 'role'), createRole);
router.put('/:id', authorize(PERMISSIONS.ROLES_WRITE), updateRoleValidation, validate, auditLog('update', 'role'), updateRole);
router.delete('/:id', authorize(PERMISSIONS.ROLES_WRITE), auditLog('delete', 'role'), deleteRole);

export default router;

import { Router } from 'express';
import {
  getUsers, getUser, createUser, updateUser, deleteUser,
  createUserValidation, updateUserValidation,
} from './user.controller.js';
import { protect, authorize, authorizeRole } from '../../shared/middleware/auth.js';
import { validate } from '../../shared/middleware/validate.js';
import { PERMISSIONS, ROLES } from '../../shared/constants/index.js';
import { auditLog } from '../../shared/middleware/auditLog.js';

const router = Router();

router.use(protect);

router.get('/', authorize(PERMISSIONS.USERS_READ), getUsers);
router.get('/:id', authorize(PERMISSIONS.USERS_READ), getUser);
router.post('/', authorizeRole(ROLES.ADMIN), createUserValidation, validate, auditLog('create', 'users'), createUser);
router.put('/:id', authorizeRole(ROLES.ADMIN), updateUserValidation, validate, auditLog('update', 'users'), updateUser);
router.delete('/:id', authorizeRole(ROLES.ADMIN), auditLog('delete', 'users'), deleteUser);

export default router;

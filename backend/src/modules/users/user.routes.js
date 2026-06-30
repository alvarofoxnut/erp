import { Router } from 'express';
import {
  getUsers, getUser, createUser, updateUser, deleteUser,
  createUserValidation, updateUserValidation,
} from './user.controller.js';
import { protect, authorize } from '../../shared/middleware/auth.js';
import { validate } from '../../shared/middleware/validate.js';
import { PERMISSIONS } from '../../shared/constants/index.js';
import { auditLog } from '../../shared/middleware/auditLog.js';

const router = Router();

router.use(protect);

router.get('/', authorize(PERMISSIONS.USERS_READ), getUsers);
router.get('/:id', authorize(PERMISSIONS.USERS_READ), getUser);
router.post('/', authorize(PERMISSIONS.USERS_WRITE), createUserValidation, validate, auditLog('create', 'users'), createUser);
router.put('/:id', authorize(PERMISSIONS.USERS_WRITE), updateUserValidation, validate, auditLog('update', 'users'), updateUser);
router.delete('/:id', authorize(PERMISSIONS.USERS_WRITE), auditLog('delete', 'users'), deleteUser);

export default router;

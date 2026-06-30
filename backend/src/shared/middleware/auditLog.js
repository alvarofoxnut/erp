import auditService from '../services/auditService.js';
import { AUDIT_PRIORITY } from '../constants/audit.js';
import asyncHandler from '../utils/asyncHandler.js';

const SENSITIVE_BODY_KEYS = ['password'];

function sanitizeBody(body) {
  if (!body || typeof body !== 'object') return body;
  const copy = { ...body };
  for (const key of SENSITIVE_BODY_KEYS) delete copy[key];
  return copy;
}

export const auditLog = (action, module) =>
  asyncHandler(async (req, res, next) => {
    const resourceId = req.params?.id;
    let oldValue = null;

    if (['update', 'delete', 'restore', 'status_change', 'permission_change'].includes(action) && resourceId) {
      oldValue = await auditService.fetchExistingRecord(module, resourceId);
    }

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode < 400) {
        const newValue = body?.data ?? null;
        const resolvedId = newValue?.id || newValue?._id || resourceId;
        const isDelete = action === 'delete';
        const isUserDisable = module === 'users' && oldValue?.isActive && newValue?.isActive === false;

        if (isDelete && oldValue) {
          auditService.logDelete({
            userId: req.user?.id || req.user?._id,
            module,
            recordId: resolvedId || oldValue.id,
            snapshot: oldValue,
            ip: req.ip,
          });
        } else {
          auditService.log({
            userId: req.user?.id || req.user?._id,
            action: isUserDisable ? 'status_change' : action,
            module,
            resourceId: resolvedId,
            oldValue,
            newValue,
            priority: isUserDisable ? AUDIT_PRIORITY.HIGH : undefined,
            details: { method: req.method, path: req.originalUrl, body: sanitizeBody(req.body) },
            ip: req.ip,
          }).catch(() => {});
        }

        if (isUserDisable) {
          auditService.log({
            userId: req.user?.id || req.user?._id,
            action: 'status_change',
            module: 'users',
            resourceId: resolvedId,
            recordType: 'User',
            description: `User disabled: ${oldValue?.name || oldValue?.email}`,
            oldValue: { isActive: true },
            newValue: { isActive: false },
            priority: AUDIT_PRIORITY.HIGH,
            ip: req.ip,
          }).catch(() => {});
        }

        if (module === 'users' && action === 'update' && oldValue && newValue) {
          const permChanged = JSON.stringify(oldValue.permissions) !== JSON.stringify(newValue.permissions)
            || oldValue.role !== newValue.role;
          if (permChanged) {
            auditService.logPermissionChange({
              userId: req.user?.id || req.user?._id,
              targetUserId: resolvedId,
              targetUserName: newValue.name || oldValue.name,
              changes: {
                oldRole: oldValue.role,
                newRole: newValue.role,
                oldPermissions: oldValue.permissions,
                newPermissions: newValue.permissions,
              },
              ip: req.ip,
            }).catch(() => {});
          }

          if (req.body?.password) {
            auditService.log({
              userId: req.user?.id || req.user?._id,
              action: 'password_reset',
              module: 'users',
              resourceId: resolvedId,
              recordType: 'User',
              description: `Password reset for ${newValue.name || oldValue.name}`,
              priority: AUDIT_PRIORITY.HIGH,
              ip: req.ip,
            }).catch(() => {});
          }

          if (oldValue.isActive === false && newValue.isActive === true) {
            auditService.log({
              userId: req.user?.id || req.user?._id,
              action: 'status_change',
              module: 'users',
              resourceId: resolvedId,
              recordType: 'User',
              description: `User activated: ${newValue.name || oldValue.name}`,
              oldValue: { isActive: false },
              newValue: { isActive: true },
              ip: req.ip,
            }).catch(() => {});
          }
        }

        if (module === 'role' && action === 'update' && oldValue && newValue) {
          const permChanged = JSON.stringify(oldValue.permissions) !== JSON.stringify(newValue.permissions);
          if (permChanged) {
            auditService.log({
              userId: req.user?.id || req.user?._id,
              action: 'permission_change',
              module: 'Roles & Permissions',
              resourceId: resolvedId,
              recordType: 'Role',
              description: `Role permissions updated: ${newValue.name || oldValue.name}`,
              oldValue: { permissions: oldValue.permissions },
              newValue: { permissions: newValue.permissions },
              priority: AUDIT_PRIORITY.HIGH,
              ip: req.ip,
            }).catch(() => {});
          }
        }
      }
      return originalJson(body);
    };
    next();
  });

import { Router } from 'express';
import { protect, authorize, authorizeRole } from '../../shared/middleware/auth.js';
import { importLimiter } from '../../shared/middleware/rateLimiters.js';
import { ROLES } from '../../shared/constants/index.js';
import { IMPORT_SCHEMAS } from './import.schemas.js';
import { getImportSchemas, getImportSchema, makeImportHandler } from './import.controller.js';

const router = Router();
router.use(protect);

router.get('/schemas', getImportSchemas);
router.get('/schemas/:entityType', getImportSchema);

for (const [entityType, schema] of Object.entries(IMPORT_SCHEMAS)) {
  const authMiddleware = entityType === 'users'
    ? authorizeRole(ROLES.ADMIN)
    : authorize(schema.permission);

  router.post(
    `/${entityType}`,
    importLimiter,
    authMiddleware,
    makeImportHandler(entityType)
  );
}

export default router;

import { Router } from 'express';
import { protect, authorize } from '../../shared/middleware/auth.js';
import { IMPORT_SCHEMAS } from './import.schemas.js';
import { getImportSchemas, getImportSchema, makeImportHandler } from './import.controller.js';

const router = Router();
router.use(protect);

router.get('/schemas', getImportSchemas);
router.get('/schemas/:entityType', getImportSchema);

for (const [entityType, schema] of Object.entries(IMPORT_SCHEMAS)) {
  router.post(
    `/${entityType}`,
    authorize(schema.permission),
    makeImportHandler(entityType)
  );
}

export default router;

import asyncHandler from '../../shared/utils/asyncHandler.js';
import { successResponse } from '../../shared/utils/apiResponse.js';
import importService from './import.service.js';
import { IMPORT_SCHEMAS } from './import.schemas.js';
import { authorize } from '../../shared/middleware/auth.js';

export const getImportSchemas = asyncHandler(async (req, res) => {
  successResponse(res, importService.listSchemas());
});

export const getImportSchema = asyncHandler(async (req, res) => {
  const schema = importService.getSchema(req.params.entityType);
  if (!schema) {
    return res.status(404).json({ success: false, message: 'Import schema not found' });
  }
  successResponse(res, schema);
});

export const importData = asyncHandler(async (req, res) => {
  const { entityType } = req.params;
  const schema = IMPORT_SCHEMAS[entityType];
  if (!schema) {
    return res.status(404).json({ success: false, message: 'Import type not found' });
  }

  const result = await importService.importRows(entityType, req.body, req.user.id);
  successResponse(res, result, `Imported ${result.imported} row(s)`);
});

export const makeImportHandler = (entityType) => asyncHandler(async (req, res) => {
  const schema = IMPORT_SCHEMAS[entityType];
  if (!schema) {
    return res.status(404).json({ success: false, message: 'Import type not found' });
  }
  const result = await importService.importRows(entityType, req.body, req.user.id);
  successResponse(res, result, `Imported ${result.imported} row(s)`);
});

import { body } from 'express-validator';
import damagesService from './damages.service.js';
import asyncHandler from '../../shared/utils/asyncHandler.js';
import { successResponse, paginatedResponse } from '../../shared/utils/apiResponse.js';
import { buildPagination, buildPaginationMeta } from '../../shared/utils/helpers.js';
import { MANUFACTURING_DAMAGE_INVENTORY_TYPES } from '../../shared/constants/index.js';

const dateRangeQuery = (req) => ({
  search: req.query.search,
  startDate: req.query.startDate,
  endDate: req.query.endDate,
  inventoryType: req.query.inventoryType,
  itemId: req.query.itemId,
});

const lineValidation = [
  body('lines').isArray({ min: 1 }).withMessage('At least one line is required'),
  body('lines.*.quantity').isFloat({ min: 0.01 }),
  body('lines.*.lotNumber').optional().trim(),
  body('lines.*.batchId').optional().isString(),
  body('lines.*.reason').optional().trim(),
];

export const manufacturingDamageValidation = [
  body('date').isISO8601(),
  ...lineValidation,
  body('lines.*.inventoryType')
    .isIn(MANUFACTURING_DAMAGE_INVENTORY_TYPES)
    .withMessage('Invalid inventory type'),
];

export const tradingDamageValidation = [
  body('date').isISO8601(),
  ...lineValidation,
  body('lines.*.itemId').optional().isString(),
  body('lines.*.item').optional().isString(),
];

export const createManufacturingDamage = asyncHandler(async (req, res) => {
  const damage = await damagesService.createManufacturingDamage(req.body, req.user._id);
  successResponse(res, damage, 'Manufacturing damage recorded', 201);
});

export const getManufacturingDamages = asyncHandler(async (req, res) => {
  const { page, limit } = buildPagination(req.query.page, req.query.limit);
  const { damages, total } = await damagesService.getManufacturingDamages({
    ...dateRangeQuery(req),
    page,
    limit,
  });
  paginatedResponse(res, damages, buildPaginationMeta(total, page, limit));
});

export const updateManufacturingDamage = asyncHandler(async (req, res) => {
  const damage = await damagesService.updateManufacturingDamage(
    req.params.id,
    req.body,
    req.user._id
  );
  successResponse(res, damage, 'Manufacturing damage updated');
});

export const deleteManufacturingDamage = asyncHandler(async (req, res) => {
  await damagesService.deleteManufacturingDamage(req.params.id);
  successResponse(res, null, 'Manufacturing damage deleted');
});

export const getManufacturingDamageStockOptions = asyncHandler(async (req, res) => {
  const { inventoryType } = req.query;
  const options = await damagesService.getManufacturingStockOptions(inventoryType);
  successResponse(res, options);
});

export const getTradingDamageStockOptions = asyncHandler(async (req, res) => {
  const { itemId } = req.query;
  const option = await damagesService.getTradingStockOptions(itemId);
  successResponse(res, option);
});

export const createTradingDamage = asyncHandler(async (req, res) => {
  const damage = await damagesService.createTradingDamage(req.body, req.user._id);
  successResponse(res, damage, 'Trading damage recorded', 201);
});

export const getTradingDamages = asyncHandler(async (req, res) => {
  const { page, limit } = buildPagination(req.query.page, req.query.limit);
  const { damages, total } = await damagesService.getTradingDamages({
    ...dateRangeQuery(req),
    page,
    limit,
  });
  paginatedResponse(res, damages, buildPaginationMeta(total, page, limit));
});

export const updateTradingDamage = asyncHandler(async (req, res) => {
  const damage = await damagesService.updateTradingDamage(
    req.params.id,
    req.body,
    req.user._id
  );
  successResponse(res, damage, 'Trading damage updated');
});

export const deleteTradingDamage = asyncHandler(async (req, res) => {
  await damagesService.deleteTradingDamage(req.params.id);
  successResponse(res, null, 'Trading damage deleted');
});

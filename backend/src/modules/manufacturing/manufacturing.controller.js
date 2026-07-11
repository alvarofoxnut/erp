import { body } from 'express-validator';
import { prismaId } from '../../shared/utils/idValidator.js';
import manufacturingService from './manufacturing.service.js';
import packagingService from './packaging.service.js';
import asyncHandler from '../../shared/utils/asyncHandler.js';
import { successResponse, paginatedResponse } from '../../shared/utils/apiResponse.js';
import { buildPagination, buildPaginationMeta } from '../../shared/utils/helpers.js';
import { getDeleteMeta } from '../../shared/utils/softDelete.js';

const dateRangeQuery = (req) => ({
  search: req.query.search,
  startDate: req.query.startDate,
  endDate: req.query.endDate,
  lotNumber: req.query.lotNumber,
});

export const rawPurchaseValidation = [
  prismaId('vendor'),
  body('lotNumber').trim().notEmpty(),
  body('quantity').isFloat({ min: 0.01 }),
  body('purchaseRate').isFloat({ min: 0 }),
  body('date').isISO8601(),
];

export const machineEntryValidation = [
  body('lotNumber').trim().notEmpty(),
  body('quantitySent').isFloat({ min: 0.01 }),
  body('date').isISO8601(),
];

export const qualityProductionValidation = [
  body('date').isISO8601(),
  body('quantity6No').optional().isFloat({ min: 0 }),
  body('quantity5No').optional().isFloat({ min: 0 }),
  body('quantity4_5No').optional().isFloat({ min: 0 }),
  body('quantity4No').optional().isFloat({ min: 0 }),
  body('quantityOthers').optional().isFloat({ min: 0 }),
];

export const finishedProductionValidation = [
  body('date').isISO8601(),
  body('finishedQuantity').isFloat({ min: 0.01 }),
  body('productionMode').isIn(['manual', 'proportionate']),
];

export const vendorValidation = [
  body('name').trim().notEmpty().withMessage('Vendor name required'),
];

export const brandValidation = [
  body('name').trim().notEmpty().withMessage('Brand name required'),
  body('packetSizeGrams').isFloat({ min: 0.01 }).withMessage('Packet size required'),
  body('proportion6No').isFloat({ min: 0 }),
  body('proportion5No').isFloat({ min: 0 }),
  body('proportion4_5No').isFloat({ min: 0 }),
  body('proportion4No').isFloat({ min: 0 }),
  body('proportionOthers').isFloat({ min: 0 }),
  body('packingWeightGrams').optional().isFloat({ min: 0 }),
  body('packagingPrice').optional().isFloat({ min: 0 }),
];

export const packagingValidation = [
  body('date').isISO8601(),
  body('lotNumber').trim().notEmpty(),
  prismaId('brandId'),
  body('quantityPackedKg').isFloat({ min: 0.01 }),
];

export const packagingPreviewValidation = [
  prismaId('brandId'),
  body('quantityPackedKg').isFloat({ min: 0.01 }),
];

export const manufacturingSaleValidation = [
  body('date').isISO8601(),
  body('customerName').trim().notEmpty().withMessage('Customer name required'),
  body('saleType').optional().isIn(['loose', 'branded']),
  body('quantity').optional().isFloat({ min: 0.01 }),
  body('packetCount').optional().isFloat({ min: 0.01 }),
  body('rate').optional().isFloat({ min: 0 }),
  body('amount').isFloat({ min: 0 }),
];

export const createVendor = asyncHandler(async (req, res) => {
  const vendor = await manufacturingService.createVendor(req.body, req.user._id);
  successResponse(res, vendor, 'Manufacturing vendor created', 201);
});

export const getVendors = asyncHandler(async (req, res) => {
  const { page, limit } = buildPagination(req.query.page, req.query.limit);
  const { vendors, total } = await manufacturingService.getVendors({
    search: req.query.search,
    startDate: req.query.startDate,
    endDate: req.query.endDate,
    page,
    limit,
  });
  paginatedResponse(res, vendors, buildPaginationMeta(total, page, limit));
});

export const updateVendor = asyncHandler(async (req, res) => {
  const vendor = await manufacturingService.updateVendor(req.params.id, req.body);
  successResponse(res, vendor, 'Manufacturing vendor updated');
});

export const deleteVendor = asyncHandler(async (req, res) => {
  const { userId, deleteReason } = getDeleteMeta(req);
  await manufacturingService.deleteVendor(req.params.id, userId, deleteReason);
  successResponse(res, null, 'Manufacturing vendor deleted');
});

export const createBrand = asyncHandler(async (req, res) => {
  const brand = await manufacturingService.createBrand(req.body, req.user._id);
  successResponse(res, brand, 'Brand created', 201);
});

export const getBrands = asyncHandler(async (req, res) => {
  const { page, limit } = buildPagination(req.query.page, req.query.limit);
  const { brands, total } = await manufacturingService.getBrands({
    search: req.query.search,
    page,
    limit,
  });
  paginatedResponse(res, brands, buildPaginationMeta(total, page, limit));
});

export const getBrandOptions = asyncHandler(async (req, res) => {
  const brands = await manufacturingService.getBrandOptions();
  successResponse(res, brands);
});

export const getBrandStock = asyncHandler(async (req, res) => {
  const stock = await manufacturingService.getBrandStock(req.params.id);
  successResponse(res, stock);
});

export const updateBrand = asyncHandler(async (req, res) => {
  const brand = await manufacturingService.updateBrand(req.params.id, req.body);
  successResponse(res, brand, 'Brand updated');
});

export const deleteBrand = asyncHandler(async (req, res) => {
  const { userId, deleteReason } = getDeleteMeta(req);
  await manufacturingService.deleteBrand(req.params.id, userId, deleteReason);
  successResponse(res, null, 'Brand deleted');
});

export const createPackaging = asyncHandler(async (req, res) => {
  const transaction = await packagingService.createPackaging(req.body, req.user._id);
  successResponse(res, transaction, 'Branded packaging recorded', 201);
});

export const previewPackaging = asyncHandler(async (req, res) => {
  const preview = await packagingService.previewPackaging(req.body);
  successResponse(res, preview);
});

export const getPackagingTransactions = asyncHandler(async (req, res) => {
  const { page, limit } = buildPagination(req.query.page, req.query.limit);
  const { transactions, total } = await packagingService.getPackagingTransactions({
    ...dateRangeQuery(req),
    brandId: req.query.brandId,
    page,
    limit,
  });
  paginatedResponse(res, transactions, buildPaginationMeta(total, page, limit));
});

export const updatePackaging = asyncHandler(async (req, res) => {
  const transaction = await packagingService.updatePackaging(req.params.id, req.body);
  successResponse(res, transaction, 'Packaging transaction updated');
});

export const deletePackaging = asyncHandler(async (req, res) => {
  const { userId, deleteReason } = getDeleteMeta(req);
  await packagingService.deletePackaging(req.params.id, userId, deleteReason);
  successResponse(res, null, 'Packaging transaction deleted');
});

export const createRawPurchase = asyncHandler(async (req, res) => {
  const purchase = await manufacturingService.createRawPurchase(req.body, req.user._id);
  successResponse(res, purchase, 'Raw purchase created', 201);
});

export const getRawPurchases = asyncHandler(async (req, res) => {
  const { page, limit } = buildPagination(req.query.page, req.query.limit);
  const { purchases, total } = await manufacturingService.getRawPurchases({ ...dateRangeQuery(req), page, limit });
  paginatedResponse(res, purchases, buildPaginationMeta(total, page, limit));
});

export const createMachineEntry = asyncHandler(async (req, res) => {
  const entry = await manufacturingService.createMachineEntry(req.body, req.user._id);
  successResponse(res, entry, 'Machine entry created', 201);
});

export const getMachineEntries = asyncHandler(async (req, res) => {
  const { page, limit } = buildPagination(req.query.page, req.query.limit);
  const { entries, total } = await manufacturingService.getMachineEntries({ ...dateRangeQuery(req), page, limit });
  paginatedResponse(res, entries, buildPaginationMeta(total, page, limit));
});

export const createQualityProduction = asyncHandler(async (req, res) => {
  const production = await manufacturingService.createQualityProduction(req.body, req.user._id);
  successResponse(res, production, 'Quality production recorded', 201);
});

export const getQualityProductions = asyncHandler(async (req, res) => {
  const { page, limit } = buildPagination(req.query.page, req.query.limit);
  const { productions, total } = await manufacturingService.getQualityProductions({ ...dateRangeQuery(req), page, limit });
  paginatedResponse(res, productions, buildPaginationMeta(total, page, limit));
});

export const createFinishedProduction = asyncHandler(async (req, res) => {
  const production = await manufacturingService.createFinishedProduction(req.body, req.user._id);
  successResponse(res, production, 'Finished production recorded', 201);
});

export const getFinishedProductions = asyncHandler(async (req, res) => {
  const { page, limit } = buildPagination(req.query.page, req.query.limit);
  const { productions, total } = await manufacturingService.getFinishedProductions({ ...dateRangeQuery(req), page, limit });
  paginatedResponse(res, productions, buildPaginationMeta(total, page, limit));
});

export const getProductionTrend = asyncHandler(async (req, res) => {
  const startDate = req.query.startDate || new Date(new Date().getFullYear(), 0, 1);
  const endDate = req.query.endDate || new Date();
  const trend = await manufacturingService.getProductionTrend(startDate, endDate);
  successResponse(res, trend);
});

export const getAvailableLots = asyncHandler(async (req, res) => {
  const lots = await manufacturingService.getAvailableLots();
  successResponse(res, lots);
});

export const getWipStock = asyncHandler(async (req, res) => {
  const stock = await manufacturingService.getWipStock();
  successResponse(res, stock);
});

export const getWipLots = asyncHandler(async (req, res) => {
  const lots = await manufacturingService.getWipLots();
  successResponse(res, lots);
});

export const getLotsQualityStock = asyncHandler(async (req, res) => {
  const lots = await manufacturingService.getLotsQualityStock();
  successResponse(res, lots);
});

export const updateRawPurchase = asyncHandler(async (req, res) => {
  const purchase = await manufacturingService.updateRawPurchase(req.params.id, req.body);
  successResponse(res, purchase, 'Raw purchase updated');
});

export const deleteRawPurchase = asyncHandler(async (req, res) => {
  const { userId, deleteReason } = getDeleteMeta(req);
  await manufacturingService.deleteRawPurchase(req.params.id, userId, deleteReason);
  successResponse(res, null, 'Raw purchase deleted');
});

export const updateMachineEntry = asyncHandler(async (req, res) => {
  const entry = await manufacturingService.updateMachineEntry(req.params.id, req.body);
  successResponse(res, entry, 'Machine entry updated');
});

export const deleteMachineEntry = asyncHandler(async (req, res) => {
  const { userId, deleteReason } = getDeleteMeta(req);
  await manufacturingService.deleteMachineEntry(req.params.id, userId, deleteReason);
  successResponse(res, null, 'Machine entry deleted');
});

export const updateQualityProduction = asyncHandler(async (req, res) => {
  const production = await manufacturingService.updateQualityProduction(req.params.id, req.body);
  successResponse(res, production, 'Quality production updated');
});

export const deleteQualityProduction = asyncHandler(async (req, res) => {
  const { userId, deleteReason } = getDeleteMeta(req);
  await manufacturingService.deleteQualityProduction(req.params.id, userId, deleteReason);
  successResponse(res, null, 'Quality production deleted');
});

export const updateFinishedProduction = asyncHandler(async (req, res) => {
  const production = await manufacturingService.updateFinishedProduction(req.params.id, req.body);
  successResponse(res, production, 'Finished production updated');
});

export const deleteFinishedProduction = asyncHandler(async (req, res) => {
  const { userId, deleteReason } = getDeleteMeta(req);
  await manufacturingService.deleteFinishedProduction(req.params.id, userId, deleteReason);
  successResponse(res, null, 'Finished production deleted');
});

export const getFinishedGoodsStock = asyncHandler(async (req, res) => {
  const stock = await manufacturingService.getFinishedGoodsStock();
  successResponse(res, stock);
});

export const getFinishedGoodsBatches = asyncHandler(async (req, res) => {
  const batches = await manufacturingService.getFinishedGoodsBatches();
  successResponse(res, batches);
});

export const getManufacturingSaleAllocations = asyncHandler(async (req, res) => {
  const allocations = await manufacturingService.getManufacturingSaleAllocations(req.params.id);
  successResponse(res, allocations);
});

export const createManufacturingSale = asyncHandler(async (req, res) => {
  const sale = await manufacturingService.createManufacturingSale(req.body, req.user._id);
  successResponse(res, sale, 'Manufacturing sale created', 201);
});

export const getManufacturingSales = asyncHandler(async (req, res) => {
  const { page, limit } = buildPagination(req.query.page, req.query.limit);
  const { sales, total } = await manufacturingService.getManufacturingSales({
    ...dateRangeQuery(req),
    page,
    limit,
  });
  paginatedResponse(res, sales, buildPaginationMeta(total, page, limit));
});

export const updateManufacturingSale = asyncHandler(async (req, res) => {
  const sale = await manufacturingService.updateManufacturingSale(req.params.id, req.body);
  successResponse(res, sale, 'Manufacturing sale updated');
});

export const deleteManufacturingSale = asyncHandler(async (req, res) => {
  const { userId, deleteReason } = getDeleteMeta(req);
  await manufacturingService.deleteManufacturingSale(req.params.id, userId, deleteReason);
  successResponse(res, null, 'Manufacturing sale deleted');
});

import { body } from 'express-validator';
import { prismaId } from '../../shared/utils/idValidator.js';
import tradingService from './trading.service.js';
import asyncHandler from '../../shared/utils/asyncHandler.js';
import { successResponse, paginatedResponse } from '../../shared/utils/apiResponse.js';
import { buildPagination, buildPaginationMeta } from '../../shared/utils/helpers.js';
import { getDeleteMeta } from '../../shared/utils/softDelete.js';

export const itemValidation = [
  body('name').trim().notEmpty().withMessage('Item name required'),
];

export const partyValidation = [
  body('name').trim().notEmpty(),
  body('type').isIn(['vendor', 'customer', 'both']),
];

export const purchaseValidation = [
  body('date').isISO8601(),
  prismaId('party'),
  prismaId('item'),
  body('quantity').isFloat({ min: 0.01 }),
  body('rate').optional().isFloat({ min: 0 }),
  body('amount').isFloat({ min: 0 }),
];

export const saleValidation = [
  body('date').isISO8601(),
  body('customerName').trim().notEmpty(),
  prismaId('item'),
  body('quantity').isFloat({ min: 0.01 }),
  body('rate').optional().isFloat({ min: 0 }),
  body('amount').isFloat({ min: 0 }),
];

const listQuery = (req) => ({
  search: req.query.search,
  startDate: req.query.startDate,
  endDate: req.query.endDate,
  party: req.query.party,
  item: req.query.item,
});

// Items
export const getItems = asyncHandler(async (req, res) => {
  const { page, limit } = buildPagination(req.query.page, req.query.limit);
  const { items, total } = await tradingService.getItems({
    search: req.query.search,
    startDate: req.query.startDate,
    endDate: req.query.endDate,
    page,
    limit,
  });
  paginatedResponse(res, items, buildPaginationMeta(total, page, limit));
});

export const createItem = asyncHandler(async (req, res) => {
  const item = await tradingService.createItem(req.body, req.user._id);
  successResponse(res, item, 'Item created', 201);
});

export const updateItem = asyncHandler(async (req, res) => {
  const item = await tradingService.updateItem(req.params.id, req.body);
  successResponse(res, item, 'Item updated');
});

export const deleteItem = asyncHandler(async (req, res) => {
  const { userId, deleteReason } = getDeleteMeta(req);
  await tradingService.deleteItem(req.params.id, userId, deleteReason);
  successResponse(res, null, 'Item deleted');
});

// Parties
export const getParties = asyncHandler(async (req, res) => {
  const { page, limit } = buildPagination(req.query.page, req.query.limit);
  const { parties, total } = await tradingService.getParties({
    search: req.query.search,
    type: req.query.type,
    item: req.query.item,
    startDate: req.query.startDate,
    endDate: req.query.endDate,
    page,
    limit,
  });
  paginatedResponse(res, parties, buildPaginationMeta(total, page, limit));
});

export const createParty = asyncHandler(async (req, res) => {
  const party = await tradingService.createParty(req.body, req.user._id);
  successResponse(res, party, 'Party created', 201);
});

export const updateParty = asyncHandler(async (req, res) => {
  const party = await tradingService.updateParty(req.params.id, req.body);
  successResponse(res, party, 'Party updated');
});

export const deleteParty = asyncHandler(async (req, res) => {
  const { userId, deleteReason } = getDeleteMeta(req);
  await tradingService.deleteParty(req.params.id, userId, deleteReason);
  successResponse(res, null, 'Party deleted');
});

// Purchases
export const createPurchase = asyncHandler(async (req, res) => {
  const purchase = await tradingService.createPurchase(req.body, req.user._id);
  successResponse(res, purchase, 'Purchase created', 201);
});

export const getPurchases = asyncHandler(async (req, res) => {
  const { page, limit } = buildPagination(req.query.page, req.query.limit);
  const { purchases, total } = await tradingService.getPurchases({ ...listQuery(req), page, limit });
  paginatedResponse(res, purchases, buildPaginationMeta(total, page, limit));
});

export const updatePurchase = asyncHandler(async (req, res) => {
  const purchase = await tradingService.updatePurchase(req.params.id, req.body);
  successResponse(res, purchase, 'Purchase updated');
});

export const deletePurchase = asyncHandler(async (req, res) => {
  const { userId, deleteReason } = getDeleteMeta(req);
  await tradingService.deletePurchase(req.params.id, userId, deleteReason);
  successResponse(res, null, 'Purchase deleted');
});

// Sales
export const createSale = asyncHandler(async (req, res) => {
  const sale = await tradingService.createSale(req.body, req.user._id);
  successResponse(res, sale, 'Sale created', 201);
});

export const getSales = asyncHandler(async (req, res) => {
  const { page, limit } = buildPagination(req.query.page, req.query.limit);
  const { sales, total } = await tradingService.getSales({ ...listQuery(req), page, limit });
  paginatedResponse(res, sales, buildPaginationMeta(total, page, limit));
});

export const updateSale = asyncHandler(async (req, res) => {
  const sale = await tradingService.updateSale(req.params.id, req.body);
  successResponse(res, sale, 'Sale updated');
});

export const deleteSale = asyncHandler(async (req, res) => {
  const { userId, deleteReason } = getDeleteMeta(req);
  await tradingService.deleteSale(req.params.id, userId, deleteReason);
  successResponse(res, null, 'Sale deleted');
});

import asyncHandler from '../../shared/utils/asyncHandler.js';
import { successResponse, paginatedResponse } from '../../shared/utils/apiResponse.js';
import { buildPagination, buildPaginationMeta } from '../../shared/utils/helpers.js';
import inventoryService from './inventory.service.js';
import inventoryRepository from './inventory.repository.js';
import { prisma } from '../../config/db.js';

export const getStockSummary = asyncHandler(async (req, res) => {
  const summary = await inventoryService.getStockSummary();

  const tradingItems = await prisma.item.findMany({ where: { isActive: true } });
  const tradingStock = [];
  for (const item of tradingItems) {
    const balance = await inventoryRepository.getCurrentBalance('trading', { item: item.id });
    tradingStock.push({ item, balance });
  }

  successResponse(res, { ...summary, tradingStock });
});

export const getStockLedger = asyncHandler(async (req, res) => {
  const { page, limit, skip } = buildPagination(req.query.page, req.query.limit);
  const { entries, total } = await inventoryService.getLedgerEntries(
    {
      category: req.query.category,
      item: req.query.item,
      lotNumber: req.query.lotNumber,
      movementType: req.query.movementType,
      direction: req.query.direction,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      search: req.query.search,
    },
    { skip, limit }
  );
  paginatedResponse(res, entries, buildPaginationMeta(total, page, limit));
});

export const getLotWiseStock = asyncHandler(async (req, res) => {
  const stock = await inventoryService.getLotWiseStock(req.params.lotNumber);
  successResponse(res, stock);
});

export const getInventoryTrend = asyncHandler(async (req, res) => {
  const startDate = req.query.startDate || new Date(new Date().getFullYear(), 0, 1);
  const endDate = req.query.endDate || new Date();
  const trend = await inventoryService.getInventoryTrend(startDate, endDate);
  successResponse(res, trend);
});

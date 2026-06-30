import auditModuleService from './audit.service.js';
import asyncHandler from '../../shared/utils/asyncHandler.js';
import { successResponse, paginatedResponse } from '../../shared/utils/apiResponse.js';
import { buildPagination, buildPaginationMeta, getDateRange } from '../../shared/utils/helpers.js';
import { prisma } from '../../config/db.js';

export const getAuditLogs = asyncHandler(async (req, res) => {
  const result = await auditModuleService.getAuditLogs(req.query);
  paginatedResponse(res, result.logs, result.pagination, 'Audit logs fetched');
});

export const getAuditLogById = asyncHandler(async (req, res) => {
  const log = await auditModuleService.getAuditLogById(req.params.id);
  successResponse(res, log, 'Audit log fetched');
});

export const getDashboardStats = asyncHandler(async (req, res) => {
  const stats = await auditModuleService.getDashboardStats();
  successResponse(res, stats, 'Audit dashboard stats fetched');
});

export const getFilterOptions = asyncHandler(async (req, res) => {
  const options = auditModuleService.getFilterOptions();
  successResponse(res, options, 'Filter options fetched');
});

export const exportAuditLogs = asyncHandler(async (req, res) => {
  const buffer = await auditModuleService.exportAuditLogs(req.query);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=audit-logs.xlsx');
  res.send(buffer);
});

export const getInventoryAuditLogs = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, startDate, endDate, sourceModule, stockType, userId } = req.query;
  const { page: pageNum, limit: limitNum, skip } = buildPagination(page, limit);

  const where = {};
  if (userId) where.userId = userId;
  if (sourceModule) where.sourceModule = sourceModule;
  if (stockType) where.stockType = stockType;
  if (startDate || endDate) {
    const { start, end } = getDateRange(startDate, endDate);
    where.date = { gte: start, lte: end };
  }

  const [logs, total] = await Promise.all([
    prisma.inventoryAuditLog.findMany({
      where,
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { date: 'desc' },
      skip,
      take: limitNum,
    }),
    prisma.inventoryAuditLog.count({ where }),
  ]);

  paginatedResponse(res, logs, buildPaginationMeta(total, pageNum, limitNum), 'Inventory audit logs fetched');
});

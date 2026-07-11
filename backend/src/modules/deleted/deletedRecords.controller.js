import asyncHandler from '../../shared/utils/asyncHandler.js';
import { successResponse, paginatedResponse } from '../../shared/utils/apiResponse.js';
import { buildPagination } from '../../shared/utils/helpers.js';
import deletedRecordsService from './deletedRecords.service.js';

export const listModules = asyncHandler(async (req, res) => {
  successResponse(res, deletedRecordsService.listModules());
});

export const getDeletedCounts = asyncHandler(async (req, res) => {
  successResponse(res, await deletedRecordsService.countAll());
});

export const listDeleted = asyncHandler(async (req, res) => {
  const { page, limit } = buildPagination(req.query.page, req.query.limit);
  const { items, pagination } = await deletedRecordsService.listDeleted(req.params.module, {
    search: req.query.search,
    page,
    limit,
  });
  paginatedResponse(res, items, pagination);
});

export const restoreDeleted = asyncHandler(async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const restored = await deletedRecordsService.restore(req.params.module, req.params.id, userId);
  successResponse(res, restored, 'Record restored');
});

import { body } from 'express-validator';
import roleService from './role.service.js';
import asyncHandler from '../../shared/utils/asyncHandler.js';
import { successResponse, paginatedResponse } from '../../shared/utils/apiResponse.js';
import { buildPagination, buildPaginationMeta } from '../../shared/utils/helpers.js';

export const createRoleValidation = [
  body('name').trim().notEmpty().withMessage('Role name required'),
  body('permissions').isArray({ min: 1 }).withMessage('At least one permission required'),
];

export const updateRoleValidation = [
  body('name').optional().trim().notEmpty(),
  body('permissions').optional().isArray({ min: 1 }),
  body('description').optional().isString(),
];

export const getRoles = asyncHandler(async (req, res) => {
  const { page, limit } = buildPagination(req.query.page, req.query.limit);
  const { roles, total } = await roleService.getAll({ search: req.query.search, page, limit });
  paginatedResponse(res, roles, buildPaginationMeta(total, page, limit));
});

export const getPermissionCatalog = asyncHandler(async (req, res) => {
  const catalog = await roleService.getPermissionCatalog();
  successResponse(res, catalog);
});

export const createRole = asyncHandler(async (req, res) => {
  const role = await roleService.create(req.body, req.user._id);
  successResponse(res, role, 'Role created', 201);
});

export const updateRole = asyncHandler(async (req, res) => {
  const role = await roleService.update(req.params.id, req.body);
  successResponse(res, role, 'Role updated');
});

export const deleteRole = asyncHandler(async (req, res) => {
  await roleService.delete(req.params.id);
  successResponse(res, null, 'Role deleted');
});

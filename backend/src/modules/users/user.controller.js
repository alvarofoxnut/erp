import { body } from 'express-validator';
import { prismaId } from '../../shared/utils/idValidator.js';
import userService from './user.service.js';
import asyncHandler from '../../shared/utils/asyncHandler.js';
import { successResponse, paginatedResponse } from '../../shared/utils/apiResponse.js';
import { buildPagination, buildPaginationMeta } from '../../shared/utils/helpers.js';

export const createUserValidation = [
  body('name').trim().notEmpty().withMessage('Name required'),
  body('email').isEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 6 }).withMessage('Password min 6 chars'),
  body('role').trim().notEmpty().withMessage('Role required'),
];

export const updateUserValidation = [
  prismaId('id', 'param'),
  body('name').optional().trim().notEmpty(),
  body('email').optional().isEmail(),
  body('role').optional().trim().notEmpty(),
];

export const getUsers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = buildPagination(req.query.page, req.query.limit);
  const { users, total } = await userService.getAll({ ...req.query, page, limit });
  paginatedResponse(res, users, buildPaginationMeta(total, page, limit));
});

export const getUser = asyncHandler(async (req, res) => {
  const user = await userService.getById(req.params.id);
  successResponse(res, user);
});

export const createUser = asyncHandler(async (req, res) => {
  const user = await userService.create(req.body);
  successResponse(res, user, 'User created', 201);
});

export const updateUser = asyncHandler(async (req, res) => {
  const user = await userService.update(req.params.id, req.body);
  successResponse(res, user, 'User updated');
});

export const deleteUser = asyncHandler(async (req, res) => {
  await userService.delete(req.params.id);
  successResponse(res, null, 'User deactivated');
});

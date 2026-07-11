import { body } from 'express-validator';
import authService from './auth.service.js';
import asyncHandler from '../../shared/utils/asyncHandler.js';
import { successResponse } from '../../shared/utils/apiResponse.js';
import {
  accessTokenCookieOptions,
  refreshTokenCookieOptions,
} from '../../shared/utils/cookieOptions.js';

export const loginValidation = [
  body('email').isEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password required'),
];

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const result = await authService.login(email, password, { ip: req.ip });

  res.cookie('accessToken', result.accessToken, accessTokenCookieOptions());
  res.cookie('refreshToken', result.refreshToken, refreshTokenCookieOptions());

  successResponse(res, { user: result.user, accessToken: result.accessToken }, 'Login successful');
});

export const refresh = asyncHandler(async (req, res) => {
  const token = req.body.refreshToken || req.cookies.refreshToken;
  const result = await authService.refresh(token);

  res.cookie('accessToken', result.accessToken, accessTokenCookieOptions());
  res.cookie('refreshToken', result.refreshToken, refreshTokenCookieOptions());

  successResponse(res, { accessToken: result.accessToken }, 'Token refreshed');
});

export const logout = asyncHandler(async (req, res) => {
  await authService.logout(req.user._id);
  res.clearCookie('accessToken', accessTokenCookieOptions());
  res.clearCookie('refreshToken', refreshTokenCookieOptions());
  successResponse(res, null, 'Logged out successfully');
});

export const getMe = asyncHandler(async (req, res) => {
  successResponse(res, req.user, 'User profile fetched');
});

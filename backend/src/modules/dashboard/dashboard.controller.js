import dashboardService from './dashboard.service.js';
import auditModuleService from '../audit/audit.service.js';
import asyncHandler from '../../shared/utils/asyncHandler.js';
import { successResponse } from '../../shared/utils/apiResponse.js';
import { ROLES } from '../../shared/constants/index.js';

export const getDashboard = asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  const data = await dashboardService.getDashboardData();

  if (req.user?.role === ROLES.ADMIN) {
    data.auditSummary = await auditModuleService.getDashboardStats();
  }

  successResponse(res, data);
});

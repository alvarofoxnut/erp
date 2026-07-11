import { Router } from 'express';
import {
  getStockReport, getLooseStockReport, getBrandedStockReport,
  getProductionReport, getSalesReport, getPurchaseReport,
  getVendorReport, getCustomerReport, getExpenseReport, getProfitLossReport,
  getTradingAccountReport, exportTradingAccountReport,
  getManufacturingDamageReport, getTradingDamageReport,
  getLotWiseReport, exportReport,
} from './reports.controller.js';
import { protect, authorize } from '../../shared/middleware/auth.js';
import { PERMISSIONS } from '../../shared/constants/index.js';
import { reportExportLimiter } from '../../shared/middleware/rateLimiters.js';

const router = Router();
router.use(protect, authorize(PERMISSIONS.REPORTS_READ));

router.get('/stock', getStockReport);
router.get('/loose-stock', getLooseStockReport);
router.get('/branded-stock', getBrandedStockReport);
router.get('/production', getProductionReport);
router.get('/sales', getSalesReport);
router.get('/purchase', getPurchaseReport);
router.get('/vendors', getVendorReport);
router.get('/customers', getCustomerReport);
router.get('/expenses', getExpenseReport);
router.get('/profit-loss', getProfitLossReport);
router.get('/trading-account', getTradingAccountReport);
router.get('/trading-account/export', reportExportLimiter, exportTradingAccountReport);
router.get('/manufacturing-damages', getManufacturingDamageReport);
router.get('/trading-damages', getTradingDamageReport);
router.get('/lot/:lotNumber', getLotWiseReport);
router.get('/export/:reportType', reportExportLimiter, exportReport);

export default router;

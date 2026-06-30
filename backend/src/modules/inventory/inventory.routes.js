import { Router } from 'express';
import {
  getStockSummary, getStockLedger, getLotWiseStock, getInventoryTrend,
} from './inventory.controller.js';
import { protect, authorize } from '../../shared/middleware/auth.js';
import { PERMISSIONS } from '../../shared/constants/index.js';

const router = Router();
router.use(protect);

router.get('/summary', authorize(PERMISSIONS.INVENTORY_READ), getStockSummary);
router.get('/ledger', authorize(PERMISSIONS.INVENTORY_READ), getStockLedger);
router.get('/lot/:lotNumber', authorize(PERMISSIONS.INVENTORY_READ), getLotWiseStock);
router.get('/trend', authorize(PERMISSIONS.INVENTORY_READ), getInventoryTrend);

export default router;

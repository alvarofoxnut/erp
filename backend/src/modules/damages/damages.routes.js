import { Router } from 'express';
import {
  createManufacturingDamage,
  getManufacturingDamages,
  updateManufacturingDamage,
  deleteManufacturingDamage,
  createTradingDamage,
  getTradingDamages,
  updateTradingDamage,
  deleteTradingDamage,
  getManufacturingDamageStockOptions,
  getTradingDamageStockOptions,
  manufacturingDamageValidation,
  tradingDamageValidation,
} from './damages.controller.js';
import { protect, authorize } from '../../shared/middleware/auth.js';
import { validate } from '../../shared/middleware/validate.js';
import { PERMISSIONS } from '../../shared/constants/index.js';
import { auditLog } from '../../shared/middleware/auditLog.js';

const router = Router();
router.use(protect);

const R = PERMISSIONS;

router.post(
  '/manufacturing',
  authorize(R.MFG_DAMAGES_WRITE),
  manufacturingDamageValidation,
  validate,
  auditLog('create', 'manufacturingDamage'),
  createManufacturingDamage
);
router.get('/manufacturing', authorize(R.MFG_DAMAGES_READ), getManufacturingDamages);
router.get('/manufacturing/stock-options', authorize(R.MFG_DAMAGES_READ), getManufacturingDamageStockOptions);
router.put(
  '/manufacturing/:id',
  authorize(R.MFG_DAMAGES_WRITE),
  manufacturingDamageValidation,
  validate,
  auditLog('update', 'manufacturingDamage'),
  updateManufacturingDamage
);
router.delete(
  '/manufacturing/:id',
  authorize(R.MFG_DAMAGES_WRITE),
  auditLog('delete', 'manufacturingDamage'),
  deleteManufacturingDamage
);

router.post(
  '/trading',
  authorize(R.TRADING_DAMAGES_WRITE),
  tradingDamageValidation,
  validate,
  auditLog('create', 'tradingDamage'),
  createTradingDamage
);
router.get('/trading', authorize(R.TRADING_DAMAGES_READ), getTradingDamages);
router.get('/trading/stock-options', authorize(R.TRADING_DAMAGES_READ), getTradingDamageStockOptions);
router.put(
  '/trading/:id',
  authorize(R.TRADING_DAMAGES_WRITE),
  tradingDamageValidation,
  validate,
  auditLog('update', 'tradingDamage'),
  updateTradingDamage
);
router.delete(
  '/trading/:id',
  authorize(R.TRADING_DAMAGES_WRITE),
  auditLog('delete', 'tradingDamage'),
  deleteTradingDamage
);

export default router;

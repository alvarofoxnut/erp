import { Router } from 'express';
import {
  getItems, createItem, updateItem, deleteItem,
  getParties, createParty, updateParty, deleteParty,
  getPurchases, createPurchase, updatePurchase, deletePurchase,
  getSales, createSale, updateSale, deleteSale,
  itemValidation, partyValidation, purchaseValidation, saleValidation,
} from './trading.controller.js';
import { protect, authorize } from '../../shared/middleware/auth.js';
import { validate } from '../../shared/middleware/validate.js';
import { PERMISSIONS } from '../../shared/constants/index.js';
import { auditLog } from '../../shared/middleware/auditLog.js';

const router = Router();
router.use(protect);

const R = PERMISSIONS;

router.get('/items', authorize(R.TRADING_ITEMS_READ), getItems);
router.post('/items', authorize(R.TRADING_ITEMS_WRITE), itemValidation, validate, auditLog('create', 'item'), createItem);
router.put('/items/:id', authorize(R.TRADING_ITEMS_WRITE), itemValidation, validate, auditLog('update', 'item'), updateItem);
router.delete('/items/:id', authorize(R.TRADING_ITEMS_WRITE), auditLog('delete', 'item'), deleteItem);

router.get('/parties', authorize(R.TRADING_VENDORS_READ), getParties);
router.post('/parties', authorize(R.TRADING_VENDORS_WRITE), partyValidation, validate, auditLog('create', 'party'), createParty);
router.put('/parties/:id', authorize(R.TRADING_VENDORS_WRITE), partyValidation, validate, auditLog('update', 'party'), updateParty);
router.delete('/parties/:id', authorize(R.TRADING_VENDORS_WRITE), auditLog('delete', 'party'), deleteParty);

router.get('/purchases', authorize(R.TRADING_PURCHASES_READ), getPurchases);
router.post('/purchases', authorize(R.TRADING_PURCHASES_WRITE), purchaseValidation, validate, auditLog('create', 'purchase'), createPurchase);
router.put('/purchases/:id', authorize(R.TRADING_PURCHASES_WRITE), purchaseValidation, validate, auditLog('update', 'purchase'), updatePurchase);
router.delete('/purchases/:id', authorize(R.TRADING_PURCHASES_WRITE), auditLog('delete', 'purchase'), deletePurchase);

router.get('/sales', authorize(R.TRADING_SALES_READ), getSales);
router.post('/sales', authorize(R.TRADING_SALES_WRITE), saleValidation, validate, auditLog('create', 'sale'), createSale);
router.put('/sales/:id', authorize(R.TRADING_SALES_WRITE), saleValidation, validate, auditLog('update', 'sale'), updateSale);
router.delete('/sales/:id', authorize(R.TRADING_SALES_WRITE), auditLog('delete', 'sale'), deleteSale);

export default router;

import { Router } from 'express';
import {
  createVendor, getVendors, updateVendor, deleteVendor,
  createBrand, getBrands, getBrandOptions, getBrandStock, updateBrand, deleteBrand,
  createPackaging, updatePackaging, previewPackaging, getPackagingTransactions, deletePackaging,
  createRawPurchase, getRawPurchases, updateRawPurchase, deleteRawPurchase,
  createMachineEntry, getMachineEntries, updateMachineEntry, deleteMachineEntry,
  createQualityProduction, getQualityProductions, updateQualityProduction, deleteQualityProduction,
  createFinishedProduction, getFinishedProductions, updateFinishedProduction, deleteFinishedProduction,
  createManufacturingSale, getManufacturingSales, updateManufacturingSale, deleteManufacturingSale,
  getProductionTrend, getAvailableLots, getWipStock, getWipLots, getLotsQualityStock,
  getFinishedGoodsStock, getFinishedGoodsBatches, getManufacturingSaleAllocations,
  vendorValidation, brandValidation, packagingValidation, packagingPreviewValidation,
  manufacturingSaleValidation,
  rawPurchaseValidation, machineEntryValidation,
  qualityProductionValidation, finishedProductionValidation,
} from './manufacturing.controller.js';
import { protect, authorize } from '../../shared/middleware/auth.js';
import { validate } from '../../shared/middleware/validate.js';
import { PERMISSIONS } from '../../shared/constants/index.js';
import { auditLog } from '../../shared/middleware/auditLog.js';

const router = Router();
router.use(protect);

const R = PERMISSIONS;

router.get('/production-trend', authorize(R.MFG_QUALITY_READ), getProductionTrend);
router.get('/available-lots', authorize(R.MFG_WIP_READ), getAvailableLots);
router.get('/wip-stock', authorize(R.MFG_WIP_READ), getWipStock);
router.get('/wip-lots', authorize(R.MFG_QUALITY_READ), getWipLots);
router.get('/lots-quality-stock', authorize(R.MFG_FINISHED_READ), getLotsQualityStock);
router.get('/finished-goods-stock', authorize(R.MFG_SALES_READ), getFinishedGoodsStock);
router.get('/finished-goods-batches', authorize(R.MFG_FINISHED_READ), getFinishedGoodsBatches);

router.get('/vendors', authorize(R.MFG_VENDORS_READ), getVendors);
router.post('/vendors', authorize(R.MFG_VENDORS_WRITE), vendorValidation, validate, auditLog('create', 'manufacturingVendor'), createVendor);
router.put('/vendors/:id', authorize(R.MFG_VENDORS_WRITE), vendorValidation, validate, auditLog('update', 'manufacturingVendor'), updateVendor);
router.delete('/vendors/:id', authorize(R.MFG_VENDORS_WRITE), auditLog('delete', 'manufacturingVendor'), deleteVendor);

router.get('/brands/options', authorize(R.MFG_BRANDS_READ), getBrandOptions);
router.get('/brands/:id/stock', authorize(R.MFG_SALES_READ), getBrandStock);
router.get('/brands', authorize(R.MFG_BRANDS_READ), getBrands);
router.post('/brands', authorize(R.MFG_BRANDS_WRITE), brandValidation, validate, auditLog('create', 'brand'), createBrand);
router.put('/brands/:id', authorize(R.MFG_BRANDS_WRITE), brandValidation, validate, auditLog('update', 'brand'), updateBrand);
router.delete('/brands/:id', authorize(R.MFG_BRANDS_WRITE), auditLog('delete', 'brand'), deleteBrand);

router.post('/packaging/preview', authorize(R.MFG_FINISHED_READ), packagingPreviewValidation, validate, previewPackaging);
router.get('/packaging', authorize(R.MFG_FINISHED_READ), getPackagingTransactions);
router.post('/packaging', authorize(R.MFG_FINISHED_WRITE), packagingValidation, validate, auditLog('create', 'packagingTransaction'), createPackaging);
router.put('/packaging/:id', authorize(R.MFG_FINISHED_WRITE), packagingValidation, validate, auditLog('update', 'packagingTransaction'), updatePackaging);
router.delete('/packaging/:id', authorize(R.MFG_FINISHED_WRITE), auditLog('delete', 'packagingTransaction'), deletePackaging);

router.post('/raw-purchases', authorize(R.MFG_RAW_PURCHASE_WRITE), rawPurchaseValidation, validate, auditLog('create', 'rawPurchase'), createRawPurchase);
router.get('/raw-purchases', authorize(R.MFG_RAW_PURCHASE_READ), getRawPurchases);
router.put('/raw-purchases/:id', authorize(R.MFG_RAW_PURCHASE_WRITE), rawPurchaseValidation, validate, auditLog('update', 'rawPurchase'), updateRawPurchase);
router.delete('/raw-purchases/:id', authorize(R.MFG_RAW_PURCHASE_WRITE), auditLog('delete', 'rawPurchase'), deleteRawPurchase);

router.post('/machine-entries', authorize(R.MFG_WIP_WRITE), machineEntryValidation, validate, auditLog('create', 'machineEntry'), createMachineEntry);
router.get('/machine-entries', authorize(R.MFG_WIP_READ), getMachineEntries);
router.put('/machine-entries/:id', authorize(R.MFG_WIP_WRITE), machineEntryValidation, validate, auditLog('update', 'machineEntry'), updateMachineEntry);
router.delete('/machine-entries/:id', authorize(R.MFG_WIP_WRITE), auditLog('delete', 'machineEntry'), deleteMachineEntry);

router.post('/quality-productions', authorize(R.MFG_QUALITY_WRITE), qualityProductionValidation, validate, auditLog('create', 'qualityProduction'), createQualityProduction);
router.get('/quality-productions', authorize(R.MFG_QUALITY_READ), getQualityProductions);
router.put('/quality-productions/:id', authorize(R.MFG_QUALITY_WRITE), qualityProductionValidation, validate, auditLog('update', 'qualityProduction'), updateQualityProduction);
router.delete('/quality-productions/:id', authorize(R.MFG_QUALITY_WRITE), auditLog('delete', 'qualityProduction'), deleteQualityProduction);

router.post('/finished-productions', authorize(R.MFG_FINISHED_WRITE), finishedProductionValidation, validate, auditLog('create', 'finishedProduction'), createFinishedProduction);
router.get('/finished-productions', authorize(R.MFG_FINISHED_READ), getFinishedProductions);
router.put('/finished-productions/:id', authorize(R.MFG_FINISHED_WRITE), finishedProductionValidation, validate, auditLog('update', 'finishedProduction'), updateFinishedProduction);
router.delete('/finished-productions/:id', authorize(R.MFG_FINISHED_WRITE), auditLog('delete', 'finishedProduction'), deleteFinishedProduction);

router.post('/sales', authorize(R.MFG_SALES_WRITE), manufacturingSaleValidation, validate, auditLog('create', 'manufacturingSale'), createManufacturingSale);
router.get('/sales', authorize(R.MFG_SALES_READ), getManufacturingSales);
router.get('/sales/:id/allocations', authorize(R.MFG_SALES_READ), getManufacturingSaleAllocations);
router.put('/sales/:id', authorize(R.MFG_SALES_WRITE), manufacturingSaleValidation, validate, auditLog('update', 'manufacturingSale'), updateManufacturingSale);
router.delete('/sales/:id', authorize(R.MFG_SALES_WRITE), auditLog('delete', 'manufacturingSale'), deleteManufacturingSale);

export default router;

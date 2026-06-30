import { Router } from 'express';
import {
  createExpense, getExpenses, getExpenseSummary, updateExpense, deleteExpense,
  createInvoice, getInvoices, getInvoice, updateInvoice, updateInvoicePayment, deleteInvoice, getPendingPayments, getUninvoicedSales, getUninvoicedPurchases,
  getLedgers, getLedgerEntries, getBalanceSheet, exportBalanceSheet,
  expenseValidation, expenseUpdateValidation, invoiceValidation, invoiceUpdateValidation,
} from './accounting.controller.js';
import { protect, authorize } from '../../shared/middleware/auth.js';
import { validate } from '../../shared/middleware/validate.js';
import { PERMISSIONS } from '../../shared/constants/index.js';
import { auditLog } from '../../shared/middleware/auditLog.js';

const router = Router();
router.use(protect);

const R = PERMISSIONS;

router.post('/expenses', authorize(R.EXPENSES_WRITE), expenseValidation, validate, auditLog('create', 'expense'), createExpense);
router.get('/expenses', authorize(R.EXPENSES_READ), getExpenses);
router.get('/expenses/summary', authorize(R.EXPENSES_READ), getExpenseSummary);
router.put('/expenses/:id', authorize(R.EXPENSES_WRITE), expenseUpdateValidation, validate, auditLog('update', 'expense'), updateExpense);
router.delete('/expenses/:id', authorize(R.EXPENSES_WRITE), auditLog('delete', 'expense'), deleteExpense);

router.post('/invoices', authorize(R.INVOICES_WRITE), invoiceValidation, validate, auditLog('create', 'invoice'), createInvoice);
router.get('/invoices', authorize(R.INVOICES_READ), getInvoices);
router.get('/invoices/pending', authorize(R.INVOICES_READ), getPendingPayments);
router.get('/invoices/uninvoiced-sales', authorize(R.INVOICES_READ), getUninvoicedSales);
router.get('/invoices/uninvoiced-purchases', authorize(R.INVOICES_READ), getUninvoicedPurchases);
router.get('/invoices/:id', authorize(R.INVOICES_READ), getInvoice);
router.put('/invoices/:id', authorize(R.INVOICES_WRITE), invoiceUpdateValidation, validate, auditLog('update', 'invoice'), updateInvoice);
router.patch('/invoices/:id/payment', authorize(R.INVOICES_WRITE), auditLog('update', 'invoicePayment'), updateInvoicePayment);
router.delete('/invoices/:id', authorize(R.INVOICES_WRITE), auditLog('delete', 'invoice'), deleteInvoice);

router.get('/ledgers', authorize(R.LEDGERS_READ), getLedgers);
router.get('/ledgers/:id/entries', authorize(R.LEDGERS_READ), getLedgerEntries);
router.get('/balance-sheet', authorize(R.REPORTS_READ), getBalanceSheet);
router.get('/balance-sheet/export', authorize(R.REPORTS_READ), exportBalanceSheet);

export default router;

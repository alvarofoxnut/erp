import { body } from 'express-validator';
import accountingModuleService from './accountingModule.service.js';
import asyncHandler from '../../shared/utils/asyncHandler.js';
import { successResponse, paginatedResponse } from '../../shared/utils/apiResponse.js';
import { buildPagination, buildPaginationMeta, getDateRange } from '../../shared/utils/helpers.js';
import { parseBusinessUnits } from './businessUnit.js';
import reportsService from '../reports/reports.service.js';
import auditService from '../../shared/services/auditService.js';
import { getDeleteMeta } from '../../shared/utils/softDelete.js';

const expenseFields = [
  body('date').isISO8601(),
  body('type').isIn(['direct', 'indirect', 'personal']),
  body('category').trim().notEmpty(),
  body('amount').isFloat({ min: 0.01 }),
];

export const expenseValidation = [
  ...expenseFields,
  body('businessUnit').isIn(['manufacturing', 'trading']),
];

export const expenseUpdateValidation = [
  ...expenseFields,
  body('businessUnit').optional().isIn(['manufacturing', 'trading']),
];

export const invoiceUpdateValidation = [
  body('date').optional().isISO8601(),
  body('partyName').optional().trim().notEmpty(),
  body('amount').optional().isFloat({ min: 0 }),
  body('paidAmount').optional().isFloat({ min: 0 }),
];

export const createExpense = asyncHandler(async (req, res) => {
  const expense = await accountingModuleService.createExpense(req.body, req.user._id);
  successResponse(res, expense, 'Expense recorded', 201);
});

export const updateExpense = asyncHandler(async (req, res) => {
  const expense = await accountingModuleService.updateExpense(req.params.id, req.body);
  successResponse(res, expense, 'Expense updated');
});

export const deleteExpense = asyncHandler(async (req, res) => {
  const { userId, deleteReason } = getDeleteMeta(req);
  await accountingModuleService.deleteExpense(req.params.id, userId, deleteReason);
  successResponse(res, null, 'Expense deleted');
});

export const getExpenses = asyncHandler(async (req, res) => {
  const { page, limit } = buildPagination(req.query.page, req.query.limit);
  const { expenses, total } = await accountingModuleService.getExpenses({
    businessUnit: req.query.businessUnit,
    type: req.query.type,
    search: req.query.search,
    startDate: req.query.startDate,
    endDate: req.query.endDate,
    page,
    limit,
  });
  paginatedResponse(res, expenses, buildPaginationMeta(total, page, limit));
});

export const getExpenseSummary = asyncHandler(async (req, res) => {
  const summary = await accountingModuleService.getExpenseSummary(
    req.query.startDate,
    req.query.endDate
  );
  successResponse(res, summary);
});

export const invoiceValidation = [
  body('date').isISO8601(),
  body('partyName').trim().notEmpty(),
  body('amount').isFloat({ min: 0 }),
];

export const getInvoice = asyncHandler(async (req, res) => {
  const invoice = await accountingModuleService.getInvoiceById(req.params.id);
  successResponse(res, invoice);
});

export const updateInvoice = asyncHandler(async (req, res) => {
  const invoice = await accountingModuleService.updateInvoice(req.params.id, req.body);
  successResponse(res, invoice, 'Invoice updated');
});

export const createInvoice = asyncHandler(async (req, res) => {
  const invoice = await accountingModuleService.createInvoice(req.body, req.user._id);
  successResponse(res, invoice, 'Invoice created', 201);
});

export const getInvoices = asyncHandler(async (req, res) => {
  const { page, limit } = buildPagination(req.query.page, req.query.limit);
  const { invoices, total } = await accountingModuleService.getInvoices({
    search: req.query.search,
    paymentStatus: req.query.paymentStatus,
    invoiceType: req.query.invoiceType,
    startDate: req.query.startDate,
    endDate: req.query.endDate,
    page,
    limit,
  });
  paginatedResponse(res, invoices, buildPaginationMeta(total, page, limit));
});

export const updateInvoicePayment = asyncHandler(async (req, res) => {
  const invoice = await accountingModuleService.updateInvoicePayment(req.params.id, req.body);
  successResponse(res, invoice, 'Payment updated');
});

export const deleteInvoice = asyncHandler(async (req, res) => {
  const { userId, deleteReason } = getDeleteMeta(req);
  await accountingModuleService.deleteInvoice(req.params.id, userId, deleteReason);
  successResponse(res, null, 'Invoice deleted');
});

export const getPendingPayments = asyncHandler(async (req, res) => {
  const invoices = await accountingModuleService.getPendingPayments();
  successResponse(res, invoices);
});

export const getUninvoicedSales = asyncHandler(async (req, res) => {
  const sales = await accountingModuleService.getUninvoicedSales();
  successResponse(res, sales);
});

export const getUninvoicedPurchases = asyncHandler(async (req, res) => {
  const purchases = await accountingModuleService.getUninvoicedPurchases();
  successResponse(res, purchases);
});

export const getLedgers = asyncHandler(async (req, res) => {
  const ledgers = await accountingModuleService.getLedgers({
    type: req.query.type,
    businessUnit: req.query.businessUnit,
  });
  successResponse(res, ledgers);
});

export const getLedgerEntries = asyncHandler(async (req, res) => {
  const { page, limit, skip } = buildPagination(req.query.page, req.query.limit);
  const { entries, total } = await accountingModuleService.getLedgerEntries(req.params.id, {
    startDate: req.query.startDate,
    endDate: req.query.endDate,
    businessUnit: req.query.businessUnit,
    skip,
    limit,
  });
  paginatedResponse(res, entries, buildPaginationMeta(total, page, limit));
});

const resolveReportDates = (query) => {
  if (query.financialYear === 'true') {
    return reportsService.resolveDateRange(query);
  }
  const { start, end } = getDateRange(query.startDate, query.endDate);
  return { start, end };
};

export const getBalanceSheet = asyncHandler(async (req, res) => {
  const units = parseBusinessUnits(req.query);
  const { start, end } = resolveReportDates(req.query);
  const report = await accountingModuleService.getBalanceSheet(units, start, end);
  successResponse(res, report);
});

export const exportBalanceSheet = asyncHandler(async (req, res) => {
  const units = parseBusinessUnits(req.query);
  const { start, end } = resolveReportDates(req.query);
  const buffer = await accountingModuleService.exportBalanceSheet(units, start, end);
  await auditService.logReportExport({
    userId: req.user?.id || req.user?._id,
    reportName: 'Balance Sheet',
    exportType: 'Excel',
    ip: req.ip,
  });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=balance-sheet.xlsx');
  res.send(buffer);
});

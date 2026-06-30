import reportsService from './reports.service.js';
import tradingAccountService from './tradingAccount.service.js';
import asyncHandler from '../../shared/utils/asyncHandler.js';
import { successResponse } from '../../shared/utils/apiResponse.js';
import auditService from '../../shared/services/auditService.js';

const getDateRangeFromQuery = (query) => reportsService.resolveDateRange(query);

export const getStockReport = asyncHandler(async (req, res) => {
  const report = await reportsService.getStockReport();
  successResponse(res, report);
});

export const getLooseStockReport = asyncHandler(async (req, res) => {
  const report = await reportsService.getLooseStockReport();
  successResponse(res, report);
});

export const getBrandedStockReport = asyncHandler(async (req, res) => {
  const report = await reportsService.getBrandedStockReport();
  successResponse(res, report);
});

export const getProductionReport = asyncHandler(async (req, res) => {
  const { start, end } = getDateRangeFromQuery(req.query);
  const report = await reportsService.getProductionReport(start, end);
  successResponse(res, report);
});

export const getSalesReport = asyncHandler(async (req, res) => {
  const { start, end } = getDateRangeFromQuery(req.query);
  const report = await reportsService.getSalesReport(start, end);
  successResponse(res, report);
});

export const getPurchaseReport = asyncHandler(async (req, res) => {
  const { start, end } = getDateRangeFromQuery(req.query);
  const report = await reportsService.getPurchaseReport(start, end);
  successResponse(res, report);
});

export const getVendorReport = asyncHandler(async (req, res) => {
  const { start, end } = getDateRangeFromQuery(req.query);
  const report = await reportsService.getVendorReport(start, end);
  successResponse(res, report);
});

export const getCustomerReport = asyncHandler(async (req, res) => {
  const { start, end } = getDateRangeFromQuery(req.query);
  const report = await reportsService.getCustomerReport(start, end);
  successResponse(res, report);
});

export const getExpenseReport = asyncHandler(async (req, res) => {
  const { start, end } = getDateRangeFromQuery(req.query);
  const report = await reportsService.getExpenseReport(start, end);
  successResponse(res, report);
});

export const getProfitLossReport = asyncHandler(async (req, res) => {
  const { start, end } = getDateRangeFromQuery(req.query);
  const report = await reportsService.getProfitLossReport(start, end);
  successResponse(res, report);
});

export const getTradingAccountReport = asyncHandler(async (req, res) => {
  const { start, end } = getDateRangeFromQuery(req.query);
  const reportType = tradingAccountService.parseReportType(req.query.reportType);
  const report = await tradingAccountService.getTradingAccountReport(
    reportType,
    start,
    end
  );
  successResponse(res, report);
});

export const exportTradingAccountReport = asyncHandler(async (req, res) => {
  const { start, end } = getDateRangeFromQuery(req.query);
  const reportType = tradingAccountService.parseReportType(req.query.reportType);
  const format = String(req.query.format || 'excel').toLowerCase();
  const data = await tradingAccountService.getTradingAccountReport(
    reportType,
    start,
    end
  );

  const exportLabel = `trading-account-${reportType}`;
  await auditService.logReportExport({
    userId: req.user?.id || req.user?._id,
    reportName: `Trading Account (${reportType})`,
    exportType: format === 'pdf' ? 'PDF' : 'Excel',
    ip: req.ip,
  });

  if (format === 'pdf') {
    const buffer = await tradingAccountService.exportToPdf(data);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=${exportLabel}.pdf`
    );
    return res.send(buffer);
  }

  const buffer = await tradingAccountService.exportToExcel(data);
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename=${exportLabel}.xlsx`
  );
  res.send(buffer);
});

export const getManufacturingDamageReport = asyncHandler(async (req, res) => {
  const { start, end } = getDateRangeFromQuery(req.query);
  const report = await reportsService.getManufacturingDamageReport(
    start,
    end,
    req.query.inventoryType
  );
  successResponse(res, report);
});

export const getTradingDamageReport = asyncHandler(async (req, res) => {
  const { start, end } = getDateRangeFromQuery(req.query);
  const report = await reportsService.getTradingDamageReport(start, end, req.query.itemId);
  successResponse(res, report);
});

export const getLotWiseReport = asyncHandler(async (req, res) => {
  const report = await reportsService.getLotWiseReport(req.params.lotNumber);
  successResponse(res, report);
});

export const exportReport = asyncHandler(async (req, res) => {
  const { reportType } = req.params;
  const { start, end } = getDateRangeFromQuery(req.query);

  let data;
  switch (reportType) {
    case 'stock': data = await reportsService.getStockReport(); break;
    case 'loose-stock': data = await reportsService.getLooseStockReport(); break;
    case 'branded-stock': data = await reportsService.getBrandedStockReport(); break;
    case 'production': data = await reportsService.getProductionReport(start, end); break;
    case 'sales': data = await reportsService.getSalesReport(start, end); break;
    case 'purchase': data = await reportsService.getPurchaseReport(start, end); break;
    case 'expense':
    case 'expenses': data = await reportsService.getExpenseReport(start, end); break;
    case 'vendors': data = await reportsService.getVendorReport(start, end); break;
    case 'customers': data = await reportsService.getCustomerReport(start, end); break;
    case 'profit-loss': data = await reportsService.getProfitLossReport(start, end); break;
    case 'trading-account': {
      data = await tradingAccountService.getTradingAccountReport(
        tradingAccountService.parseReportType(req.query.reportType),
        start,
        end
      );
      break;
    }
    case 'manufacturing-damages':
      data = await reportsService.getManufacturingDamageReport(
        start,
        end,
        req.query.inventoryType
      );
      break;
    case 'trading-damages':
      data = await reportsService.getTradingDamageReport(start, end, req.query.itemId);
      break;
    default: data = {};
  }

  const buffer = await reportsService.exportToExcel(reportType, data);
  await auditService.logReportExport({
    userId: req.user?.id || req.user?._id,
    reportName: `${reportType} Report`,
    exportType: 'Excel',
    ip: req.ip,
  });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=${reportType}-report.xlsx`);
  res.send(buffer);
});

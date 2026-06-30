import { prisma } from '../../config/db.js';
import inventoryService from '../inventory/inventory.service.js';
import inventoryRepository from '../inventory/inventory.repository.js';
import damagesService from '../damages/damages.service.js';
import tradingAccountService from './tradingAccount.service.js';
import { getFinancialYear, getDateRange } from '../../shared/utils/helpers.js';
import ExcelJS from 'exceljs';
import { STOCK_CATEGORIES } from '../../shared/constants/index.js';

class ReportsService {
  resolveDateRange(query) {
    if (query.financialYear === 'true') {
      const fy = getFinancialYear();
      return { start: fy.start, end: fy.end };
    }
    return getDateRange(query.startDate, query.endDate);
  }

  calculateTotalRevenue(tradingSales, manufacturingSales, invoices) {
    const invoicedTradingIds = new Set(
      invoices.filter((i) => i.tradingSaleId).map((i) => String(i.tradingSaleId))
    );
    const invoicedMfgIds = new Set(
      invoices.filter((i) => i.manufacturingSaleId).map((i) => String(i.manufacturingSaleId))
    );

    const uninvoicedTrading = tradingSales
      .filter((s) => !invoicedTradingIds.has(String(s.id)))
      .reduce((sum, s) => sum + s.amount, 0);
    const uninvoicedMfg = manufacturingSales
      .filter((s) => !invoicedMfgIds.has(String(s.id)))
      .reduce((sum, s) => sum + s.amount, 0);
    const invoiceTotal = invoices.reduce((sum, i) => sum + i.amount, 0);

    return uninvoicedTrading + uninvoicedMfg + invoiceTotal;
  }

  flattenDoc(doc) {
    const obj = doc?._doc || doc?.toObject?.() || doc || {};
    const flat = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key === '_id' || key === '__v' || key === 'createdAt' || key === 'updatedAt') continue;
      if (value instanceof Date) {
        flat[key] = value.toISOString().split('T')[0];
      } else if (value && typeof value === 'object' && (value._id || value.id)) {
        flat[key] = value.name || value.serialNumber || value.invoiceNumber || String(value._id ?? value.id);
      } else if (typeof value === 'object' && value !== null) {
        flat[key] = JSON.stringify(value);
      } else {
        flat[key] = value;
      }
    }
    return flat;
  }

  addArraySheet(workbook, name, arr) {
    const sheet = workbook.addWorksheet(name.slice(0, 31));
    if (!arr?.length) {
      sheet.addRow(['No data for this period']);
      return sheet;
    }
    const rows = arr.map((item) => this.flattenDoc(item));
    const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    sheet.columns = keys.map((key) => ({ header: key, key, width: 18 }));
    rows.forEach((row) => sheet.addRow(row));
    return sheet;
  }

  addSummarySheet(workbook, name, entries) {
    const sheet = workbook.addWorksheet(name.slice(0, 31));
    sheet.columns = [
      { header: 'Metric', key: 'metric', width: 30 },
      { header: 'Value', key: 'value', width: 20 },
    ];
    entries.forEach(([metric, value]) => sheet.addRow({ metric, value }));
    return sheet;
  }

  async getStockReport() {
    const summary = await inventoryService.getStockSummary();
    const items = await prisma.item.findMany({ where: { isActive: true } });
    const tradingStock = [];
    for (const item of items) {
      const balance = await inventoryRepository.getCurrentBalance(STOCK_CATEGORIES.TRADING, { item: item.id });
      tradingStock.push({ itemName: item.name, sku: item.sku, unit: item.unit, balance });
    }
    return { manufacturing: summary, tradingStock };
  }

  async getLooseStockReport() {
    const summary = await inventoryService.getStockSummary();
    const categories = [
      STOCK_CATEGORIES.QUALITY_6NO,
      STOCK_CATEGORIES.QUALITY_5NO,
      STOCK_CATEGORIES.QUALITY_4_5NO,
      STOCK_CATEGORIES.QUALITY_4NO,
      STOCK_CATEGORIES.QUALITY_OTHERS,
    ];
    const rows = categories.map((category) => ({
      category,
      label: STOCK_CATEGORIES[category] ? category : category,
      balanceKg: typeof summary[category] === 'number' ? summary[category] : 0,
    }));
    return { rows, totalKg: rows.reduce((s, r) => s + r.balanceKg, 0) };
  }

  async getBrandedStockReport() {
    const branded = await inventoryService.getBrandedStockDetail();
    return {
      rows: branded.rows,
      totalPackets: branded.totalPackets,
      totalEquivalentKg: branded.totalEquivalentKg,
    };
  }

  async getProductionReport(startDate, endDate) {
    const dateFilter = { gte: startDate, lte: endDate };
    const [quality, finished, rawPurchases] = await Promise.all([
      prisma.qualityProduction.findMany({
        where: { date: dateFilter },
        orderBy: { date: 'desc' },
      }),
      prisma.finishedProduction.findMany({
        where: { date: dateFilter },
        orderBy: { date: 'desc' },
      }),
      prisma.rawPurchase.findMany({
        where: { date: dateFilter },
        include: { vendor: { select: { name: true } } },
        orderBy: { date: 'desc' },
      }),
    ]);
    return { quality, finished, rawPurchases };
  }

  async getSalesReport(startDate, endDate) {
    const dateFilter = { gte: startDate, lte: endDate };
    const [tradingSales, manufacturingSales, invoices] = await Promise.all([
      prisma.sale.findMany({
        where: { date: dateFilter },
        include: { item: true },
        orderBy: { date: 'desc' },
      }),
      prisma.manufacturingSale.findMany({
        where: { date: dateFilter },
        orderBy: { date: 'desc' },
      }),
      prisma.invoice.findMany({
        where: { date: dateFilter },
        orderBy: { date: 'desc' },
      }),
    ]);

    const totalSales = this.calculateTotalRevenue(tradingSales, manufacturingSales, invoices);

    return { tradingSales, manufacturingSales, invoices, totalSales };
  }

  async getPurchaseReport(startDate, endDate) {
    const dateFilter = { gte: startDate, lte: endDate };
    const [tradingPurchases, rawPurchases] = await Promise.all([
      prisma.purchase.findMany({
        where: { date: dateFilter },
        include: { party: true, item: true },
        orderBy: { date: 'desc' },
      }),
      prisma.rawPurchase.findMany({
        where: { date: dateFilter },
        include: { vendor: { select: { name: true } } },
        orderBy: { date: 'desc' },
      }),
    ]);

    const totalPurchases = [
      ...tradingPurchases.map((p) => p.amount),
      ...rawPurchases.map((p) => p.totalAmount),
    ].reduce((a, b) => a + b, 0);

    return { tradingPurchases, rawPurchases, totalPurchases };
  }

  formatContactDetails(entity = {}) {
    return {
      contactPerson: entity.contactPerson || '',
      phone: entity.phone || '',
      email: entity.email || '',
      address: entity.address || '',
      gstNumber: entity.gstNumber || '',
    };
  }

  buildPaymentFields(amount, invoice) {
    if (invoice) {
      return {
        paid: invoice.paidAmount ?? 0,
        due: invoice.dueAmount ?? 0,
        paymentMethod: invoice.paymentMode,
        paymentStatus: invoice.paymentStatus,
        invoiceNumber: invoice.invoiceNumber,
      };
    }
    return {
      paid: 0,
      due: amount,
      paymentMethod: '-',
      paymentStatus: 'uninvoiced',
      invoiceNumber: null,
    };
  }

  summarizeTransactionRows(rows) {
    return {
      count: rows.length,
      totalAmount: rows.reduce((sum, row) => sum + (row.amount || 0), 0),
      totalPaid: rows.reduce((sum, row) => sum + (row.paid || 0), 0),
      totalDue: rows.reduce((sum, row) => sum + (row.due || 0), 0),
    };
  }

  async getVendorReport(startDate, endDate) {
    const dateFilter = { gte: startDate, lte: endDate };

    const [rawPurchases, tradingPurchases] = await Promise.all([
      prisma.rawPurchase.findMany({
        where: { date: dateFilter },
        include: { vendor: true, invoice: true },
        orderBy: { date: 'desc' },
      }),
      prisma.purchase.findMany({
        where: { date: dateFilter },
        include: { party: true, item: true, invoice: true },
        orderBy: { date: 'desc' },
      }),
    ]);

    const manufacturing = rawPurchases.map((purchase) => ({
      date: purchase.date,
      vendorName: purchase.vendor.name,
      ...this.formatContactDetails(purchase.vendor),
      product: 'Raw Material',
      reference: purchase.lotNumber,
      quantity: purchase.quantity,
      rate: purchase.purchaseRate,
      amount: purchase.totalAmount,
      ...this.buildPaymentFields(purchase.totalAmount, purchase.invoice),
    }));

    const trading = tradingPurchases.map((purchase) => ({
      date: purchase.date,
      vendorName: purchase.party.name,
      ...this.formatContactDetails(purchase.party),
      product: purchase.item.name,
      reference: purchase.serialNumber,
      quantity: purchase.quantity,
      rate: purchase.rate,
      amount: purchase.amount,
      ...this.buildPaymentFields(purchase.amount, purchase.invoice),
    }));

    return {
      manufacturing: {
        rows: manufacturing,
        summary: this.summarizeTransactionRows(manufacturing),
      },
      trading: {
        rows: trading,
        summary: this.summarizeTransactionRows(trading),
      },
    };
  }

  async getCustomerReport(startDate, endDate) {
    const dateFilter = { gte: startDate, lte: endDate };

    const [tradingSales, manufacturingSales, customerInvoices] = await Promise.all([
      prisma.sale.findMany({
        where: { date: dateFilter },
        include: { item: true, invoice: true },
        orderBy: { date: 'desc' },
      }),
      prisma.manufacturingSale.findMany({
        where: { date: dateFilter },
        include: { invoice: true },
        orderBy: { date: 'desc' },
      }),
      prisma.invoice.findMany({
        where: { date: dateFilter, invoiceType: 'customer' },
        include: {
          party: true,
          items: true,
          tradingSale: { include: { item: true } },
          manufacturingSale: true,
        },
        orderBy: { date: 'desc' },
      }),
    ]);

    const invoicedTradingIds = new Set();
    const invoicedMfgIds = new Set();
    const tradingFromInvoices = [];
    const manufacturingFromInvoices = [];

    for (const invoice of customerInvoices) {
      const contact = invoice.contactDetails || {};
      const product = invoice.items?.length
        ? invoice.items.map((item) => item.description).filter(Boolean).join(', ')
        : invoice.tradingSale?.item?.name
          || invoice.manufacturingSale?.productCategory?.replace(/_/g, ' ')
          || invoice.reference
          || '-';

      const row = {
        date: invoice.date,
        customerName: invoice.partyName,
        contactPerson: contact.contactPerson || invoice.party?.contactPerson || '',
        phone: contact.phone || invoice.party?.phone || '',
        email: contact.email || invoice.party?.email || '',
        address: contact.address || invoice.party?.address || '',
        gstNumber: contact.gstNumber || invoice.party?.gstNumber || '',
        product,
        reference: invoice.invoiceNumber,
        quantity: invoice.totalQuantity,
        rate: invoice.totalQuantity ? invoice.amount / invoice.totalQuantity : 0,
        amount: invoice.amount,
        ...this.buildPaymentFields(invoice.amount, invoice),
      };

      if (invoice.manufacturingSaleId) {
        invoicedMfgIds.add(String(invoice.manufacturingSaleId));
        manufacturingFromInvoices.push(row);
      } else {
        if (invoice.tradingSaleId) invoicedTradingIds.add(String(invoice.tradingSaleId));
        tradingFromInvoices.push(row);
      }
    }

    const uninvoicedTrading = tradingSales
      .filter((sale) => !sale.invoice && !invoicedTradingIds.has(String(sale.id)))
      .map((sale) => ({
        date: sale.date,
        customerName: sale.customerName,
        contactPerson: '',
        phone: sale.customerPhone || '',
        email: sale.customerEmail || '',
        address: sale.customerAddress || '',
        gstNumber: sale.customerGstNumber || '',
        product: sale.item.name,
        reference: sale.serialNumber,
        quantity: sale.quantity,
        rate: sale.rate,
        amount: sale.amount,
        ...this.buildPaymentFields(sale.amount, null),
      }));

    const uninvoicedManufacturing = manufacturingSales
      .filter((sale) => !sale.invoice && !invoicedMfgIds.has(String(sale.id)))
      .map((sale) => ({
        date: sale.date,
        customerName: sale.customerName,
        contactPerson: '',
        phone: sale.customerPhone || '',
        email: sale.customerEmail || '',
        address: sale.customerAddress || '',
        gstNumber: sale.customerGstNumber || '',
        product: sale.productCategory.replace(/_/g, ' '),
        reference: sale.serialNumber,
        quantity: sale.quantity,
        rate: sale.rate,
        amount: sale.amount,
        ...this.buildPaymentFields(sale.amount, null),
      }));

    const trading = [...uninvoicedTrading, ...tradingFromInvoices];
    const manufacturing = [...uninvoicedManufacturing, ...manufacturingFromInvoices];

    return {
      trading: {
        rows: trading,
        summary: this.summarizeTransactionRows(trading),
      },
      manufacturing: {
        rows: manufacturing,
        summary: this.summarizeTransactionRows(manufacturing),
      },
    };
  }

  summarizeExpenseRows(rows) {
    const byType = rows.reduce((acc, row) => {
      acc[row.type] = (acc[row.type] || 0) + row.amount;
      return acc;
    }, {});

    return {
      count: rows.length,
      total: rows.reduce((sum, row) => sum + row.amount, 0),
      byType,
    };
  }

  async getExpenseReport(startDate, endDate) {
    const expenses = await prisma.expense.findMany({
      where: { date: { gte: startDate, lte: endDate } },
      orderBy: { date: 'desc' },
    });

    const formatRow = (expense) => ({
      date: expense.date,
      type: expense.type,
      category: expense.category,
      amount: expense.amount,
      paymentMode: expense.paymentMode,
      description: expense.description || '',
    });

    const manufacturingRows = expenses
      .filter((expense) => expense.businessUnit === 'manufacturing')
      .map(formatRow);
    const tradingRows = expenses
      .filter((expense) => expense.businessUnit === 'trading')
      .map(formatRow);

    return {
      manufacturing: {
        rows: manufacturingRows,
        summary: this.summarizeExpenseRows(manufacturingRows),
      },
      trading: {
        rows: tradingRows,
        summary: this.summarizeExpenseRows(tradingRows),
      },
      grandTotal: expenses.reduce((sum, expense) => sum + expense.amount, 0),
    };
  }

  async getProfitLossReport(startDate, endDate) {
    const salesReport = await this.getSalesReport(startDate, endDate);
    const purchaseReport = await this.getPurchaseReport(startDate, endDate);
    const expenses = await prisma.expense.findMany({
      where: { date: { gte: startDate, lte: endDate } },
    });

    const totalRevenue = salesReport.totalSales;
    const totalPurchases = purchaseReport.totalPurchases;
    const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
    const totalDamageLoss = await damagesService.getTotalDamageLoss(startDate, endDate);
    const grossProfit = totalRevenue - totalPurchases;
    const netProfit = grossProfit - totalExpenses - totalDamageLoss;

    const breakdown = await prisma.expense.groupBy({
      by: ['type'],
      where: { date: { gte: startDate, lte: endDate } },
      _sum: { amount: true },
    });

    return {
      totalRevenue,
      totalPurchases,
      totalExpenses,
      totalDamageLoss,
      grossProfit,
      netProfit,
      expenseBreakdown: breakdown.map((row) => ({
        _id: row.type,
        total: row._sum.amount ?? 0,
      })),
    };
  }

  async getManufacturingDamageReport(startDate, endDate, inventoryType) {
    return damagesService.getManufacturingDamageReport(startDate, endDate, inventoryType);
  }

  async getTradingDamageReport(startDate, endDate, itemId) {
    return damagesService.getTradingDamageReport(startDate, endDate, itemId);
  }

  async getLotWiseReport(lotNumber) {
    const stock = await inventoryService.getLotWiseStock(lotNumber);
    const [rawPurchases, machineEntries] = await Promise.all([
      prisma.rawPurchase.findMany({
        where: { lotNumber },
        include: { vendor: { select: { name: true } } },
      }),
      prisma.machineEntry.findMany({ where: { lotNumber } }),
    ]);

    return { lotNumber, stock, rawPurchases, machineEntries, qualityProductions: [] };
  }

  async exportToExcel(reportType, data) {
    const workbook = new ExcelJS.Workbook();

    switch (reportType) {
      case 'stock': {
        const { manufacturing, tradingStock } = data;
        this.addSummarySheet(workbook, 'Manufacturing Stock', Object.entries(manufacturing || {}).map(([k, v]) => [k, v]));
        this.addArraySheet(workbook, 'Trading Stock', tradingStock || []);
        break;
      }
      case 'loose-stock': {
        this.addArraySheet(workbook, 'Loose Quality Stock', data.rows || []);
        this.addSummarySheet(workbook, 'Summary', [['Total KG', data.totalKg ?? 0]]);
        break;
      }
      case 'branded-stock': {
        this.addArraySheet(workbook, 'Branded Stock', data.rows || []);
        this.addSummarySheet(workbook, 'Summary', [['Total Packets', data.totalPackets ?? 0]]);
        break;
      }
      case 'production': {
        this.addArraySheet(workbook, 'Quality Production', data.quality || []);
        this.addArraySheet(workbook, 'Finished Production', data.finished || []);
        this.addArraySheet(workbook, 'Raw Purchases', data.rawPurchases || []);
        break;
      }
      case 'sales': {
        this.addArraySheet(workbook, 'Trading Sales', data.tradingSales || []);
        this.addArraySheet(workbook, 'Manufacturing Sales', data.manufacturingSales || []);
        this.addArraySheet(workbook, 'Invoices', data.invoices || []);
        this.addSummarySheet(workbook, 'Summary', [['Total Revenue', data.totalSales ?? 0]]);
        break;
      }
      case 'purchase': {
        this.addArraySheet(workbook, 'Trading Purchases', data.tradingPurchases || []);
        this.addArraySheet(workbook, 'Raw Purchases', data.rawPurchases || []);
        this.addSummarySheet(workbook, 'Summary', [['Total Purchases', data.totalPurchases ?? 0]]);
        break;
      }
      case 'expenses':
      case 'expense': {
        this.addArraySheet(workbook, 'Manufacturing Expenses', data.manufacturing?.rows || []);
        this.addArraySheet(workbook, 'Trading Expenses', data.trading?.rows || []);
        this.addSummarySheet(workbook, 'Summary', [
          ['Manufacturing Total', data.manufacturing?.summary?.total ?? 0],
          ['Trading Total', data.trading?.summary?.total ?? 0],
          ['Grand Total', data.grandTotal ?? 0],
        ]);
        break;
      }
      case 'vendors': {
        this.addArraySheet(workbook, 'Manufacturing Vendors', data.manufacturing?.rows || []);
        this.addArraySheet(workbook, 'Trading Vendors', data.trading?.rows || []);
        this.addSummarySheet(workbook, 'Summary', [
          ['Manufacturing Amount', data.manufacturing?.summary?.totalAmount ?? 0],
          ['Manufacturing Paid', data.manufacturing?.summary?.totalPaid ?? 0],
          ['Manufacturing Due', data.manufacturing?.summary?.totalDue ?? 0],
          ['Trading Amount', data.trading?.summary?.totalAmount ?? 0],
          ['Trading Paid', data.trading?.summary?.totalPaid ?? 0],
          ['Trading Due', data.trading?.summary?.totalDue ?? 0],
        ]);
        break;
      }
      case 'customers': {
        this.addArraySheet(workbook, 'Manufacturing Customers', data.manufacturing?.rows || []);
        this.addArraySheet(workbook, 'Trading Customers', data.trading?.rows || []);
        this.addSummarySheet(workbook, 'Summary', [
          ['Manufacturing Amount', data.manufacturing?.summary?.totalAmount ?? 0],
          ['Manufacturing Paid', data.manufacturing?.summary?.totalPaid ?? 0],
          ['Manufacturing Due', data.manufacturing?.summary?.totalDue ?? 0],
          ['Trading Amount', data.trading?.summary?.totalAmount ?? 0],
          ['Trading Paid', data.trading?.summary?.totalPaid ?? 0],
          ['Trading Due', data.trading?.summary?.totalDue ?? 0],
        ]);
        break;
      }
      case 'manufacturing-damages': {
        this.addArraySheet(workbook, 'Manufacturing Damages', data.rows || []);
        this.addSummarySheet(workbook, 'Summary', [
          ['Total Rows', data.summary?.count ?? 0],
          ['Total Quantity', data.summary?.totalQuantity ?? 0],
          ['Total Loss', data.summary?.totalLoss ?? 0],
        ]);
        break;
      }
      case 'trading-damages': {
        this.addArraySheet(workbook, 'Trading Damages', data.rows || []);
        this.addSummarySheet(workbook, 'Summary', [
          ['Total Rows', data.summary?.count ?? 0],
          ['Total Quantity', data.summary?.totalQuantity ?? 0],
          ['Total Loss', data.summary?.totalLoss ?? 0],
        ]);
        break;
      }
      case 'trading-account': {
        return tradingAccountService.addExcelTradingAccount(workbook, data);
      }
      case 'profit-loss': {
        this.addSummarySheet(workbook, 'Profit & Loss', [
          ['Total Revenue', data.totalRevenue ?? 0],
          ['Total Purchases', data.totalPurchases ?? 0],
          ['Total Expenses', data.totalExpenses ?? 0],
          ['Total Damage Loss', data.totalDamageLoss ?? 0],
          ['Gross Profit', data.grossProfit ?? 0],
          ['Net Profit', data.netProfit ?? 0],
        ]);
        if (data.expenseBreakdown?.length) {
          this.addArraySheet(workbook, 'Expense Breakdown', data.expenseBreakdown.map((e) => ({
            type: e._id,
            total: e.total,
          })));
        }
        break;
      }
      default: {
        const sheet = workbook.addWorksheet('Report');
        sheet.addRow(['No data available for this report type']);
      }
    }

    return workbook.xlsx.writeBuffer();
  }
}

export default new ReportsService();

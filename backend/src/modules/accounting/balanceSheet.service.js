import { prisma } from '../../config/db.js';
import { LEDGER_TYPES, BUSINESS_UNITS } from '../../shared/constants/index.js';
import {
  unitEntryPrismaWhere,
  unitExpensePrismaWhere,
} from './businessUnit.js';

function endOfDay(date) {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
}

class BalanceSheetService {
  async aggregateLedgerBalances(units, asOfDate) {
    const unitWhere = unitEntryPrismaWhere(units);
    const asOf = endOfDay(asOfDate);

    const rows = await prisma.ledgerEntry.findMany({
      where: {
        date: { lte: asOf },
        ...unitWhere,
      },
      include: {
        ledger: { select: { type: true } },
      },
    });

    const byType = {};
    for (const row of rows) {
      const type = row.ledger.type;
      byType[type] = (byType[type] || 0) + (row.credit - row.debit);
    }
    return byType;
  }

  async sumPeriodActivity(units, startDate, endDate, ledgerTypes) {
    const unitWhere = unitEntryPrismaWhere(units);

    const rows = await prisma.ledgerEntry.findMany({
      where: {
        date: { gte: new Date(startDate), lte: endOfDay(endDate) },
        ledger: { type: { in: ledgerTypes } },
        ...unitWhere,
      },
      select: { debit: true, credit: true },
    });

    return rows.reduce(
      (acc, row) => ({
        totalDebit: acc.totalDebit + row.debit,
        totalCredit: acc.totalCredit + row.credit,
      }),
      { totalDebit: 0, totalCredit: 0 }
    );
  }

  async getReceivables(units, asOfDate) {
    const where = {
      invoiceType: 'customer',
      date: { lte: endOfDay(asOfDate) },
      dueAmount: { gt: 0 },
    };

    if (units?.length === 1) {
      const unit = units[0];
      if (unit === BUSINESS_UNITS.MANUFACTURING) {
        where.manufacturingSaleId = { not: null };
      } else {
        where.OR = [
          { tradingSaleId: { not: null } },
          { AND: [{ tradingSaleId: null }, { manufacturingSaleId: null }] },
        ];
      }
    }

    const invoices = await prisma.invoice.findMany({ where });
    return invoices.reduce((sum, inv) => sum + (inv.dueAmount || 0), 0);
  }

  async getExpenseTotal(units, startDate, endDate) {
    const where = {
      date: { gte: new Date(startDate), lte: endOfDay(endDate) },
      ...unitExpensePrismaWhere(units),
    };

    const result = await prisma.expense.aggregate({
      where,
      _sum: { amount: true },
    });
    return result._sum.amount || 0;
  }

  combineBalanceSheets(sections) {
    const sum = (key) => sections.reduce((s, sec) => s + (sec[key] || 0), 0);
    const assetLabels = ['Cash', 'Bank', 'Accounts Receivable (Invoice dues)'];

    const assets = assetLabels.map((label) => ({
      label,
      amount: sections.reduce((s, sec) => {
        const row = sec.assets.find((a) => a.label === label);
        return s + (row?.amount || 0);
      }, 0),
    }));

    const totalRevenue = sum('totalRevenue');
    const totalPurchases = sum('totalPurchases');
    const totalExpenses = sum('totalExpenses');
    const totalDamageLoss = sum('totalDamageLoss');
    const netProfit = sum('netProfit');

    return {
      unitLabel: 'Combined Total',
      assets,
      equity: [
        { label: 'Revenue (Sales)', amount: totalRevenue },
        { label: 'Purchases', amount: -totalPurchases },
        { label: 'Expenses', amount: -totalExpenses },
        { label: 'Damage / Write-Off Loss', amount: -totalDamageLoss },
        { label: 'Net Profit / (Loss)', amount: netProfit },
      ],
      totalAssets: sum('totalAssets'),
      totalRevenue,
      totalPurchases,
      totalExpenses,
      totalDamageLoss,
      netProfit,
    };
  }

  async buildBalanceSheet(units, startDate, endDate) {
    const asOf = endDate || new Date();
    const periodStart = startDate || new Date(0);
    const balances = await this.aggregateLedgerBalances(units, asOf);

    const cashBalance = balances[LEDGER_TYPES.CASH] || 0;
    const bankBalance = balances[LEDGER_TYPES.BANK] || 0;
    const receivables = await this.getReceivables(units, asOf);

    const salesActivity = await this.sumPeriodActivity(units, periodStart, asOf, [LEDGER_TYPES.SALES]);
    const purchaseActivity = await this.sumPeriodActivity(units, periodStart, asOf, [LEDGER_TYPES.PURCHASES]);

    const totalRevenue = salesActivity.totalCredit || 0;
    const totalPurchases = purchaseActivity.totalCredit || 0;
    const totalExpenses = await this.getExpenseTotal(units, periodStart, asOf);
    const totalDamageLoss = await this.getDamageLossForUnits(units, periodStart, asOf);
    const netProfit = totalRevenue - totalPurchases - totalExpenses - totalDamageLoss;

    const assets = [
      { label: 'Cash', amount: cashBalance },
      { label: 'Bank', amount: bankBalance },
      { label: 'Accounts Receivable (Invoice dues)', amount: receivables },
    ];
    const totalAssets = assets.reduce((s, a) => s + a.amount, 0);

    const equity = [
      { label: 'Revenue (Sales)', amount: totalRevenue },
      { label: 'Purchases', amount: -totalPurchases },
      { label: 'Expenses', amount: -totalExpenses },
      { label: 'Damage / Write-Off Loss', amount: -totalDamageLoss },
      { label: 'Net Profit / (Loss)', amount: netProfit },
    ];

    const unitLabel =
      units[0] === BUSINESS_UNITS.MANUFACTURING ? 'Manufacturing' : 'Trading';

    return {
      units,
      unitLabel,
      startDate: periodStart,
      endDate: asOf,
      assets,
      liabilities: [],
      equity,
      totalAssets,
      totalLiabilities: 0,
      totalEquity: netProfit,
      totalRevenue,
      totalPurchases,
      totalExpenses,
      totalDamageLoss,
      netProfit,
    };
  }

  async getDamageLossForUnits(units, startDate, endDate) {
    const dateFilter = { gte: new Date(startDate), lte: endOfDay(endDate) };
    let total = 0;

    if (!units?.length || units.includes(BUSINESS_UNITS.MANUFACTURING)) {
      const mfg = await prisma.manufacturingDamage.aggregate({
        where: { date: dateFilter },
        _sum: { totalLoss: true },
      });
      total += mfg._sum.totalLoss || 0;
    }

    if (!units?.length || units.includes(BUSINESS_UNITS.TRADING)) {
      const trading = await prisma.tradingDamage.aggregate({
        where: { date: dateFilter },
        _sum: { totalLoss: true },
      });
      total += trading._sum.totalLoss || 0;
    }

    return total;
  }

  async getBalanceSheet(units, startDate, endDate) {
    const asOf = endDate || new Date();
    const periodStart = startDate || new Date(0);

    if (units.length >= 2) {
      const sections = await Promise.all(
        units.map((unit) => this.buildBalanceSheet([unit], periodStart, asOf))
      );
      return {
        multiUnit: true,
        units,
        unitLabel: 'Manufacturing & Trading',
        startDate: periodStart,
        endDate: asOf,
        sections,
        combined: this.combineBalanceSheets(sections),
      };
    }

    return {
      multiUnit: false,
      ...(await this.buildBalanceSheet(units, periodStart, asOf)),
    };
  }

  addSheetRows(sheet, section) {
    sheet.addRow({ section: 'ASSETS', account: '', amount: '' });
    for (const row of section.assets) {
      sheet.addRow({ section: 'Assets', account: row.label, amount: row.amount });
    }
    sheet.addRow({ section: 'Assets', account: 'Total Assets', amount: section.totalAssets });
    sheet.addRow({ section: '', account: '', amount: '' });
    sheet.addRow({ section: 'EQUITY / P&L', account: '', amount: '' });
    for (const row of section.equity) {
      sheet.addRow({ section: 'Equity', account: row.label, amount: row.amount });
    }
    sheet.addRow({ section: '', account: '', amount: '' });
    sheet.addRow({
      section: 'Summary',
      account: 'Revenue',
      amount: section.totalRevenue,
    });
    sheet.addRow({
      section: 'Summary',
      account: 'Purchases',
      amount: section.totalPurchases,
    });
    sheet.addRow({
      section: 'Summary',
      account: 'Expenses',
      amount: section.totalExpenses,
    });
    sheet.addRow({
      section: 'Summary',
      account: 'Damage Loss',
      amount: section.totalDamageLoss,
    });
    sheet.addRow({
      section: 'Summary',
      account: 'Net Profit',
      amount: section.netProfit,
    });
  }

  async exportToExcel(data) {
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    const columns = [
      { header: 'Section', key: 'section', width: 28 },
      { header: 'Account', key: 'account', width: 36 },
      { header: 'Amount (₹)', key: 'amount', width: 18 },
    ];

    const periodRow = {
      section: 'Period',
      account: `${new Date(data.startDate).toLocaleDateString()} – ${new Date(data.endDate).toLocaleDateString()}`,
      amount: '',
    };

    const writeHeader = (sheet, title) => {
      sheet.columns = columns;
      sheet.addRow({ section: 'Report', account: title, amount: '' });
      sheet.addRow(periodRow);
      sheet.addRow({ section: '', account: '', amount: '' });
    };

    if (data.multiUnit) {
      for (const section of data.sections) {
        const sheet = workbook.addWorksheet(section.unitLabel.slice(0, 31));
        writeHeader(sheet, section.unitLabel);
        this.addSheetRows(sheet, section);
      }
      const combinedSheet = workbook.addWorksheet('Combined Total');
      writeHeader(combinedSheet, data.combined.unitLabel);
      this.addSheetRows(combinedSheet, data.combined);
    } else {
      const sheet = workbook.addWorksheet('Balance Sheet');
      writeHeader(sheet, data.unitLabel);
      this.addSheetRows(sheet, data);
    }

    return workbook.xlsx.writeBuffer();
  }
}

export default new BalanceSheetService();

import { prisma } from '../../config/db.js';
import inventoryValuationService from '../inventory/inventoryValuation.service.js';
import { getReportStockDates } from '../../shared/utils/stockDates.js';
import { groupExpensesByCategory, mergeExpenseCategoryItems } from '../../shared/utils/expenseCategory.js';
import { STOCK_CATEGORIES, EXPENSE_TYPES, BUSINESS_UNITS } from '../../shared/constants/index.js';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

const MFG_STOCK_CATEGORIES = [
  STOCK_CATEGORIES.RAW_MATERIAL,
  STOCK_CATEGORIES.WIP,
  STOCK_CATEGORIES.QUALITY_6NO,
  STOCK_CATEGORIES.QUALITY_5NO,
  STOCK_CATEGORIES.QUALITY_4_5NO,
  STOCK_CATEGORIES.QUALITY_4NO,
  STOCK_CATEGORIES.QUALITY_OTHERS,
  STOCK_CATEGORIES.FINISHED_GOODS,
];

const QUALITY_STOCK_CATEGORIES = [
  STOCK_CATEGORIES.QUALITY_6NO,
  STOCK_CATEGORIES.QUALITY_5NO,
  STOCK_CATEGORIES.QUALITY_4_5NO,
  STOCK_CATEGORIES.QUALITY_4NO,
  STOCK_CATEGORIES.QUALITY_OTHERS,
];

const MFG_STOCK_LABELS = {
  [STOCK_CATEGORIES.RAW_MATERIAL]: 'Raw Material Stock',
  [STOCK_CATEGORIES.WIP]: 'In Machine Stock',
  [STOCK_CATEGORIES.QUALITY_6NO]: '6 No Stock',
  [STOCK_CATEGORIES.QUALITY_5NO]: '5 No Stock',
  [STOCK_CATEGORIES.QUALITY_4_5NO]: '4.5 No Stock',
  [STOCK_CATEGORIES.QUALITY_4NO]: '4 No Stock',
  [STOCK_CATEGORIES.QUALITY_OTHERS]: 'Others Stock',
  [STOCK_CATEGORIES.FINISHED_GOODS]: 'Finished Goods Stock',
  [STOCK_CATEGORIES.BRANDED_GOODS]: 'Branded Goods Stock',
  trading: 'Trading Stock',
};

const MFG_DAMAGE_LABELS = {
  [STOCK_CATEGORIES.RAW_MATERIAL]: 'Raw Material Damage',
  [STOCK_CATEGORIES.QUALITY_6NO]: '6 No Damage',
  [STOCK_CATEGORIES.QUALITY_5NO]: '5 No Damage',
  [STOCK_CATEGORIES.QUALITY_4_5NO]: '4.5 No Damage',
  [STOCK_CATEGORIES.QUALITY_4NO]: '4 No Damage',
  [STOCK_CATEGORIES.QUALITY_OTHERS]: 'Others Damage',
  [STOCK_CATEGORIES.FINISHED_GOODS]: 'Finished Goods Damage',
  quality: 'Quality Damage',
  trading: 'Trading Damage',
};

const REPORT_TYPES = ['manufacturing', 'trading', 'combined'];

const round2 = (n) => Math.round((n || 0) * 100) / 100;

function sumAmount(rows, field = 'amount') {
  return round2(rows.reduce((s, row) => s + (row[field] || 0), 0));
}

function combineMoney(a, b) {
  return round2((a || 0) + (b || 0));
}

function profitLabel(amount, profitWord, lossWord) {
  if (amount < 0) return { label: lossWord, amount: round2(Math.abs(amount)), isLoss: true };
  return { label: profitWord, amount: round2(amount), isLoss: false };
}

function sumQtyValueLines(lines) {
  return {
    quantity: round2(lines.reduce((sum, line) => sum + (line.quantity || 0), 0)),
    value: round2(lines.reduce((sum, line) => sum + (line.value || 0), 0)),
  };
}

class TradingAccountService {
  parseReportType(reportType) {
    const type = String(reportType || 'combined').toLowerCase();
    if (!REPORT_TYPES.includes(type)) return 'combined';
    return type;
  }

  labelManufacturingLines(lines) {
    return lines.map((line) => ({
      key: line.category,
      label: MFG_STOCK_LABELS[line.category] || line.category,
      quantity: line.quantity,
      value: line.value,
    }));
  }

  async getManufacturingStockBlock(asOfDate) {
    const position = await inventoryValuationService.getManufacturingStockPosition(
      asOfDate,
      MFG_STOCK_CATEGORIES
    );
    const branded = await inventoryValuationService.valuateBrandedGoods(asOfDate);
    const lines = [
      ...this.labelManufacturingLines(position.lines),
      ...branded.lines.map((line) => ({
        key: line.key || line.brandId,
        label: line.label,
        quantity: line.quantity,
        value: line.value,
        packets: line.packets,
      })),
    ];
    return {
      lines,
      quantity: round2(position.quantity + branded.quantity),
      value: round2(position.value + branded.value),
      asOfDate: position.asOfDate,
    };
  }

  async getTradingStockBlock(asOfDate) {
    const position = await inventoryValuationService.getTradingStockPosition(asOfDate);
    const itemLines = position.lines.map((line) => ({
      key: line.key || line.itemId,
      label: line.label,
      quantity: line.quantity,
      value: line.value,
    }));

    const lines = itemLines.length
      ? itemLines
      : [{ key: 'trading', label: MFG_STOCK_LABELS.trading, quantity: 0, value: 0 }];

    return {
      lines,
      quantity: position.quantity,
      value: position.value,
      asOfDate: position.asOfDate,
    };
  }

  buildGroupedStock(manufacturingBlock, tradingBlock) {
    const manufacturing = {
      key: 'manufacturing',
      label: 'Manufacturing',
      lines: manufacturingBlock.lines,
      quantity: manufacturingBlock.quantity,
      value: manufacturingBlock.value,
    };
    const trading = {
      key: 'trading',
      label: 'Trading',
      lines: tradingBlock.lines,
      quantity: tradingBlock.quantity,
      value: tradingBlock.value,
    };

    return {
      groups: [manufacturing, trading],
      lines: [...manufacturing.lines, ...trading.lines],
      quantity: round2(manufacturing.quantity + trading.quantity),
      value: round2(manufacturing.value + trading.value),
      asOfDate: manufacturingBlock.asOfDate,
    };
  }

  async getPeriodPurchases(unit, startDate, endDate) {
    const dateFilter = { gte: startDate, lte: endDate };
    if (unit === BUSINESS_UNITS.MANUFACTURING) {
      const rows = await prisma.rawPurchase.findMany({
        where: { date: dateFilter },
        select: { quantity: true, totalAmount: true },
      });
      return {
        quantity: round2(rows.reduce((s, r) => s + r.quantity, 0)),
        value: sumAmount(rows, 'totalAmount'),
      };
    }

    const rows = await prisma.purchase.findMany({
      where: { date: dateFilter },
      select: { quantity: true, amount: true },
    });
    return {
      quantity: round2(rows.reduce((s, r) => s + r.quantity, 0)),
      value: sumAmount(rows, 'amount'),
    };
  }

  buildPurchaseLines(mode, rawMaterial, tradingPurchases) {
    if (mode === 'manufacturing') {
      const line = {
        key: STOCK_CATEGORIES.RAW_MATERIAL,
        label: 'Raw Material Purchases',
        quantity: rawMaterial.quantity,
        value: rawMaterial.value,
      };
      return { lines: [line], ...sumQtyValueLines([line]) };
    }

    if (mode === 'trading') {
      const line = {
        key: 'trading',
        label: 'Trading Purchases',
        quantity: tradingPurchases.quantity,
        value: tradingPurchases.value,
      };
      return { lines: [line], ...sumQtyValueLines([line]) };
    }

    const lines = [
      {
        key: STOCK_CATEGORIES.RAW_MATERIAL,
        label: 'Raw Material Purchases',
        quantity: rawMaterial.quantity,
        value: rawMaterial.value,
      },
      {
        key: 'trading',
        label: 'Trading Purchases',
        quantity: tradingPurchases.quantity,
        value: tradingPurchases.value,
      },
    ];
    return { lines, ...sumQtyValueLines(lines) };
  }

  async fetchManufacturingDamageLines(startDate, endDate) {
    return prisma.manufacturingDamageLine.findMany({
      where: { damage: { date: { gte: startDate, lte: endDate } } },
      select: { inventoryType: true, quantity: true, lossAmount: true },
    });
  }

  async fetchTradingDamageLines(startDate, endDate) {
    return prisma.tradingDamageLine.findMany({
      where: { damage: { date: { gte: startDate, lte: endDate } } },
      select: { quantity: true, lossAmount: true },
    });
  }

  buildManufacturingDamageLines(mfgLines) {
    const order = [
      STOCK_CATEGORIES.RAW_MATERIAL,
      ...QUALITY_STOCK_CATEGORIES,
      STOCK_CATEGORIES.FINISHED_GOODS,
    ];
    const byCategory = new Map(
      order.map((key) => [key, { key, label: MFG_DAMAGE_LABELS[key], quantity: 0, value: 0 }])
    );

    for (const line of mfgLines) {
      const bucket = byCategory.get(line.inventoryType);
      if (!bucket) continue;
      bucket.quantity = round2(bucket.quantity + (line.quantity || 0));
      bucket.value = round2(bucket.value + (line.lossAmount || 0));
    }

    const lines = order.map((key) => byCategory.get(key));
    return { lines, ...sumQtyValueLines(lines) };
  }

  buildCombinedDamageLines(mfgLines, tradingLines) {
    const raw = { key: STOCK_CATEGORIES.RAW_MATERIAL, label: MFG_DAMAGE_LABELS[STOCK_CATEGORIES.RAW_MATERIAL], quantity: 0, value: 0 };
    const quality = { key: 'quality', label: MFG_DAMAGE_LABELS.quality, quantity: 0, value: 0 };
    const finished = { key: STOCK_CATEGORIES.FINISHED_GOODS, label: MFG_DAMAGE_LABELS[STOCK_CATEGORIES.FINISHED_GOODS], quantity: 0, value: 0 };
    const trading = { key: 'trading', label: MFG_DAMAGE_LABELS.trading, quantity: 0, value: 0 };

    for (const line of mfgLines) {
      if (line.inventoryType === STOCK_CATEGORIES.RAW_MATERIAL) {
        raw.quantity = round2(raw.quantity + (line.quantity || 0));
        raw.value = round2(raw.value + (line.lossAmount || 0));
      } else if (line.inventoryType === STOCK_CATEGORIES.FINISHED_GOODS) {
        finished.quantity = round2(finished.quantity + (line.quantity || 0));
        finished.value = round2(finished.value + (line.lossAmount || 0));
      } else if (QUALITY_STOCK_CATEGORIES.includes(line.inventoryType)) {
        quality.quantity = round2(quality.quantity + (line.quantity || 0));
        quality.value = round2(quality.value + (line.lossAmount || 0));
      }
    }

    for (const line of tradingLines) {
      trading.quantity = round2(trading.quantity + (line.quantity || 0));
      trading.value = round2(trading.value + (line.lossAmount || 0));
    }

    const lines = [raw, quality, finished, trading];
    return { lines, ...sumQtyValueLines(lines) };
  }

  buildTradingDamageLines(tradingLines) {
    const line = {
      key: 'trading',
      label: MFG_DAMAGE_LABELS.trading,
      quantity: round2(tradingLines.reduce((sum, row) => sum + (row.quantity || 0), 0)),
      value: round2(tradingLines.reduce((sum, row) => sum + (row.lossAmount || 0), 0)),
    };
    return { lines: [line], quantity: line.quantity, value: line.value };
  }

  async getFinishedGoodsSales(startDate, endDate) {
    const dateFilter = { gte: startDate, lte: endDate };
    const [sales, invoices] = await Promise.all([
      prisma.manufacturingSale.findMany({
        where: {
          date: dateFilter,
          productCategory: STOCK_CATEGORIES.FINISHED_GOODS,
        },
        select: { id: true, quantity: true, amount: true },
      }),
      prisma.invoice.findMany({
        where: {
          date: dateFilter,
          manufacturingSale: {
            productCategory: STOCK_CATEGORIES.FINISHED_GOODS,
          },
        },
        select: { manufacturingSaleId: true, amount: true },
      }),
    ]);

    const invoicedIds = new Set(invoices.map((invoice) => String(invoice.manufacturingSaleId)));
    const uninvoiced = sales.filter((sale) => !invoicedIds.has(String(sale.id)));
    const uninvoicedQty = uninvoiced.reduce((sum, sale) => sum + sale.quantity, 0);
    const uninvoicedAmt = sumAmount(uninvoiced, 'amount');
    const invoiceAmt = sumAmount(invoices, 'amount');
    const invoiceQty = sales
      .filter((sale) => invoicedIds.has(String(sale.id)))
      .reduce((sum, sale) => sum + sale.quantity, 0);

    return {
      label: 'Finished Goods Sales',
      quantity: round2(invoiceQty + uninvoicedQty),
      value: combineMoney(uninvoicedAmt, invoiceAmt),
    };
  }

  async getTradingSales(startDate, endDate) {
    const dateFilter = { gte: startDate, lte: endDate };
    const [sales, invoices] = await Promise.all([
      prisma.sale.findMany({
        where: { date: dateFilter },
        select: { id: true, quantity: true, amount: true },
      }),
      prisma.invoice.findMany({
        where: {
          date: dateFilter,
          tradingSaleId: { not: null },
        },
        select: { tradingSaleId: true, amount: true },
      }),
    ]);

    const invoicedIds = new Set(invoices.map((invoice) => String(invoice.tradingSaleId)));
    const uninvoiced = sales.filter((sale) => !invoicedIds.has(String(sale.id)));
    const uninvoicedQty = uninvoiced.reduce((sum, sale) => sum + sale.quantity, 0);
    const uninvoicedAmt = sumAmount(uninvoiced, 'amount');
    const invoiceAmt = sumAmount(invoices, 'amount');
    const invoiceQty = sales
      .filter((sale) => invoicedIds.has(String(sale.id)))
      .reduce((sum, sale) => sum + sale.quantity, 0);

    return {
      label: 'Trading Sales',
      quantity: round2(invoiceQty + uninvoicedQty),
      value: combineMoney(uninvoicedAmt, invoiceAmt),
    };
  }

  buildSalesBlock(mode, finishedGoodsSales, tradingSales) {
    if (mode === 'manufacturing') {
      return {
        lines: [finishedGoodsSales],
        quantity: finishedGoodsSales.quantity,
        value: finishedGoodsSales.value,
        primary: finishedGoodsSales,
      };
    }

    if (mode === 'trading') {
      return {
        lines: [tradingSales],
        quantity: tradingSales.quantity,
        value: tradingSales.value,
        primary: tradingSales,
      };
    }

    const lines = [finishedGoodsSales, tradingSales];
    return {
      lines,
      quantity: round2(finishedGoodsSales.quantity + tradingSales.quantity),
      value: combineMoney(finishedGoodsSales.value, tradingSales.value),
      primary: null,
    };
  }

  async getUnitExpenses(unit, startDate, endDate) {
    const expenses = await prisma.expense.findMany({
      where: {
        businessUnit: unit,
        date: { gte: startDate, lte: endDate },
      },
    });
    return {
      direct: groupExpensesByCategory(expenses, EXPENSE_TYPES.DIRECT),
      indirect: groupExpensesByCategory(expenses, EXPENSE_TYPES.INDIRECT),
      personal: groupExpensesByCategory(expenses, EXPENSE_TYPES.PERSONAL),
    };
  }

  buildAccountPayload({
    mode,
    unitLabel,
    openingStock,
    purchases,
    directExpenses,
    closingStock,
    damages,
    sales,
    indirectExpenses,
    personalExpenses,
  }) {
    const directExpenseTotal = directExpenses?.total || 0;
    const leftSideValue = round2(
      openingStock.value + purchases.value + directExpenseTotal
    );
    const rightSideValue = round2(
      closingStock.value + damages.value + sales.value
    );
    const leftSideQuantity = round2(openingStock.quantity + purchases.quantity);
    const rightSideQuantity = round2(
      closingStock.quantity + damages.quantity + sales.quantity
    );
    const grossProfit = round2(rightSideValue - leftSideValue);
    const netProfit = round2(grossProfit - (indirectExpenses?.total || 0));
    const finalProfit = round2(netProfit - (personalExpenses?.total || 0));

    const grossLabels = {
      manufacturing: ['Gross Profit', 'Gross Loss'],
      trading: ['Gross Profit', 'Gross Loss'],
      combined: ['Gross Profit', 'Gross Loss'],
    };

    return {
      unit: mode,
      unitLabel,
      reportFormat: 'account-report',
      mode,
      debitSide: {
        heading: 'Debit',
        openingStock,
        purchases,
        directExpenses: directExpenses || { items: [], total: 0 },
        total: { value: leftSideValue, quantity: leftSideQuantity },
      },
      creditSide: {
        heading: 'Credit',
        closingStock,
        damages,
        sales,
        total: { value: rightSideValue, quantity: rightSideQuantity },
      },
      gross: profitLabel(grossProfit, grossLabels[mode][0], grossLabels[mode][1]),
      profitAndLoss: {
        grossProfitBroughtForward: round2(grossProfit),
        indirectExpenses: indirectExpenses || { items: [], total: 0 },
        net: profitLabel(netProfit, 'Net Profit', 'Net Loss'),
      },
      final: {
        netProfit: round2(netProfit),
        personalExpenses: personalExpenses || { items: [], total: 0 },
        final: profitLabel(finalProfit, 'Final Profit', 'Final Loss'),
      },
    };
  }

  async buildAccountReport(mode, startDate, endDate) {
    const { openingAsOf, closingAsOf } = getReportStockDates(startDate, endDate);

    const [
      mfgOpening,
      mfgClosing,
      tradingOpening,
      tradingClosing,
      rawPurchases,
      tradingPurchases,
      finishedGoodsSales,
      tradingSales,
      mfgDamageLines,
      tradingDamageLines,
      mfgExpenses,
      tradingExpenses,
    ] = await Promise.all([
      this.getManufacturingStockBlock(openingAsOf),
      this.getManufacturingStockBlock(closingAsOf),
      this.getTradingStockBlock(openingAsOf),
      this.getTradingStockBlock(closingAsOf),
      this.getPeriodPurchases(BUSINESS_UNITS.MANUFACTURING, startDate, endDate),
      this.getPeriodPurchases(BUSINESS_UNITS.TRADING, startDate, endDate),
      this.getFinishedGoodsSales(startDate, endDate),
      this.getTradingSales(startDate, endDate),
      this.fetchManufacturingDamageLines(startDate, endDate),
      this.fetchTradingDamageLines(startDate, endDate),
      this.getUnitExpenses(BUSINESS_UNITS.MANUFACTURING, startDate, endDate),
      this.getUnitExpenses(BUSINESS_UNITS.TRADING, startDate, endDate),
    ]);

    const purchases = this.buildPurchaseLines(mode, rawPurchases, tradingPurchases);
    const sales = this.buildSalesBlock(mode, finishedGoodsSales, tradingSales);

    let openingStock;
    let closingStock;
    let damages;
    let directExpenses;
    let indirectExpenses;
    let personalExpenses;
    let unitLabel;

    if (mode === 'manufacturing') {
      openingStock = mfgOpening;
      closingStock = mfgClosing;
      damages = this.buildManufacturingDamageLines(mfgDamageLines);
      directExpenses = mfgExpenses.direct;
      indirectExpenses = mfgExpenses.indirect;
      personalExpenses = mfgExpenses.personal;
      unitLabel = 'Manufacturing Account';
    } else if (mode === 'trading') {
      openingStock = {
        lines: tradingOpening.lines,
        quantity: tradingOpening.quantity,
        value: tradingOpening.value,
        asOfDate: tradingOpening.asOfDate,
      };
      closingStock = {
        lines: tradingClosing.lines,
        quantity: tradingClosing.quantity,
        value: tradingClosing.value,
        asOfDate: tradingClosing.asOfDate,
      };
      damages = this.buildTradingDamageLines(tradingDamageLines);
      directExpenses = tradingExpenses.direct;
      indirectExpenses = tradingExpenses.indirect;
      personalExpenses = tradingExpenses.personal;
      unitLabel = 'Trading Account';
    } else {
      openingStock = this.buildGroupedStock(mfgOpening, tradingOpening);
      closingStock = this.buildGroupedStock(mfgClosing, tradingClosing);
      damages = this.buildCombinedDamageLines(mfgDamageLines, tradingDamageLines);
      directExpenses = {
        items: mergeExpenseCategoryItems(
          mfgExpenses.direct.items,
          tradingExpenses.direct.items
        ),
        total: round2(mfgExpenses.direct.total + tradingExpenses.direct.total),
      };
      indirectExpenses = {
        items: mergeExpenseCategoryItems(
          mfgExpenses.indirect.items,
          tradingExpenses.indirect.items
        ),
        total: round2(mfgExpenses.indirect.total + tradingExpenses.indirect.total),
      };
      personalExpenses = {
        items: mergeExpenseCategoryItems(
          mfgExpenses.personal.items,
          tradingExpenses.personal.items
        ),
        total: round2(mfgExpenses.personal.total + tradingExpenses.personal.total),
      };
      unitLabel = 'Combined Account (Manufacturing + Trading)';
    }

    return {
      ...this.buildAccountPayload({
        mode,
        unitLabel,
        openingStock,
        purchases,
        directExpenses,
        closingStock,
        damages,
        sales,
        indirectExpenses,
        personalExpenses,
      }),
      stockDates: {
        openingAsOf,
        closingAsOf,
      },
    };
  }

  async getTradingAccountReport(reportType, startDate, endDate) {
    const type = this.parseReportType(reportType);
    const section = await this.buildAccountReport(type, startDate, endDate);

    return {
      reportType: type,
      startDate,
      endDate,
      stockDates: section.stockDates,
      section,
      manufacturing: type === 'combined' ? await this.buildAccountReport('manufacturing', startDate, endDate) : null,
      trading: type === 'combined' ? await this.buildAccountReport('trading', startDate, endDate) : null,
    };
  }

  formatCurrency(amount) {
    return `₹${Number(amount || 0).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  addExcelStockBlock(sheet, title, block) {
    sheet.addRow([title]);
    if (block.groups?.length) {
      for (const group of block.groups) {
        sheet.addRow([group.label]);
        group.lines.forEach((line) => sheet.addRow([line.label, line.quantity, line.value]));
        sheet.addRow([`${group.label} (Subtotal)`, group.quantity, group.value]);
      }
    } else {
      block.lines.forEach((line) => sheet.addRow([line.label, line.quantity, line.value]));
    }
    sheet.addRow([`${title} (Total)`, block.quantity, block.value]);
    sheet.addRow([]);
  }

  addExcelAccountReport(sheet, section, stockDates) {
    sheet.addRow([section.unitLabel]);
    if (stockDates) {
      sheet.addRow(['Opening stock as of', stockDates.openingAsOf]);
      sheet.addRow(['Closing stock as of', stockDates.closingAsOf]);
    }
    sheet.addRow([]);

    sheet.addRow(['DEBIT SIDE']);
    this.addExcelStockBlock(sheet, 'Opening Stock', section.debitSide.openingStock);
    sheet.addRow(['Purchases']);
    section.debitSide.purchases.lines.forEach((line) => sheet.addRow([line.label, line.quantity, line.value]));
    sheet.addRow(['Purchases (Total)', section.debitSide.purchases.quantity, section.debitSide.purchases.value]);
    sheet.addRow([]);
    if (section.debitSide.directExpenses.items.length) {
      sheet.addRow(['Direct Expenses']);
      section.debitSide.directExpenses.items.forEach((item) => sheet.addRow([item.label, '', item.amount]));
      sheet.addRow(['Total Direct Expenses', '', section.debitSide.directExpenses.total]);
      sheet.addRow([]);
    }
    sheet.addRow([
      'Left Side Total',
      section.debitSide.total.quantity,
      section.debitSide.total.value,
    ]);
    sheet.addRow([]);

    sheet.addRow(['CREDIT SIDE']);
    this.addExcelStockBlock(sheet, 'Closing Stock', section.creditSide.closingStock);
    sheet.addRow(['Damages']);
    section.creditSide.damages.lines.forEach((line) => sheet.addRow([line.label, line.quantity, line.value]));
    sheet.addRow(['Total Damage Value', section.creditSide.damages.quantity, section.creditSide.damages.value]);
    sheet.addRow([]);
    sheet.addRow(['Sales']);
    section.creditSide.sales.lines.forEach((line) => sheet.addRow([line.label, line.quantity, line.value]));
    sheet.addRow(['Sales (Total)', section.creditSide.sales.quantity, section.creditSide.sales.value]);
    sheet.addRow([
      'Right Side Total',
      section.creditSide.total.quantity,
      section.creditSide.total.value,
    ]);
    sheet.addRow([]);
    sheet.addRow([section.gross.label, '', section.gross.amount]);
    sheet.addRow([]);

    sheet.addRow(['Profit & Loss Account']);
    sheet.addRow(['Gross Profit B/F', '', section.profitAndLoss.grossProfitBroughtForward]);
    sheet.addRow(['Less: Indirect Expenses']);
    section.profitAndLoss.indirectExpenses.items.forEach((item) => {
      sheet.addRow([item.label, '', item.amount]);
    });
    sheet.addRow(['Total Indirect Expenses', '', section.profitAndLoss.indirectExpenses.total]);
    sheet.addRow([section.profitAndLoss.net.label, '', section.profitAndLoss.net.amount]);
    sheet.addRow([]);
    sheet.addRow(['Less: Personal Expenses / Drawings']);
    section.final.personalExpenses.items.forEach((item) => {
      sheet.addRow([item.label, '', item.amount]);
    });
    sheet.addRow(['Total Personal Expenses', '', section.final.personalExpenses.total]);
    sheet.addRow([section.final.final.label, '', section.final.final.amount]);
  }

  addPdfAccountReport(doc, section) {
    const line = (left, right = '') => {
      doc.fontSize(9).text(left, { continued: !!right, width: 260 });
      if (right) doc.text(right, { align: 'right' });
    };

    const stockBlock = (title, block) => {
      doc.fontSize(11).text(title, { underline: true });
      if (block.groups?.length) {
        for (const group of block.groups) {
          doc.fontSize(10).text(group.label);
          group.lines.forEach((row) => {
            line(`  ${row.label}`, `${row.quantity} KG | ${this.formatCurrency(row.value)}`);
          });
          line(`${group.label} (Subtotal)`, `${group.quantity} KG | ${this.formatCurrency(group.value)}`);
        }
      } else {
        block.lines.forEach((row) => {
          line(row.label, `${row.quantity} KG | ${this.formatCurrency(row.value)}`);
        });
      }
      line(`${title} (Total)`, `${block.quantity} KG | ${this.formatCurrency(block.value)}`);
      doc.moveDown();
    };

    doc.fontSize(11).text('DEBIT SIDE', { underline: true });
    stockBlock('Opening Stock', section.debitSide.openingStock);
    doc.fontSize(11).text('Purchases', { underline: true });
    section.debitSide.purchases.lines.forEach((row) => {
      line(row.label, `${row.quantity} KG | ${this.formatCurrency(row.value)}`);
    });
    line('Purchases (Total)', `${section.debitSide.purchases.quantity} KG | ${this.formatCurrency(section.debitSide.purchases.value)}`);
    doc.moveDown();
    if (section.debitSide.directExpenses.items.length) {
      doc.fontSize(11).text('Direct Expenses', { underline: true });
      section.debitSide.directExpenses.items.forEach((item) => line(item.label, this.formatCurrency(item.amount)));
      line('Total Direct Expenses', this.formatCurrency(section.debitSide.directExpenses.total));
      doc.moveDown();
    }
    line(
      'Left Side Total',
      `${section.debitSide.total.quantity} KG | ${this.formatCurrency(section.debitSide.total.value)}`
    );
    doc.moveDown();

    doc.fontSize(11).text('CREDIT SIDE', { underline: true });
    stockBlock('Closing Stock', section.creditSide.closingStock);
    doc.fontSize(11).text('Damages', { underline: true });
    section.creditSide.damages.lines.forEach((row) => {
      line(row.label, `${row.quantity} KG | ${this.formatCurrency(row.value)}`);
    });
    line('Total Damage Value', this.formatCurrency(section.creditSide.damages.value));
    doc.moveDown();
    doc.fontSize(11).text('Sales', { underline: true });
    section.creditSide.sales.lines.forEach((row) => {
      line(row.label, `${row.quantity} KG | ${this.formatCurrency(row.value)}`);
    });
    line('Sales (Total)', `${section.creditSide.sales.quantity} KG | ${this.formatCurrency(section.creditSide.sales.value)}`);
    line(
      'Right Side Total',
      `${section.creditSide.total.quantity} KG | ${this.formatCurrency(section.creditSide.total.value)}`
    );
    doc.moveDown();

    line(section.gross.label, this.formatCurrency(section.gross.amount));
    doc.moveDown();

    doc.fontSize(11).text('Profit & Loss Account', { underline: true });
    line('Gross Profit B/F', this.formatCurrency(section.profitAndLoss.grossProfitBroughtForward));
    doc.fontSize(10).text('Less: Indirect Expenses');
    section.profitAndLoss.indirectExpenses.items.forEach((item) => {
      line(item.label, this.formatCurrency(item.amount));
    });
    line('Total Indirect Expenses', this.formatCurrency(section.profitAndLoss.indirectExpenses.total));
    line(section.profitAndLoss.net.label, this.formatCurrency(section.profitAndLoss.net.amount));
    doc.moveDown();

    doc.fontSize(10).text('Less: Personal Expenses / Drawings');
    section.final.personalExpenses.items.forEach((item) => {
      line(item.label, this.formatCurrency(item.amount));
    });
    line('Total Personal Expenses', this.formatCurrency(section.final.personalExpenses.total));
    line(section.final.final.label, this.formatCurrency(section.final.final.amount));
  }

  addExcelTradingAccount(workbook, data) {
    const sheet = workbook.addWorksheet('Account Report');
    const { section, startDate, endDate } = data;

    sheet.addRow(['Period', `${startDate} to ${endDate}`]);
    sheet.addRow(['Report Mode', section.mode]);
    sheet.addRow([]);
    this.addExcelAccountReport(sheet, section, data.stockDates);
    return workbook.xlsx.writeBuffer();
  }

  async exportToExcel(data) {
    const workbook = new ExcelJS.Workbook();
    return this.addExcelTradingAccount(workbook, data);
  }

  async exportToPdf(data) {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const { section, reportType, startDate, endDate } = data;
      doc.fontSize(16).text(section.unitLabel, { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(10).text(`Mode: ${reportType}  |  ${startDate} — ${endDate}`, { align: 'center' });
      doc.moveDown();

      this.addPdfAccountReport(doc, section);
      doc.end();
    });
  }
}

export default new TradingAccountService();

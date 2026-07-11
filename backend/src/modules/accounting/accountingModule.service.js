import { prisma } from '../../config/db.js';
import accountingService from './accounting.service.js';
import balanceSheetService from './balanceSheet.service.js';
import AppError from '../../shared/utils/AppError.js';
import { PAYMENT_STATUS } from '../../shared/constants/index.js';
import { toDateTime } from '../../shared/utils/helpers.js';
import { normalizeExpenseCategory } from '../../shared/utils/expenseCategory.js';
import {
  ACTIVE_ONLY,
  buildListFilter,
  softDeletePayload,
  restorePayload,
  assertNotDeleted,
  assertIsDeleted,
  softDeleteInvoice,
} from '../../shared/utils/softDelete.js';

function buildDateRange(startDate, endDate) {
  if (!startDate && !endDate) return undefined;
  const range = {};
  if (startDate) range.gte = new Date(startDate);
  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    range.lte = end;
  }
  return range;
}

class AccountingModuleService {
  async createExpense(data, userId) {
    if (!data.businessUnit) {
      throw new AppError('businessUnit is required (manufacturing or trading)', 400);
    }
    const expense = await prisma.expense.create({
      data: {
        ...data,
        category: normalizeExpenseCategory(data.category),
        date: toDateTime(data.date),
        createdById: userId,
      },
    });
    await accountingService.recordExpense(expense);
    return expense;
  }

  async updateExpense(id, data) {
    const expense = await prisma.expense.findUnique({ where: { id } });
    assertNotDeleted(expense, 'Expense');

    await accountingService.deleteLedgerEntriesByReference('Expense', expense.id);
    const updateData = { ...data };
    if (data.category !== undefined) {
      updateData.category = normalizeExpenseCategory(data.category);
    }
    if (data.date !== undefined) updateData.date = toDateTime(data.date);
    const updated = await prisma.expense.update({
      where: { id },
      data: updateData,
    });
    await accountingService.recordExpense(updated);
    return updated;
  }

  async deleteExpense(id, userId, deleteReason) {
    const expense = await prisma.expense.findUnique({ where: { id } });
    assertNotDeleted(expense, 'Expense');

    await prisma.$transaction(async (tx) => {
      await accountingService.deleteLedgerEntriesByReference('Expense', expense.id, tx);
      await tx.expense.update({
        where: { id },
        data: softDeletePayload(userId, deleteReason),
      });
    });
  }

  async restoreExpense(id) {
    const expense = await prisma.expense.findUnique({ where: { id } });
    assertIsDeleted(expense, 'Expense');

    return prisma.$transaction(async (tx) => {
      const restored = await tx.expense.update({
        where: { id },
        data: restorePayload(),
      });
      await accountingService.recordExpense(restored, tx);
      return restored;
    });
  }

  async getExpenses({ businessUnit, type, startDate, endDate, search, page = 1, limit = 10 }) {
    const where = buildListFilter({});
    if (businessUnit) where.businessUnit = businessUnit;
    if (type) where.type = type;
    if (search) where.category = { contains: search, mode: 'insensitive' };
    const dateRange = buildDateRange(startDate, endDate);
    if (dateRange) where.date = dateRange;

    const skip = (page - 1) * limit;
    const [expenses, total] = await Promise.all([
      prisma.expense.findMany({
        where,
        include: { createdBy: { select: { name: true } } },
        orderBy: { date: 'desc' },
        skip,
        take: limit,
      }),
      prisma.expense.count({ where }),
    ]);

    return { expenses, total };
  }

  async getExpenseSummary(startDate, endDate) {
    const where = buildListFilter({});
    const dateRange = buildDateRange(startDate, endDate);
    if (dateRange) where.date = dateRange;

    const rows = await prisma.expense.groupBy({
      by: ['type'],
      where,
      _sum: { amount: true },
      _count: { _all: true },
    });

    return rows.map((row) => ({
      _id: row.type,
      total: row._sum.amount ?? 0,
      count: row._count._all,
    }));
  }

  async generateInvoiceNumber(invoiceType = 'customer') {
    const count = await prisma.invoice.count({
      where: buildListFilter({ invoiceType }),
    });
    const year = new Date().getFullYear().toString().slice(-2);
    const prefix = invoiceType === 'vendor' ? 'VINV' : 'INV';
    return `${prefix}-${year}-${String(count + 1).padStart(5, '0')}`;
  }

  async getCanonicalInvoiceTotals(links, fallback = {}) {
    const {
      tradingSaleId,
      manufacturingSaleId,
      tradingPurchaseId,
      rawPurchaseId,
    } = links;

    if (tradingSaleId) {
      const sale = await prisma.sale.findUnique({ where: { id: tradingSaleId } });
      if (!sale) throw new AppError('Trading sale not found', 404);
      return {
        amount: sale.amount,
        totalQuantity: sale.quantity,
        partyName: sale.customerName,
        partyId: fallback.partyId ?? null,
      };
    }

    if (manufacturingSaleId) {
      const sale = await prisma.manufacturingSale.findUnique({
        where: { id: manufacturingSaleId },
      });
      if (!sale) throw new AppError('Manufacturing sale not found', 404);
      return {
        amount: sale.amount,
        totalQuantity: sale.quantity,
        partyName: sale.customerName,
        partyId: fallback.partyId ?? null,
      };
    }

    if (tradingPurchaseId) {
      const purchase = await prisma.purchase.findUnique({
        where: { id: tradingPurchaseId },
        include: { party: true },
      });
      if (!purchase) throw new AppError('Trading purchase not found', 404);
      return {
        amount: purchase.amount,
        totalQuantity: purchase.quantity,
        partyName: purchase.party?.name ?? fallback.partyName,
        partyId: purchase.partyId,
      };
    }

    if (rawPurchaseId) {
      const purchase = await prisma.rawPurchase.findUnique({
        where: { id: rawPurchaseId },
        include: { vendor: true },
      });
      if (!purchase) throw new AppError('Raw purchase not found', 404);
      return {
        amount: purchase.totalAmount,
        totalQuantity: purchase.quantity,
        partyName: purchase.vendor?.name ?? fallback.partyName,
        partyId: fallback.partyId ?? null,
      };
    }

    const itemTotal = fallback.items?.reduce((sum, i) => sum + i.quantity, 0);
    return {
      amount: fallback.amount,
      totalQuantity: itemTotal || fallback.totalQuantity || 0,
      partyName: fallback.partyName,
      partyId: fallback.partyId ?? null,
    };
  }

  async assertNoDuplicateInvoiceLink(links) {
    const checks = [
      ['tradingSaleId', links.tradingSaleId],
      ['manufacturingSaleId', links.manufacturingSaleId],
      ['tradingPurchaseId', links.tradingPurchaseId],
      ['rawPurchaseId', links.rawPurchaseId],
    ].filter(([, id]) => id);

    for (const [field, id] of checks) {
      const existing = await prisma.invoice.findFirst({
        where: buildListFilter({ [field]: id }),
      });
      if (existing) throw new AppError('Invoice already exists for this linked record', 400);
    }
  }

  async createInvoice(data, userId) {
    const invoiceType = data.invoiceType || 'customer';

    await this.assertNoDuplicateInvoiceLink({
      tradingSaleId: data.tradingSale,
      manufacturingSaleId: data.manufacturingSale,
      tradingPurchaseId: data.tradingPurchase,
      rawPurchaseId: data.rawPurchase,
    });

    const canonical = await this.getCanonicalInvoiceTotals(
      {
        tradingSaleId: data.tradingSale,
        manufacturingSaleId: data.manufacturingSale,
        tradingPurchaseId: data.tradingPurchase,
        rawPurchaseId: data.rawPurchase,
      },
      {
        amount: data.amount,
        totalQuantity: data.totalQuantity,
        partyName: data.partyName,
        partyId: data.party ?? data.partyId ?? null,
        items: data.items,
      }
    );

    const amount = canonical.amount;
    if (amount == null || amount < 0) {
      throw new AppError('Invoice amount is required', 400);
    }

    const invoiceNumber = data.invoiceNumber || (await this.generateInvoiceNumber(invoiceType));
    const paidAmount = data.paidAmount || 0;
    const dueAmount = amount - paidAmount;

    let paymentStatus = PAYMENT_STATUS.UNPAID;
    if (paidAmount >= amount) paymentStatus = PAYMENT_STATUS.PAID;
    else if (paidAmount > 0) paymentStatus = PAYMENT_STATUS.PARTIAL;

    const totalQuantity = canonical.totalQuantity;
    const {
      items,
      tradingSale,
      manufacturingSale,
      tradingPurchase,
      rawPurchase,
      party,
      date,
      ...rest
    } = data;

    return prisma.invoice.create({
      data: {
        ...rest,
        amount,
        date: new Date(date),
        invoiceType,
        partyName: canonical.partyName ?? rest.partyName,
        partyId: canonical.partyId ?? party ?? rest.partyId ?? null,
        tradingSaleId: tradingSale ?? null,
        manufacturingSaleId: manufacturingSale ?? null,
        tradingPurchaseId: tradingPurchase ?? null,
        rawPurchaseId: rawPurchase ?? null,
        invoiceNumber,
        dueAmount,
        paymentStatus,
        totalQuantity,
        createdById: userId,
        items: items?.length
          ? {
              create: items.map((item) => ({
                description: item.description,
                quantity: item.quantity,
                rate: item.rate,
                amount: item.amount,
              })),
            }
          : undefined,
      },
      include: {
        items: true,
        party: { select: { name: true } },
      },
    });
  }

  async getInvoices({ search, paymentStatus, invoiceType, startDate, endDate, page = 1, limit = 10 }) {
    const where = buildListFilter({});
    if (invoiceType) where.invoiceType = invoiceType;
    if (paymentStatus) where.paymentStatus = paymentStatus;
    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search, mode: 'insensitive' } },
        { partyName: { contains: search, mode: 'insensitive' } },
      ];
    }
    const dateRange = buildDateRange(startDate, endDate);
    if (dateRange) where.date = dateRange;

    const skip = (page - 1) * limit;
    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: { party: { select: { name: true } } },
        orderBy: { date: 'desc' },
        skip,
        take: limit,
      }),
      prisma.invoice.count({ where }),
    ]);

    return { invoices, total };
  }

  async getInvoiceById(id) {
    const invoice = await prisma.invoice.findFirst({
      where: buildListFilter({ id }),
      include: {
        items: true,
        party: { select: { id: true, name: true } },
      },
    });
    if (!invoice) throw new AppError('Invoice not found', 404);
    return invoice;
  }

  resolvePaymentFields(amount, paidAmount) {
    if (paidAmount > amount) {
      throw new AppError('Paid amount cannot exceed invoice amount', 400);
    }
    const dueAmount = Math.round((amount - paidAmount) * 100) / 100;
    let paymentStatus = PAYMENT_STATUS.UNPAID;
    if (paidAmount >= amount) paymentStatus = PAYMENT_STATUS.PAID;
    else if (paidAmount > 0) paymentStatus = PAYMENT_STATUS.PARTIAL;
    return { paidAmount, dueAmount, paymentStatus };
  }

  async updateInvoice(id, data) {
    const existing = await prisma.invoice.findUnique({
      where: { id },
      include: { items: true },
    });
    assertNotDeleted(existing, 'Invoice');

    const canonical = await this.getCanonicalInvoiceTotals(
      {
        tradingSaleId: existing.tradingSaleId,
        manufacturingSaleId: existing.manufacturingSaleId,
        tradingPurchaseId: existing.tradingPurchaseId,
        rawPurchaseId: existing.rawPurchaseId,
      },
      {
        amount: data.amount !== undefined ? data.amount : existing.amount,
        totalQuantity: data.totalQuantity,
        partyName: data.partyName ?? existing.partyName,
        partyId: data.party ?? data.partyId ?? existing.partyId,
        items: data.items,
      }
    );

    const amount = canonical.amount;
    const paidAmount = data.paidAmount !== undefined ? data.paidAmount : existing.paidAmount;
    const paymentFields = this.resolvePaymentFields(amount, paidAmount);

    const totalQuantity = canonical.totalQuantity ?? existing.totalQuantity;

    const {
      items,
      date,
      tradingSale,
      manufacturingSale,
      tradingPurchase,
      rawPurchase,
      invoiceNumber,
      invoiceType,
      ...rest
    } = data;

    return prisma.$transaction(async (tx) => {
      if (items) {
        await tx.invoiceLineItem.deleteMany({ where: { invoiceId: id } });
      }

      const updateData = {
        amount,
        totalQuantity,
        ...paymentFields,
      };

      if (date !== undefined) updateData.date = new Date(date);
      if (rest.partyName !== undefined) updateData.partyName = rest.partyName;
      if (rest.party !== undefined || rest.partyId !== undefined) {
        updateData.partyId = rest.party ?? rest.partyId ?? null;
      }
      if (rest.reference !== undefined) updateData.reference = rest.reference;
      if (rest.paymentMode !== undefined) updateData.paymentMode = rest.paymentMode;
      if (rest.contactDetails !== undefined) updateData.contactDetails = rest.contactDetails;
      if (rest.gstDetails !== undefined) updateData.gstDetails = rest.gstDetails;
      if (rest.notes !== undefined) updateData.notes = rest.notes;

      if (items?.length) {
        updateData.items = {
          create: items.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            rate: item.rate,
            amount: item.amount,
          })),
        };
      }

      return tx.invoice.update({
        where: { id },
        data: updateData,
        include: {
          items: true,
          party: { select: { name: true } },
        },
      });
    });
  }

  async deleteInvoice(id, userId, deleteReason) {
    const invoice = await prisma.invoice.findUnique({ where: { id } });
    assertNotDeleted(invoice, 'Invoice');

    await prisma.$transaction(async (tx) => {
      await softDeleteInvoice(tx, { id }, userId, deleteReason);
    });
  }

  async restoreInvoice(id) {
    const invoice = await prisma.invoice.findUnique({ where: { id } });
    assertIsDeleted(invoice, 'Invoice');

    return prisma.invoice.update({
      where: { id },
      data: restorePayload(),
    });
  }

  async updateInvoicePayment(id, { paidAmount }) {
    const invoice = await prisma.invoice.findUnique({ where: { id } });
    assertNotDeleted(invoice, 'Invoice');

    const canonical = await this.getCanonicalInvoiceTotals(
      {
        tradingSaleId: invoice.tradingSaleId,
        manufacturingSaleId: invoice.manufacturingSaleId,
        tradingPurchaseId: invoice.tradingPurchaseId,
        rawPurchaseId: invoice.rawPurchaseId,
      },
      { amount: invoice.amount, totalQuantity: invoice.totalQuantity }
    );

    const paymentFields = this.resolvePaymentFields(canonical.amount, paidAmount);

    return prisma.invoice.update({
      where: { id },
      data: {
        amount: canonical.amount,
        totalQuantity: canonical.totalQuantity,
        ...paymentFields,
      },
    });
  }

  async getPendingPayments() {
    return prisma.invoice.findMany({
      where: {
        ...ACTIVE_ONLY,
        paymentStatus: { in: [PAYMENT_STATUS.UNPAID, PAYMENT_STATUS.PARTIAL] },
      },
      orderBy: { date: 'desc' },
      take: 20,
    });
  }

  async getUninvoicedSales() {
    const [invoicedTrading, invoicedMfg] = await Promise.all([
      prisma.invoice.findMany({
        where: { ...ACTIVE_ONLY, tradingSaleId: { not: null } },
        select: { tradingSaleId: true },
      }),
      prisma.invoice.findMany({
        where: { ...ACTIVE_ONLY, manufacturingSaleId: { not: null } },
        select: { manufacturingSaleId: true },
      }),
    ]);

    const invoicedTradingIds = invoicedTrading.map((i) => i.tradingSaleId);
    const invoicedMfgIds = invoicedMfg.map((i) => i.manufacturingSaleId);

    const [tradingSales, manufacturingSales] = await Promise.all([
      prisma.sale.findMany({
        where: { id: { notIn: invoicedTradingIds } },
        include: { item: { select: { name: true, unit: true } } },
        orderBy: { date: 'desc' },
        take: 100,
      }),
      prisma.manufacturingSale.findMany({
        where: { id: { notIn: invoicedMfgIds } },
        orderBy: { date: 'desc' },
        take: 100,
      }),
    ]);

    return { tradingSales, manufacturingSales };
  }

  async getUninvoicedPurchases() {
    const [invoicedTrading, invoicedRaw] = await Promise.all([
      prisma.invoice.findMany({
        where: { ...ACTIVE_ONLY, tradingPurchaseId: { not: null } },
        select: { tradingPurchaseId: true },
      }),
      prisma.invoice.findMany({
        where: { ...ACTIVE_ONLY, rawPurchaseId: { not: null } },
        select: { rawPurchaseId: true },
      }),
    ]);

    const invoicedTradingIds = invoicedTrading.map((i) => i.tradingPurchaseId);
    const invoicedRawIds = invoicedRaw.map((i) => i.rawPurchaseId);

    const [tradingPurchases, rawPurchases] = await Promise.all([
      prisma.purchase.findMany({
        where: { id: { notIn: invoicedTradingIds } },
        include: {
          party: { select: { id: true, name: true, phone: true, email: true, address: true } },
          item: { select: { name: true, unit: true } },
        },
        orderBy: { date: 'desc' },
        take: 100,
      }),
      prisma.rawPurchase.findMany({
        where: { id: { notIn: invoicedRawIds } },
        include: {
          vendor: { select: { id: true, name: true, phone: true, email: true, address: true } },
        },
        orderBy: { date: 'desc' },
        take: 100,
      }),
    ]);

    return { tradingPurchases, rawPurchases };
  }

  async getLedgers(filters) {
    return accountingService.getAllLedgers(filters);
  }

  async getLedgerEntries(ledgerId, filters) {
    return accountingService.getLedgerEntries(ledgerId, filters);
  }

  async getBalanceSheet(units, startDate, endDate) {
    return balanceSheetService.getBalanceSheet(units, startDate, endDate);
  }

  async exportBalanceSheet(units, startDate, endDate) {
    const data = await balanceSheetService.getBalanceSheet(units, startDate, endDate);
    return balanceSheetService.exportToExcel(data);
  }
}

export default new AccountingModuleService();

import { prisma } from '../../config/db.js';
import accountingService from './accounting.service.js';
import balanceSheetService from './balanceSheet.service.js';
import AppError from '../../shared/utils/AppError.js';
import { PAYMENT_STATUS } from '../../shared/constants/index.js';
import { toDateTime } from '../../shared/utils/helpers.js';
import { normalizeExpenseCategory } from '../../shared/utils/expenseCategory.js';

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
    if (!expense) throw new AppError('Expense not found', 404);

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

  async deleteExpense(id) {
    const expense = await prisma.expense.findUnique({ where: { id } });
    if (!expense) throw new AppError('Expense not found', 404);

    await accountingService.deleteLedgerEntriesByReference('Expense', expense.id);
    await prisma.expense.delete({ where: { id } });
  }

  async getExpenses({ businessUnit, type, startDate, endDate, search, page = 1, limit = 10 }) {
    const where = {};
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
    const where = {};
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
      where: { invoiceType },
    });
    const year = new Date().getFullYear().toString().slice(-2);
    const prefix = invoiceType === 'vendor' ? 'VINV' : 'INV';
    return `${prefix}-${year}-${String(count + 1).padStart(5, '0')}`;
  }

  async createInvoice(data, userId) {
    const invoiceType = data.invoiceType || 'customer';

    if (data.tradingSale) {
      const existing = await prisma.invoice.findFirst({
        where: { tradingSaleId: data.tradingSale },
      });
      if (existing) throw new AppError('Invoice already exists for this trading sale', 400);
      const sale = await prisma.sale.findUnique({ where: { id: data.tradingSale } });
      if (!sale) throw new AppError('Trading sale not found', 404);
    }
    if (data.manufacturingSale) {
      const existing = await prisma.invoice.findFirst({
        where: { manufacturingSaleId: data.manufacturingSale },
      });
      if (existing) throw new AppError('Invoice already exists for this manufacturing sale', 400);
      const sale = await prisma.manufacturingSale.findUnique({
        where: { id: data.manufacturingSale },
      });
      if (!sale) throw new AppError('Manufacturing sale not found', 404);
    }
    if (data.tradingPurchase) {
      const existing = await prisma.invoice.findFirst({
        where: { tradingPurchaseId: data.tradingPurchase },
      });
      if (existing) throw new AppError('Invoice already exists for this trading purchase', 400);
      const purchase = await prisma.purchase.findUnique({
        where: { id: data.tradingPurchase },
        include: { party: true },
      });
      if (!purchase) throw new AppError('Trading purchase not found', 404);
      if (!data.party && purchase.partyId) data.party = purchase.partyId;
      if (!data.partyName && purchase.party?.name) data.partyName = purchase.party.name;
    }
    if (data.rawPurchase) {
      const existing = await prisma.invoice.findFirst({
        where: { rawPurchaseId: data.rawPurchase },
      });
      if (existing) throw new AppError('Invoice already exists for this raw purchase', 400);
      const purchase = await prisma.rawPurchase.findUnique({
        where: { id: data.rawPurchase },
        include: { vendor: true },
      });
      if (!purchase) throw new AppError('Raw purchase not found', 404);
      if (!data.partyName && purchase.vendor?.name) data.partyName = purchase.vendor.name;
    }

    const invoiceNumber = data.invoiceNumber || (await this.generateInvoiceNumber(invoiceType));
    const paidAmount = data.paidAmount || 0;
    const dueAmount = data.amount - paidAmount;

    let paymentStatus = PAYMENT_STATUS.UNPAID;
    if (paidAmount >= data.amount) paymentStatus = PAYMENT_STATUS.PAID;
    else if (paidAmount > 0) paymentStatus = PAYMENT_STATUS.PARTIAL;

    const totalQuantity = data.items?.reduce((sum, i) => sum + i.quantity, 0) || data.totalQuantity || 0;
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
        date: new Date(date),
        invoiceType,
        partyId: party ?? rest.partyId ?? null,
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
    const where = {};
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
    const invoice = await prisma.invoice.findUnique({
      where: { id },
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
    if (!existing) throw new AppError('Invoice not found', 404);

    const amount = data.amount !== undefined ? data.amount : existing.amount;
    const paidAmount = data.paidAmount !== undefined ? data.paidAmount : existing.paidAmount;
    const paymentFields = this.resolvePaymentFields(amount, paidAmount);

    const totalQuantity =
      data.items?.reduce((sum, item) => sum + item.quantity, 0) ??
      data.totalQuantity ??
      existing.totalQuantity;

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

  async deleteInvoice(id) {
    const invoice = await prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new AppError('Invoice not found', 404);
    await prisma.invoice.delete({ where: { id } });
  }

  async updateInvoicePayment(id, { paidAmount }) {
    const invoice = await prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new AppError('Invoice not found', 404);

    const paymentFields = this.resolvePaymentFields(invoice.amount, paidAmount);

    return prisma.invoice.update({
      where: { id },
      data: paymentFields,
    });
  }

  async getPendingPayments() {
    return prisma.invoice.findMany({
      where: {
        paymentStatus: { in: [PAYMENT_STATUS.UNPAID, PAYMENT_STATUS.PARTIAL] },
      },
      orderBy: { date: 'desc' },
      take: 20,
    });
  }

  async getUninvoicedSales() {
    const [invoicedTrading, invoicedMfg] = await Promise.all([
      prisma.invoice.findMany({
        where: { tradingSaleId: { not: null } },
        select: { tradingSaleId: true },
      }),
      prisma.invoice.findMany({
        where: { manufacturingSaleId: { not: null } },
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
        where: { tradingPurchaseId: { not: null } },
        select: { tradingPurchaseId: true },
      }),
      prisma.invoice.findMany({
        where: { rawPurchaseId: { not: null } },
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

import { prisma } from '../../config/db.js';
import AppError from '../../shared/utils/AppError.js';
import { LEDGER_TYPES, BUSINESS_UNITS } from '../../shared/constants/index.js';
import { businessUnitFromReferenceType } from './businessUnit.js';
import { toDateTime } from '../../shared/utils/helpers.js';

const db = (tx) => tx ?? prisma;

function entityId(value) {
  if (value == null) return null;
  if (typeof value === 'object') return String(value.id ?? value._id);
  return String(value);
}

class AccountingService {
  async getOrCreateLedger(name, type, party = null, businessUnit = null, tx = null) {
    const client = db(tx);
    const partyId = party ? entityId(party) : null;
    const unit = businessUnit ?? null;

    let ledger = await client.ledger.findFirst({
      where: { name, type, businessUnit: unit },
    });

    if (!ledger) {
      ledger = await client.ledger.create({
        data: {
          name,
          type,
          partyId,
          businessUnit: unit,
          currentBalance: 0,
        },
      });
    }
    return ledger;
  }

  async recalculateLedgerBalance(ledgerId, tx = null) {
    const client = db(tx);
    const ledger = await client.ledger.findUnique({ where: { id: ledgerId } });
    if (!ledger) throw new AppError('Ledger not found', 404);

    const entries = await client.ledgerEntry.findMany({
      where: { ledgerId },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });

    let balance = ledger.openingBalance || 0;
    for (const entry of entries) {
      balance += entry.credit - entry.debit;
      if (entry.balanceAfter !== balance) {
        await client.ledgerEntry.update({
          where: { id: entry.id },
          data: { balanceAfter: balance },
        });
      }
    }

    await client.ledger.update({
      where: { id: ledgerId },
      data: { currentBalance: balance },
    });
    return balance;
  }

  async deleteLedgerEntriesByReference(referenceType, referenceId, tx = null) {
    const client = db(tx);
    const refId = String(referenceId);
    const entries = await client.ledgerEntry.findMany({
      where: { referenceType, referenceId: refId },
    });
    if (!entries.length) return;

    const ledgerIds = [...new Set(entries.map((e) => e.ledgerId))];
    await client.ledgerEntry.deleteMany({
      where: { referenceType, referenceId: refId },
    });

    for (const ledgerId of ledgerIds) {
      await this.recalculateLedgerBalance(ledgerId, tx);
    }
  }

  async createLedgerEntry(
    {
      ledgerId,
      debit = 0,
      credit = 0,
      narration,
      referenceType,
      referenceId,
      date,
      createdBy,
      businessUnit,
    },
    tx = null
  ) {
    const client = db(tx);
    const ledger = await client.ledger.findUnique({ where: { id: ledgerId } });
    if (!ledger) throw new AppError('Ledger not found', 404);

    const resolvedUnit =
      businessUnit || businessUnitFromReferenceType(referenceType) || ledger.businessUnit;

    const balanceChange = credit - debit;
    const balanceAfter = ledger.currentBalance + balanceChange;

    await client.ledger.update({
      where: { id: ledgerId },
      data: { currentBalance: balanceAfter },
    });

    const createdById = createdBy?.id ?? createdBy?._id ?? createdBy ?? null;

    return client.ledgerEntry.create({
      data: {
        ledgerId,
        businessUnit: resolvedUnit,
        debit,
        credit,
        balanceAfter,
        narration,
        referenceType,
        referenceId: referenceId != null ? String(referenceId) : null,
        date: toDateTime(date),
        createdById,
      },
    });
  }

  async recordExpense(expense, tx = null) {
    const unit = expense.businessUnit;
    const ledgerType = expense.paymentMode === 'bank' ? LEDGER_TYPES.BANK : LEDGER_TYPES.CASH;
    const cashName = expense.paymentMode === 'bank' ? 'Bank Account' : 'Cash Account';
    const expenseId = entityId(expense);
    const createdBy = expense.createdById ?? expense.createdBy;

    const cashLedger = await this.getOrCreateLedger(cashName, ledgerType, null, unit, tx);

    await this.createLedgerEntry(
      {
        ledgerId: cashLedger.id,
        debit: expense.amount,
        credit: 0,
        narration: `Expense: ${expense.category} - ${expense.description || ''}`,
        referenceType: 'Expense',
        referenceId: expenseId,
        date: expense.date,
        createdBy,
        businessUnit: unit,
      },
      tx
    );

    const expenseLedger = await this.getOrCreateLedger('Expenses', LEDGER_TYPES.EXPENSES, null, unit, tx);
    await this.createLedgerEntry(
      {
        ledgerId: expenseLedger.id,
        debit: 0,
        credit: expense.amount,
        narration: `${expense.type} expense: ${expense.category}`,
        referenceType: 'Expense',
        referenceId: expenseId,
        date: expense.date,
        createdBy,
        businessUnit: unit,
      },
      tx
    );
  }

  async recordTradingPurchase(purchase, { partyName, itemName } = {}, tx = null) {
    const amount = purchase.amount || 0;
    if (amount <= 0) return;

    const unit = BUSINESS_UNITS.TRADING;
    const purchaseId = entityId(purchase);
    const createdBy = purchase.createdById ?? purchase.createdBy;
    const cashLedger = await this.getOrCreateLedger('Cash Account', LEDGER_TYPES.CASH, null, unit, tx);
    const purchasesLedger = await this.getOrCreateLedger('Purchases', LEDGER_TYPES.PURCHASES, null, unit, tx);
    const narration = `Trading purchase ${purchase.serialNumber}${itemName ? ` — ${itemName}` : ''}${partyName ? ` from ${partyName}` : ''}`;

    await this.createLedgerEntry(
      {
        ledgerId: cashLedger.id,
        debit: amount,
        credit: 0,
        narration,
        referenceType: 'Purchase',
        referenceId: purchaseId,
        date: purchase.date,
        createdBy,
        businessUnit: unit,
      },
      tx
    );

    await this.createLedgerEntry(
      {
        ledgerId: purchasesLedger.id,
        debit: 0,
        credit: amount,
        narration,
        referenceType: 'Purchase',
        referenceId: purchaseId,
        date: purchase.date,
        createdBy,
        businessUnit: unit,
      },
      tx
    );
  }

  async recordTradingSale(sale, { itemName } = {}, tx = null) {
    const amount = sale.amount || 0;
    if (amount <= 0) return;

    const unit = BUSINESS_UNITS.TRADING;
    const saleId = entityId(sale);
    const createdBy = sale.createdById ?? sale.createdBy;
    const cashLedger = await this.getOrCreateLedger('Cash Account', LEDGER_TYPES.CASH, null, unit, tx);
    const salesLedger = await this.getOrCreateLedger('Sales', LEDGER_TYPES.SALES, null, unit, tx);
    const narration = `Trading sale ${sale.serialNumber}${itemName ? ` — ${itemName}` : ''} to ${sale.customerName || 'Customer'}`;

    await this.createLedgerEntry(
      {
        ledgerId: cashLedger.id,
        debit: 0,
        credit: amount,
        narration,
        referenceType: 'Sale',
        referenceId: saleId,
        date: sale.date,
        createdBy,
        businessUnit: unit,
      },
      tx
    );

    await this.createLedgerEntry(
      {
        ledgerId: salesLedger.id,
        debit: 0,
        credit: amount,
        narration,
        referenceType: 'Sale',
        referenceId: saleId,
        date: sale.date,
        createdBy,
        businessUnit: unit,
      },
      tx
    );
  }

  async recordRawPurchase(purchase, { vendorName } = {}, tx = null) {
    const amount = purchase.totalAmount || 0;
    if (amount <= 0) return;

    const unit = BUSINESS_UNITS.MANUFACTURING;
    const purchaseId = entityId(purchase);
    const createdBy = purchase.createdById ?? purchase.createdBy;
    const cashLedger = await this.getOrCreateLedger('Cash Account', LEDGER_TYPES.CASH, null, unit, tx);
    const purchasesLedger = await this.getOrCreateLedger('Purchases', LEDGER_TYPES.PURCHASES, null, unit, tx);
    const narration = `Raw purchase lot ${purchase.lotNumber}${vendorName ? ` — ${vendorName}` : ''}`;

    await this.createLedgerEntry(
      {
        ledgerId: cashLedger.id,
        debit: amount,
        credit: 0,
        narration,
        referenceType: 'RawPurchase',
        referenceId: purchaseId,
        date: purchase.date,
        createdBy,
        businessUnit: unit,
      },
      tx
    );

    await this.createLedgerEntry(
      {
        ledgerId: purchasesLedger.id,
        debit: 0,
        credit: amount,
        narration,
        referenceType: 'RawPurchase',
        referenceId: purchaseId,
        date: purchase.date,
        createdBy,
        businessUnit: unit,
      },
      tx
    );
  }

  async recordManufacturingSale(sale, tx = null) {
    const amount = sale.amount || 0;
    if (amount <= 0) return;

    const unit = BUSINESS_UNITS.MANUFACTURING;
    const saleId = entityId(sale);
    const createdBy = sale.createdById ?? sale.createdBy;
    const cashLedger = await this.getOrCreateLedger('Cash Account', LEDGER_TYPES.CASH, null, unit, tx);
    const salesLedger = await this.getOrCreateLedger('Sales', LEDGER_TYPES.SALES, null, unit, tx);
    const narration = `Manufacturing sale ${sale.serialNumber} to ${sale.customerName || 'Customer'}`;

    await this.createLedgerEntry(
      {
        ledgerId: cashLedger.id,
        debit: 0,
        credit: amount,
        narration,
        referenceType: 'ManufacturingSale',
        referenceId: saleId,
        date: sale.date,
        createdBy,
        businessUnit: unit,
      },
      tx
    );

    await this.createLedgerEntry(
      {
        ledgerId: salesLedger.id,
        debit: 0,
        credit: amount,
        narration,
        referenceType: 'ManufacturingSale',
        referenceId: saleId,
        date: sale.date,
        createdBy,
        businessUnit: unit,
      },
      tx
    );
  }

  async recordManufacturingDamage(damage, tx = null) {
    const amount = damage.totalLoss || 0;
    if (amount <= 0) return;

    const unit = BUSINESS_UNITS.MANUFACTURING;
    const damageId = entityId(damage);
    const createdBy = damage.createdById ?? damage.createdBy;
    const narration = `Manufacturing damage ${damage.serialNumber}`;

    const lossLedger = await this.getOrCreateLedger(
      'Damage / Inventory Loss',
      LEDGER_TYPES.EXPENSES,
      null,
      unit,
      tx
    );
    const inventoryLedger = await this.getOrCreateLedger('Inventory', LEDGER_TYPES.PURCHASES, null, unit, tx);

    await this.createLedgerEntry(
      {
        ledgerId: lossLedger.id,
        debit: amount,
        credit: 0,
        narration,
        referenceType: 'ManufacturingDamage',
        referenceId: damageId,
        date: damage.date,
        createdBy,
        businessUnit: unit,
      },
      tx
    );

    await this.createLedgerEntry(
      {
        ledgerId: inventoryLedger.id,
        debit: 0,
        credit: amount,
        narration,
        referenceType: 'ManufacturingDamage',
        referenceId: damageId,
        date: damage.date,
        createdBy,
        businessUnit: unit,
      },
      tx
    );
  }

  async recordTradingDamage(damage, tx = null) {
    const amount = damage.totalLoss || 0;
    if (amount <= 0) return;

    const unit = BUSINESS_UNITS.TRADING;
    const damageId = entityId(damage);
    const createdBy = damage.createdById ?? damage.createdBy;
    const narration = `Trading damage ${damage.serialNumber}`;

    const lossLedger = await this.getOrCreateLedger(
      'Damage / Inventory Loss',
      LEDGER_TYPES.EXPENSES,
      null,
      unit,
      tx
    );
    const inventoryLedger = await this.getOrCreateLedger('Inventory', LEDGER_TYPES.PURCHASES, null, unit, tx);

    await this.createLedgerEntry(
      {
        ledgerId: lossLedger.id,
        debit: amount,
        credit: 0,
        narration,
        referenceType: 'TradingDamage',
        referenceId: damageId,
        date: damage.date,
        createdBy,
        businessUnit: unit,
      },
      tx
    );

    await this.createLedgerEntry(
      {
        ledgerId: inventoryLedger.id,
        debit: 0,
        credit: amount,
        narration,
        referenceType: 'TradingDamage',
        referenceId: damageId,
        date: damage.date,
        createdBy,
        businessUnit: unit,
      },
      tx
    );
  }

  async getAllLedgers(filters = {}) {
    const where = { isActive: true };
    if (filters.type) where.type = filters.type;
    if (filters.businessUnit) where.businessUnit = filters.businessUnit;

    return prisma.ledger.findMany({
      where,
      include: { party: { select: { name: true, type: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async getLedgerEntries(ledgerId, { startDate, endDate, businessUnit, skip = 0, limit = 50 } = {}) {
    const where = { ledgerId };
    if (businessUnit) where.businessUnit = businessUnit;
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.date.lte = end;
      }
    }

    const [entries, total] = await Promise.all([
      prisma.ledgerEntry.findMany({
        where,
        orderBy: { date: 'desc' },
        skip,
        take: limit,
      }),
      prisma.ledgerEntry.count({ where }),
    ]);

    return { entries, total };
  }
}

export default new AccountingService();

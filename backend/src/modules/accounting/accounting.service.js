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
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
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

  /**
   * Reverse ledger lines for a reference without full-history rebuild.
   * - Adjusts ledger.currentBalance by the exact reverse of deleted lines
   * - Adjusts balanceAfter only on entries that came after the deleted ones
   * Full recalculateLedgerBalance remains available for repair/audit.
   */
  async deleteLedgerEntriesByReference(referenceType, referenceId, tx = null) {
    const client = db(tx);
    const refId = String(referenceId);
    const entries = await client.ledgerEntry.findMany({
      where: { referenceType, referenceId: refId },
    });
    if (!entries.length) return;

    const byLedger = new Map();
    for (const entry of entries) {
      if (!byLedger.has(entry.ledgerId)) byLedger.set(entry.ledgerId, []);
      byLedger.get(entry.ledgerId).push(entry);
    }

    await client.ledgerEntry.deleteMany({
      where: { referenceType, referenceId: refId },
    });

    for (const [ledgerId, ledgerEntries] of byLedger) {
      const netChange = Math.round(
        ledgerEntries.reduce((sum, e) => sum + (e.credit - e.debit), 0) * 100
      ) / 100;

      let earliest = ledgerEntries[0];
      for (const e of ledgerEntries) {
        if (
          e.date < earliest.date
          || (e.date.getTime() === earliest.date.getTime() && e.createdAt < earliest.createdAt)
          || (
            e.date.getTime() === earliest.date.getTime()
            && e.createdAt.getTime() === earliest.createdAt.getTime()
            && e.id < earliest.id
          )
        ) {
          earliest = e;
        }
      }

      await client.ledger.update({
        where: { id: ledgerId },
        data: { currentBalance: { decrement: netChange } },
      });

      if (netChange === 0) continue;

      // Fix running balances on later entries (same effect as create reversing)
      await client.ledgerEntry.updateMany({
        where: {
          ledgerId,
          OR: [
            { date: { gt: earliest.date } },
            {
              AND: [
                { date: earliest.date },
                { createdAt: { gt: earliest.createdAt } },
              ],
            },
            {
              AND: [
                { date: earliest.date },
                { createdAt: earliest.createdAt },
                { id: { gt: earliest.id } },
              ],
            },
          ],
        },
        data: { balanceAfter: { decrement: netChange } },
      });
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
      ledger: ledgerHint = null,
    },
    tx = null
  ) {
    const client = db(tx);
    const ledger = ledgerHint?.id === ledgerId
      ? ledgerHint
      : await client.ledger.findUnique({ where: { id: ledgerId } });
    if (!ledger) throw new AppError('Ledger not found', 404);

    const resolvedUnit =
      businessUnit || businessUnitFromReferenceType(referenceType) || ledger.businessUnit;

    const balanceChange = credit - debit;
    const balanceAfter = ledger.currentBalance + balanceChange;

    await client.ledger.update({
      where: { id: ledgerId },
      data: { currentBalance: balanceAfter },
    });

    // Keep hint in sync if caller reuses the object for a second entry on same ledger
    ledger.currentBalance = balanceAfter;

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
    const narration = `Trading purchase ${purchase.serialNumber}${itemName ? ` — ${itemName}` : ''}${partyName ? ` from ${partyName}` : ''}`;

    const [cashLedger, purchasesLedger] = await Promise.all([
      this.getOrCreateLedger('Cash Account', LEDGER_TYPES.CASH, null, unit, tx),
      this.getOrCreateLedger('Purchases', LEDGER_TYPES.PURCHASES, null, unit, tx),
    ]);

    await Promise.all([
      this.createLedgerEntry(
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
          ledger: cashLedger,
        },
        tx
      ),
      this.createLedgerEntry(
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
          ledger: purchasesLedger,
        },
        tx
      ),
    ]);
  }

  async recordTradingSale(sale, { itemName } = {}, tx = null) {
    const amount = sale.amount || 0;
    if (amount <= 0) return;

    const unit = BUSINESS_UNITS.TRADING;
    const saleId = entityId(sale);
    const createdBy = sale.createdById ?? sale.createdBy;
    const narration = `Trading sale ${sale.serialNumber}${itemName ? ` — ${itemName}` : ''} to ${sale.customerName || 'Customer'}`;

    const [cashLedger, salesLedger] = await Promise.all([
      this.getOrCreateLedger('Cash Account', LEDGER_TYPES.CASH, null, unit, tx),
      this.getOrCreateLedger('Sales', LEDGER_TYPES.SALES, null, unit, tx),
    ]);

    await Promise.all([
      this.createLedgerEntry(
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
          ledger: cashLedger,
        },
        tx
      ),
      this.createLedgerEntry(
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
          ledger: salesLedger,
        },
        tx
      ),
    ]);
  }

  async recordRawPurchase(purchase, { vendorName } = {}, tx = null) {
    const amount = purchase.totalAmount || 0;
    if (amount <= 0) return;

    const unit = BUSINESS_UNITS.MANUFACTURING;
    const purchaseId = entityId(purchase);
    const createdBy = purchase.createdById ?? purchase.createdBy;
    const narration = `Raw purchase lot ${purchase.lotNumber}${vendorName ? ` — ${vendorName}` : ''}`;

    const [cashLedger, purchasesLedger] = await Promise.all([
      this.getOrCreateLedger('Cash Account', LEDGER_TYPES.CASH, null, unit, tx),
      this.getOrCreateLedger('Purchases', LEDGER_TYPES.PURCHASES, null, unit, tx),
    ]);

    await Promise.all([
      this.createLedgerEntry(
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
          ledger: cashLedger,
        },
        tx
      ),
      this.createLedgerEntry(
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
          ledger: purchasesLedger,
        },
        tx
      ),
    ]);
  }

  async recordManufacturingSale(sale, tx = null) {
    const amount = sale.amount || 0;
    if (amount <= 0) return;

    const unit = BUSINESS_UNITS.MANUFACTURING;
    const saleId = entityId(sale);
    const createdBy = sale.createdById ?? sale.createdBy;
    const narration = `Manufacturing sale ${sale.serialNumber} to ${sale.customerName || 'Customer'}`;

    const [cashLedger, salesLedger] = await Promise.all([
      this.getOrCreateLedger('Cash Account', LEDGER_TYPES.CASH, null, unit, tx),
      this.getOrCreateLedger('Sales', LEDGER_TYPES.SALES, null, unit, tx),
    ]);

    await Promise.all([
      this.createLedgerEntry(
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
          ledger: cashLedger,
        },
        tx
      ),
      this.createLedgerEntry(
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
          ledger: salesLedger,
        },
        tx
      ),
    ]);
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

  invoiceBusinessUnit(invoice) {
    if (invoice.manufacturingSaleId || invoice.rawPurchaseId) return BUSINESS_UNITS.MANUFACTURING;
    if (invoice.tradingSaleId || invoice.tradingPurchaseId) return BUSINESS_UNITS.TRADING;
    return null;
  }

  invoiceIsLinked(invoice) {
    return Boolean(
      invoice.tradingSaleId
      || invoice.manufacturingSaleId
      || invoice.tradingPurchaseId
      || invoice.rawPurchaseId
    );
  }

  async refreshBankAccountBalances(tx = null) {
    const client = db(tx);
    const accounts = await client.bankAccount.findMany({
      select: { id: true, ledgerId: true, currentBalance: true },
    });
    for (const account of accounts) {
      const ledger = await client.ledger.findUnique({
        where: { id: account.ledgerId },
        select: { currentBalance: true },
      });
      if (!ledger || ledger.currentBalance === account.currentBalance) continue;
      await client.bankAccount.update({
        where: { id: account.id },
        data: { currentBalance: ledger.currentBalance },
      });
    }
  }

  /**
   * Move collected/paid invoice money onto Cash or the selected bank account.
   * Linked sales/purchases already post the full amount to unit Cash, so:
   * - Cash + linked document: no extra entry (avoids double-counting)
   * - Bank + linked document: transfer the paid amount from that Cash ledger to the bank
   * - Standalone invoice: credit (customer) or debit (vendor) the selected account directly
   * Customer receipt increases the account (credit). Vendor payment decreases it (debit).
   */
  async syncInvoiceAccountMovement(invoice, userId, tx = null) {
    await this.deleteLedgerEntriesByReference('Invoice', invoice.id, tx);
    if (invoice.isDeleted) {
      await this.refreshBankAccountBalances(tx);
      return;
    }

    const paid = Math.round((Number(invoice.paidAmount) || 0) * 100) / 100;
    if (paid <= 0) {
      await this.refreshBankAccountBalances(tx);
      return;
    }

    const client = db(tx);
    const linked = this.invoiceIsLinked(invoice);
    const unit = this.invoiceBusinessUnit(invoice);
    const isReceipt = invoice.invoiceType !== 'vendor';
    const narration = `${isReceipt ? 'Payment received' : 'Payment made'} — ${invoice.invoiceNumber}${invoice.partyName ? ` · ${invoice.partyName}` : ''}`;
    const createdBy = userId;

    let targetLedger = null;
    if (invoice.bankAccountId) {
      const account = await client.bankAccount.findUnique({
        where: { id: invoice.bankAccountId },
        include: { ledger: true },
      });
      if (!account?.ledger) throw new AppError('Selected bank account was not found', 400);
      targetLedger = account.ledger;
    } else if (linked) {
      await this.refreshBankAccountBalances(tx);
      return;
    } else {
      targetLedger = await this.getOrCreateLedger('Cash Account', LEDGER_TYPES.CASH, null, unit, tx);
    }

    const entryBase = {
      narration,
      referenceType: 'Invoice',
      referenceId: invoice.id,
      date: invoice.date,
      createdBy,
      businessUnit: unit,
    };

    if (invoice.bankAccountId && linked && unit) {
      const cashLedger = await this.getOrCreateLedger('Cash Account', LEDGER_TYPES.CASH, null, unit, tx);
      if (isReceipt) {
        await this.createLedgerEntry({
          ...entryBase,
          ledgerId: cashLedger.id,
          debit: paid,
          credit: 0,
          narration: `${narration} (moved from cash)`,
          ledger: cashLedger,
        }, tx);
        await this.createLedgerEntry({
          ...entryBase,
          ledgerId: targetLedger.id,
          debit: 0,
          credit: paid,
          ledger: targetLedger,
        }, tx);
      } else {
        await this.createLedgerEntry({
          ...entryBase,
          ledgerId: cashLedger.id,
          debit: 0,
          credit: paid,
          narration: `${narration} (moved from cash)`,
          ledger: cashLedger,
        }, tx);
        await this.createLedgerEntry({
          ...entryBase,
          ledgerId: targetLedger.id,
          debit: paid,
          credit: 0,
          ledger: targetLedger,
        }, tx);
      }
    } else if (isReceipt) {
      await this.createLedgerEntry({
        ...entryBase,
        ledgerId: targetLedger.id,
        debit: 0,
        credit: paid,
        ledger: targetLedger,
      }, tx);
    } else {
      await this.createLedgerEntry({
        ...entryBase,
        ledgerId: targetLedger.id,
        debit: paid,
        credit: 0,
        ledger: targetLedger,
      }, tx);
    }

    await this.refreshBankAccountBalances(tx);
  }

  async getAllLedgers(filters = {}) {
    const where = { isActive: true };
    if (filters.type) where.type = filters.type;
    if (filters.businessUnit) {
      where.OR = [
        { businessUnit: filters.businessUnit },
        { businessUnit: null, type: LEDGER_TYPES.BANK },
      ];
    }

    return prisma.ledger.findMany({
      where,
      include: { party: { select: { name: true, type: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async getLedgerEntries(ledgerId, { startDate, endDate, businessUnit, skip = 0, limit = 50 } = {}) {
    const ledger = await prisma.ledger.findUnique({
      where: { id: ledgerId },
      select: { businessUnit: true },
    });
    const where = { ledgerId };
    // Company bank accounts are shared — don't hide entries behind a unit filter.
    if (businessUnit && ledger?.businessUnit) where.businessUnit = businessUnit;
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

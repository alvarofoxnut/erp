import { prisma } from '../../config/db.js';
import AppError from '../../shared/utils/AppError.js';
import { LEDGER_TYPES } from '../../shared/constants/index.js';
import accountingService from './accounting.service.js';
import { withTransaction } from '../../shared/utils/transaction.js';

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

const accountInclude = {
  ledger: { select: { id: true, currentBalance: true, name: true } },
};

class BankAccountService {
  async list({ search, active, page = 1, limit = 10 } = {}) {
    const where = {};
    if (active === 'true') where.isActive = true;
    if (active === 'false') where.isActive = false;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { bankName: { contains: search, mode: 'insensitive' } },
        { accountNumber: { contains: search, mode: 'insensitive' } },
      ];
    }

    const skip = (page - 1) * limit;
    const [accounts, total] = await Promise.all([
      prisma.bankAccount.findMany({
        where,
        include: accountInclude,
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
      prisma.bankAccount.count({ where }),
    ]);

    return {
      accounts: accounts.map((account) => ({
        ...account,
        currentBalance: account.ledger?.currentBalance ?? account.currentBalance,
      })),
      total,
    };
  }

  async resolvePaymentAccount({ paymentAccount, bankAccountId, paymentMode, paidAmount }, tx = prisma) {
    const paid = round2(paidAmount);
    const selected = paymentAccount || bankAccountId || null;

    if (paid <= 0) {
      return { paymentMode: 'cash', bankAccountId: null };
    }

    if (!selected || selected === 'cash') {
      return { paymentMode: 'cash', bankAccountId: null };
    }

    if (['bank', 'upi', 'cheque', 'credit'].includes(selected) && !bankAccountId) {
      return { paymentMode: 'cash', bankAccountId: null };
    }

    const account = await tx.bankAccount.findUnique({ where: { id: String(selected) } });
    if (!account || !account.isActive) {
      throw new AppError('Select cash or an active bank account for the collected payment', 400);
    }
    return { paymentMode: 'bank', bankAccountId: account.id };
  }

  async postOpeningBalance(account, amount, userId, tx) {
    await accountingService.deleteLedgerEntriesByReference('BankAccountOpening', account.id, tx);
    const opening = round2(amount);
    if (opening === 0) {
      const ledger = await tx.ledger.findUnique({ where: { id: account.ledgerId } });
      return ledger?.currentBalance ?? 0;
    }

    const ledger = await tx.ledger.findUnique({ where: { id: account.ledgerId } });
    await accountingService.createLedgerEntry(
      {
        ledgerId: account.ledgerId,
        debit: opening < 0 ? Math.abs(opening) : 0,
        credit: opening > 0 ? opening : 0,
        narration: `Opening balance — ${account.name}`,
        referenceType: 'BankAccountOpening',
        referenceId: account.id,
        date: account.createdAt || new Date('2000-01-01'),
        createdBy: userId,
        businessUnit: null,
        ledger,
      },
      tx
    );
    return accountingService.recalculateLedgerBalance(account.ledgerId, tx);
  }

  async create(data, userId) {
    const name = String(data.name || '').trim();
    if (!name) throw new AppError('Account name is required', 400);
    const openingBalance = round2(data.openingBalance);
    if (Number.isNaN(openingBalance)) throw new AppError('Initial balance must be a number', 400);

    const existing = await prisma.bankAccount.findUnique({ where: { name } });
    if (existing) throw new AppError('An account with this name already exists', 400);

    return withTransaction(async (tx) => {
      const ledger = await tx.ledger.create({
        data: {
          name,
          type: LEDGER_TYPES.BANK,
          businessUnit: null,
          openingBalance: 0,
          currentBalance: 0,
        },
      });

      const account = await tx.bankAccount.create({
        data: {
          name,
          bankName: data.bankName?.trim() || null,
          accountNumber: data.accountNumber?.trim() || null,
          ifsc: data.ifsc?.trim() || null,
          openingBalance,
          currentBalance: 0,
          ledgerId: ledger.id,
          notes: data.notes?.trim() || null,
          createdById: userId || null,
        },
      });

      const currentBalance = await this.postOpeningBalance(account, openingBalance, userId, tx);
      return tx.bankAccount.update({
        where: { id: account.id },
        data: { currentBalance, openingBalance },
        include: accountInclude,
      });
    });
  }

  async update(id, data, userId) {
    const existing = await prisma.bankAccount.findUnique({ where: { id } });
    if (!existing) throw new AppError('Account not found', 404);

    const name = data.name !== undefined ? String(data.name).trim() : existing.name;
    if (!name) throw new AppError('Account name is required', 400);
    if (name !== existing.name) {
      const clash = await prisma.bankAccount.findUnique({ where: { name } });
      if (clash) throw new AppError('An account with this name already exists', 400);
    }

    const openingBalance = data.openingBalance !== undefined
      ? round2(data.openingBalance)
      : existing.openingBalance;

    return withTransaction(async (tx) => {
      if (name !== existing.name) {
        await tx.ledger.update({
          where: { id: existing.ledgerId },
          data: { name },
        });
      }

      const account = await tx.bankAccount.update({
        where: { id },
        data: {
          name,
          bankName: data.bankName !== undefined ? (data.bankName?.trim() || null) : existing.bankName,
          accountNumber: data.accountNumber !== undefined ? (data.accountNumber?.trim() || null) : existing.accountNumber,
          ifsc: data.ifsc !== undefined ? (data.ifsc?.trim() || null) : existing.ifsc,
          notes: data.notes !== undefined ? (data.notes?.trim() || null) : existing.notes,
          isActive: data.isActive !== undefined ? Boolean(data.isActive) : existing.isActive,
          openingBalance,
        },
      });

      let currentBalance = account.currentBalance;
      if (round2(openingBalance) !== round2(existing.openingBalance)) {
        currentBalance = await this.postOpeningBalance(
          { ...account, name },
          openingBalance,
          userId,
          tx
        );
      } else {
        const ledger = await tx.ledger.findUnique({ where: { id: existing.ledgerId } });
        currentBalance = ledger?.currentBalance ?? currentBalance;
      }

      return tx.bankAccount.update({
        where: { id },
        data: { currentBalance },
        include: accountInclude,
      });
    });
  }

  async remove(id) {
    const existing = await prisma.bankAccount.findUnique({
      where: { id },
      include: { _count: { select: { invoices: true } } },
    });
    if (!existing) throw new AppError('Account not found', 404);
    if (existing._count.invoices > 0) {
      throw new AppError('This account is used on invoices. Deactivate it instead of deleting.', 400);
    }

    const movementCount = await prisma.ledgerEntry.count({
      where: {
        ledgerId: existing.ledgerId,
        referenceType: { not: 'BankAccountOpening' },
      },
    });
    if (movementCount > 0) {
      throw new AppError('This account already has transactions. Deactivate it instead of deleting.', 400);
    }

    return withTransaction(async (tx) => {
      await accountingService.deleteLedgerEntriesByReference('BankAccountOpening', id, tx);
      await tx.bankAccount.delete({ where: { id } });
      await tx.ledger.delete({ where: { id: existing.ledgerId } });
    });
  }
}

export default new BankAccountService();

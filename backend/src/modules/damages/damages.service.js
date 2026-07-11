import { prisma } from '../../config/db.js';
import { withTransaction } from '../../shared/utils/transaction.js';
import { buildSearchFilter, buildDateRange } from '../../shared/utils/query.js';
import inventoryService from '../inventory/inventory.service.js';
import inventoryRepository from '../inventory/inventory.repository.js';
import accountingService from '../accounting/accounting.service.js';
import damageStockOptionsService from './damageStockOptions.service.js';
import damagesInventoryService from './damagesInventory.service.js';
import {
  STOCK_CATEGORIES,
  MANUFACTURING_DAMAGE_INVENTORY_TYPES,
} from '../../shared/constants/index.js';
import AppError from '../../shared/utils/AppError.js';
import { validateOutboundCapacity } from '../inventory/stockValidation.js';
import { getFinancialYear } from '../../shared/utils/helpers.js';
import {
  ACTIVE_ONLY,
  buildListFilter,
  softDeletePayload,
  restorePayload,
  assertNotDeleted,
  assertIsDeleted,
} from '../../shared/utils/softDelete.js';

const round2 = (n) => Math.round((n || 0) * 100) / 100;

const createdByInclude = {
  createdBy: { select: { id: true, name: true } },
};

const mfgDamageInclude = {
  lines: true,
  ...createdByInclude,
};

const tradingDamageInclude = {
  lines: { include: { item: { select: { id: true, name: true, unit: true } } } },
  ...createdByInclude,
};

const INVENTORY_TYPE_LABELS = {
  [STOCK_CATEGORIES.RAW_MATERIAL]: 'Raw Material',
  [STOCK_CATEGORIES.QUALITY_6NO]: '6 No',
  [STOCK_CATEGORIES.QUALITY_5NO]: '5 No',
  [STOCK_CATEGORIES.QUALITY_4_5NO]: '4.5 No',
  [STOCK_CATEGORIES.QUALITY_4NO]: '4 No',
  [STOCK_CATEGORIES.QUALITY_OTHERS]: 'Others',
  [STOCK_CATEGORIES.FINISHED_GOODS]: 'Finished Goods',
};

function normalizeInputLines(lines) {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new AppError('At least one damage line is required', 400);
  }
  return lines.map((line, index) => {
    const quantity = parseFloat(line.quantity);
    if (!quantity || quantity <= 0) {
      throw new AppError(`Line ${index + 1}: quantity must be greater than zero`, 400);
    }
    return { ...line, quantity };
  });
}

function sumTotalLoss(lines) {
  return round2(lines.reduce((sum, line) => sum + (line.lossAmount || 0), 0));
}

function mapMfgLineToDb(line) {
  return {
    inventoryType: line.inventoryType,
    lotNumber: line.lotNumber || null,
    batchId: line.batchId || null,
    batchNumber: line.batchNumber || null,
    quantity: line.quantity,
    costPerKg: line.costPerKg,
    lossAmount: line.lossAmount,
    reason: line.reason?.trim() || null,
  };
}

function mapTradingLineToDb(line) {
  return {
    itemId: line.itemId,
    quantity: line.quantity,
    costPerUnit: line.costPerUnit,
    lossAmount: line.lossAmount,
    reason: line.reason?.trim() || null,
  };
}

async function resolveManufacturingLines(rawLines, tx) {
  const resolved = [];
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (!MANUFACTURING_DAMAGE_INVENTORY_TYPES.includes(line.inventoryType)) {
      throw new AppError(`Line ${i + 1}: invalid inventory type`, 400);
    }
    const resolvedLine = await damageStockOptionsService.resolveManufacturingLine(line, tx);
    resolved.push({
      ...resolvedLine,
      reason: line.reason,
    });
  }
  return resolved;
}

async function resolveTradingLines(rawLines, tx) {
  const resolved = [];
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const itemId = line.itemId || line.item;
    if (!itemId) throw new AppError(`Line ${i + 1}: product is required`, 400);
    const resolvedLine = await damageStockOptionsService.resolveTradingLine(
      { ...line, itemId },
      tx
    );
    resolved.push({
      ...resolvedLine,
      reason: line.reason,
    });
  }
  return resolved;
}

async function validateResolvedManufacturingLines(lines, tx, { referenceType = null, referenceId = null, previousLines = [] } = {}) {
  for (const line of lines) {
    const prev = previousLines.find((p) =>
      line.inventoryType === STOCK_CATEGORIES.FINISHED_GOODS
        ? p.batchId === line.batchId
        : p.inventoryType === line.inventoryType && p.lotNumber === line.lotNumber
    );
    await damagesInventoryService.validateManufacturingLineStock(line, tx, {
      referenceType,
      referenceId,
      previousLine: prev,
    });
  }
}

async function validateResolvedTradingLines(
  lines,
  tx,
  { referenceType = null, referenceId = null, previousLines = [] } = {}
) {
  const aggregated = {};
  for (const line of lines) {
    aggregated[line.itemId] = (aggregated[line.itemId] || 0) + line.quantity;
  }

  const previousByItem = {};
  for (const line of previousLines) {
    previousByItem[line.itemId] = (previousByItem[line.itemId] || 0) + (line.quantity || 0);
  }

  for (const [itemId, qty] of Object.entries(aggregated)) {
    await validateOutboundCapacity(
      STOCK_CATEGORIES.TRADING,
      { item: itemId },
      qty,
      tx,
      { referenceType, referenceId, label: 'trading item' }
    );

    const balance = await inventoryRepository.getCurrentBalance(
      STOCK_CATEGORIES.TRADING,
      { item: itemId },
      tx
    );
    const available = round2(balance + (previousByItem[itemId] || 0));
    if (available < qty) {
      throw new AppError(
        `Insufficient trading stock. Available: ${available}, Required: ${qty}`,
        400
      );
    }
  }
}

class DamagesService {
  async getManufacturingStockOptions(inventoryType) {
    return damageStockOptionsService.getManufacturingOptions(inventoryType);
  }

  async getTradingStockOptions(itemId) {
    return damageStockOptionsService.getTradingOption(itemId);
  }

  async generateManufacturingSerial(tx = prisma) {
    const count = await tx.manufacturingDamage.count();
    const year = new Date().getFullYear().toString().slice(-2);
    return `MDMG-${year}-${String(count + 1).padStart(5, '0')}`;
  }

  async generateTradingSerial(tx = prisma) {
    const count = await tx.tradingDamage.count();
    const year = new Date().getFullYear().toString().slice(-2);
    return `TDMG-${year}-${String(count + 1).padStart(5, '0')}`;
  }

  async createManufacturingDamage(data, userId) {
    const rawLines = normalizeInputLines(data.lines);

    return withTransaction(async (tx) => {
      const resolvedLines = await resolveManufacturingLines(rawLines, tx);
      await validateResolvedManufacturingLines(resolvedLines, tx);

      const serialNumber = data.serialNumber || (await this.generateManufacturingSerial(tx));
      const totalLoss = sumTotalLoss(resolvedLines);

      const damage = await tx.manufacturingDamage.create({
        data: {
          serialNumber,
          date: new Date(data.date),
          totalLoss,
          createdById: userId,
          lines: {
            create: resolvedLines.map(mapMfgLineToDb),
          },
        },
        include: mfgDamageInclude,
      });

      for (const line of resolvedLines) {
        await damagesInventoryService.recordManufacturingLine(line, damage, userId, tx);
      }

      await accountingService.recordManufacturingDamage(damage, tx);
      return damage;
    });
  }

  async getManufacturingDamages({ search, startDate, endDate, inventoryType, page = 1, limit = 10 }) {
    const date = buildDateRange(startDate, endDate);
    const where = buildListFilter({
      ...buildSearchFilter(search, ['serialNumber']),
      ...(date ? { date } : {}),
      ...(inventoryType ? { lines: { some: { inventoryType } } } : {}),
    });

    const skip = (page - 1) * limit;
    const [damages, total] = await Promise.all([
      prisma.manufacturingDamage.findMany({
        where,
        include: mfgDamageInclude,
        orderBy: { date: 'desc' },
        skip,
        take: limit,
      }),
      prisma.manufacturingDamage.count({ where }),
    ]);

    return { damages, total };
  }

  async updateManufacturingDamage(id, data, userId) {
    const rawLines = normalizeInputLines(data.lines);

    return withTransaction(async (tx) => {
      const existing = await tx.manufacturingDamage.findUnique({
        where: { id },
        include: { lines: true },
      });
      assertNotDeleted(existing, 'Manufacturing damage entry');

      const resolvedLines = await resolveManufacturingLines(rawLines, tx);
      await validateResolvedManufacturingLines(resolvedLines, tx, {
        referenceType: 'ManufacturingDamage',
        referenceId: id,
        previousLines: existing.lines,
      });

      await damagesInventoryService.restoreManufacturingLines(existing.lines, tx);
      await accountingService.deleteLedgerEntriesByReference('ManufacturingDamage', id, tx);
      await inventoryService.deleteMovementsByReference('ManufacturingDamage', id, tx, {
        skipValidation: true,
      });

      const totalLoss = sumTotalLoss(resolvedLines);

      await tx.manufacturingDamageLine.deleteMany({ where: { damageId: id } });

      const damage = await tx.manufacturingDamage.update({
        where: { id },
        data: {
          date: new Date(data.date),
          totalLoss,
          lines: {
            create: resolvedLines.map(mapMfgLineToDb),
          },
        },
        include: mfgDamageInclude,
      });

      for (const line of resolvedLines) {
        await damagesInventoryService.recordManufacturingLine(
          line,
          damage,
          existing.createdById || userId,
          tx
        );
      }

      await accountingService.recordManufacturingDamage(damage, tx);
      return damage;
    });
  }

  async deleteManufacturingDamage(id, userId, deleteReason) {
    return withTransaction(async (tx) => {
      const existing = await tx.manufacturingDamage.findUnique({
        where: { id },
        include: { lines: true },
      });
      assertNotDeleted(existing, 'Manufacturing damage entry');

      await inventoryService.validateDeleteMovementsByReference('ManufacturingDamage', id, tx);
      await damagesInventoryService.restoreManufacturingLines(existing.lines, tx);
      await accountingService.deleteLedgerEntriesByReference('ManufacturingDamage', id, tx);
      await inventoryService.deleteMovementsByReference('ManufacturingDamage', id, tx);
      await tx.manufacturingDamage.update({
        where: { id },
        data: softDeletePayload(userId, deleteReason),
      });
    });
  }

  async restoreManufacturingDamage(id, userId) {
    return withTransaction(async (tx) => {
      const existing = await tx.manufacturingDamage.findUnique({
        where: { id },
        include: { lines: true },
      });
      assertIsDeleted(existing, 'Manufacturing damage entry');

      await validateResolvedManufacturingLines(existing.lines, tx);
      const restored = await tx.manufacturingDamage.update({
        where: { id },
        data: restorePayload(),
        include: mfgDamageInclude,
      });

      for (const line of existing.lines) {
        await damagesInventoryService.recordManufacturingLine(
          line,
          restored,
          existing.createdById || userId,
          tx
        );
      }

      await accountingService.recordManufacturingDamage(restored, tx);
      return restored;
    });
  }

  async createTradingDamage(data, userId) {
    const rawLines = normalizeInputLines(data.lines);

    return withTransaction(async (tx) => {
      const resolvedLines = await resolveTradingLines(rawLines, tx);
      await validateResolvedTradingLines(resolvedLines, tx);

      const serialNumber = data.serialNumber || (await this.generateTradingSerial(tx));
      const totalLoss = sumTotalLoss(resolvedLines);

      const damage = await tx.tradingDamage.create({
        data: {
          serialNumber,
          date: new Date(data.date),
          totalLoss,
          createdById: userId,
          lines: {
            create: resolvedLines.map(mapTradingLineToDb),
          },
        },
        include: tradingDamageInclude,
      });

      for (const line of resolvedLines) {
        await damagesInventoryService.recordTradingLine(line, damage, userId, tx);
      }

      await accountingService.recordTradingDamage(damage, tx);
      return damage;
    });
  }

  async getTradingDamages({ search, startDate, endDate, itemId, page = 1, limit = 10 }) {
    const date = buildDateRange(startDate, endDate);
    const where = buildListFilter({
      ...buildSearchFilter(search, ['serialNumber']),
      ...(date ? { date } : {}),
      ...(itemId ? { lines: { some: { itemId } } } : {}),
    });

    const skip = (page - 1) * limit;
    const [damages, total] = await Promise.all([
      prisma.tradingDamage.findMany({
        where,
        include: tradingDamageInclude,
        orderBy: { date: 'desc' },
        skip,
        take: limit,
      }),
      prisma.tradingDamage.count({ where }),
    ]);

    return { damages, total };
  }

  async updateTradingDamage(id, data, userId) {
    const rawLines = normalizeInputLines(data.lines);

    return withTransaction(async (tx) => {
      const existing = await tx.tradingDamage.findUnique({
        where: { id },
        include: { lines: true },
      });
      assertNotDeleted(existing, 'Trading damage entry');

      const resolvedLines = await resolveTradingLines(rawLines, tx);
      await validateResolvedTradingLines(resolvedLines, tx, {
        referenceType: 'TradingDamage',
        referenceId: id,
        previousLines: existing.lines,
      });

      await accountingService.deleteLedgerEntriesByReference('TradingDamage', id, tx);
      await inventoryService.deleteMovementsByReference('TradingDamage', id, tx, {
        skipValidation: true,
      });

      const totalLoss = sumTotalLoss(resolvedLines);

      await tx.tradingDamageLine.deleteMany({ where: { damageId: id } });

      const damage = await tx.tradingDamage.update({
        where: { id },
        data: {
          date: new Date(data.date),
          totalLoss,
          lines: {
            create: resolvedLines.map(mapTradingLineToDb),
          },
        },
        include: tradingDamageInclude,
      });

      for (const line of resolvedLines) {
        await damagesInventoryService.recordTradingLine(
          line,
          damage,
          existing.createdById || userId,
          tx
        );
      }

      await accountingService.recordTradingDamage(damage, tx);
      return damage;
    });
  }

  async deleteTradingDamage(id, userId, deleteReason) {
    return withTransaction(async (tx) => {
      const existing = await tx.tradingDamage.findUnique({
        where: { id },
        include: { lines: true },
      });
      assertNotDeleted(existing, 'Trading damage entry');

      await inventoryService.validateDeleteMovementsByReference('TradingDamage', id, tx);
      await accountingService.deleteLedgerEntriesByReference('TradingDamage', id, tx);
      await inventoryService.deleteMovementsByReference('TradingDamage', id, tx);
      await tx.tradingDamage.update({
        where: { id },
        data: softDeletePayload(userId, deleteReason),
      });
    });
  }

  async restoreTradingDamage(id, userId) {
    return withTransaction(async (tx) => {
      const existing = await tx.tradingDamage.findUnique({
        where: { id },
        include: { lines: true },
      });
      assertIsDeleted(existing, 'Trading damage entry');

      await validateResolvedTradingLines(existing.lines, tx);
      const restored = await tx.tradingDamage.update({
        where: { id },
        data: restorePayload(),
        include: tradingDamageInclude,
      });

      for (const line of existing.lines) {
        await damagesInventoryService.recordTradingLine(
          line,
          restored,
          existing.createdById || userId,
          tx
        );
      }

      await accountingService.recordTradingDamage(restored, tx);
      return restored;
    });
  }

  async getManufacturingDamageReport(startDate, endDate, inventoryType) {
    const dateFilter = { gte: startDate, lte: endDate };
    const damages = await prisma.manufacturingDamage.findMany({
      where: buildListFilter({
        date: dateFilter,
        ...(inventoryType ? { lines: { some: { inventoryType } } } : {}),
      }),
      include: {
        lines: true,
        createdBy: { select: { name: true } },
      },
      orderBy: { date: 'desc' },
    });

    const rows = [];
    for (const damage of damages) {
      for (const line of damage.lines) {
        if (inventoryType && line.inventoryType !== inventoryType) continue;
        const scope =
          line.batchNumber ||
          (line.lotNumber
            ? `${line.lotNumber} (${INVENTORY_TYPE_LABELS[line.inventoryType]})`
            : INVENTORY_TYPE_LABELS[line.inventoryType]);
        rows.push({
          date: damage.date,
          serialNumber: damage.serialNumber,
          item: scope,
          inventoryType: line.inventoryType,
          lotNumber: line.lotNumber,
          batchNumber: line.batchNumber,
          quantity: line.quantity,
          costPerKg: line.costPerKg,
          lossAmount: line.lossAmount,
          reason: line.reason,
          totalLoss: damage.totalLoss,
          createdBy: damage.createdBy?.name || '-',
        });
      }
    }

    const totalLoss = rows.reduce((sum, row) => sum + row.lossAmount, 0);
    const totalQuantity = rows.reduce((sum, row) => sum + row.quantity, 0);

    return { rows, summary: { count: rows.length, totalLoss, totalQuantity } };
  }

  async getTradingDamageReport(startDate, endDate, itemId) {
    const dateFilter = { gte: startDate, lte: endDate };
    const damages = await prisma.tradingDamage.findMany({
      where: buildListFilter({
        date: dateFilter,
        ...(itemId ? { lines: { some: { itemId } } } : {}),
      }),
      include: {
        lines: { include: { item: { select: { name: true } } } },
        createdBy: { select: { name: true } },
      },
      orderBy: { date: 'desc' },
    });

    const rows = [];
    for (const damage of damages) {
      for (const line of damage.lines) {
        if (itemId && line.itemId !== itemId) continue;
        rows.push({
          date: damage.date,
          serialNumber: damage.serialNumber,
          item: line.item?.name || '-',
          itemId: line.itemId,
          quantity: line.quantity,
          costPerUnit: line.costPerUnit,
          lossAmount: line.lossAmount,
          reason: line.reason,
          totalLoss: damage.totalLoss,
          createdBy: damage.createdBy?.name || '-',
        });
      }
    }

    const totalLoss = rows.reduce((sum, row) => sum + row.lossAmount, 0);
    const totalQuantity = rows.reduce((sum, row) => sum + row.quantity, 0);

    return { rows, summary: { count: rows.length, totalLoss, totalQuantity } };
  }

  async getDamageDashboardMetrics() {
    const fy = getFinancialYear();
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart);
    todayEnd.setHours(23, 59, 59, 999);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      mfgToday,
      mfgMonth,
      tradingToday,
      tradingMonth,
      mfgFyLoss,
      tradingFyLoss,
    ] = await Promise.all([
      prisma.manufacturingDamage.aggregate({
        where: { ...ACTIVE_ONLY, date: { gte: todayStart, lte: todayEnd } },
        _sum: { totalLoss: true },
        _count: true,
      }),
      prisma.manufacturingDamage.aggregate({
        where: { ...ACTIVE_ONLY, date: { gte: monthStart, lte: todayEnd } },
        _sum: { totalLoss: true },
        _count: true,
      }),
      prisma.tradingDamage.aggregate({
        where: { ...ACTIVE_ONLY, date: { gte: todayStart, lte: todayEnd } },
        _sum: { totalLoss: true },
        _count: true,
      }),
      prisma.tradingDamage.aggregate({
        where: { ...ACTIVE_ONLY, date: { gte: monthStart, lte: todayEnd } },
        _sum: { totalLoss: true },
        _count: true,
      }),
      prisma.manufacturingDamage.aggregate({
        where: { ...ACTIVE_ONLY, date: { gte: fy.start, lte: fy.end } },
        _sum: { totalLoss: true },
      }),
      prisma.tradingDamage.aggregate({
        where: { ...ACTIVE_ONLY, date: { gte: fy.start, lte: fy.end } },
        _sum: { totalLoss: true },
      }),
    ]);

    const mfgTodayLoss = mfgToday._sum.totalLoss || 0;
    const mfgMonthLoss = mfgMonth._sum.totalLoss || 0;
    const tradingTodayLoss = tradingToday._sum.totalLoss || 0;
    const tradingMonthLoss = tradingMonth._sum.totalLoss || 0;
    const totalDamageLoss =
      (mfgFyLoss._sum.totalLoss || 0) + (tradingFyLoss._sum.totalLoss || 0);

    return {
      manufacturingDamageToday: mfgTodayLoss,
      manufacturingDamageThisMonth: mfgMonthLoss,
      tradingDamageToday: tradingTodayLoss,
      tradingDamageThisMonth: tradingMonthLoss,
      totalDamageLoss,
      manufacturingDamageTodayCount: mfgToday._count,
      manufacturingDamageMonthCount: mfgMonth._count,
      tradingDamageTodayCount: tradingToday._count,
      tradingDamageMonthCount: tradingMonth._count,
    };
  }

  async getTotalDamageLoss(startDate, endDate) {
    const dateFilter = { gte: startDate, lte: endDate };
    const [mfg, trading] = await Promise.all([
      prisma.manufacturingDamage.aggregate({
        where: { ...ACTIVE_ONLY, date: dateFilter },
        _sum: { totalLoss: true },
      }),
      prisma.tradingDamage.aggregate({
        where: { ...ACTIVE_ONLY, date: dateFilter },
        _sum: { totalLoss: true },
      }),
    ]);
    return (mfg._sum.totalLoss || 0) + (trading._sum.totalLoss || 0);
  }
}

export default new DamagesService();

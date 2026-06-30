import { prisma } from '../../config/db.js';
import { STOCK_CATEGORIES } from '../../shared/constants/index.js';
import AppError from '../../shared/utils/AppError.js';
import { toDateTime } from '../../shared/utils/helpers.js';
import { endOfDay } from '../../shared/utils/stockDates.js';
import { buildSearchFilter } from '../../shared/utils/query.js';
import auditService from '../../shared/services/auditService.js';

const db = (tx) => tx ?? prisma;

const roundScopeTotal = (scopes) =>
  Math.round(scopes.reduce((sum, s) => sum + (s.balance || 0), 0) * 100) / 100;

const scopeWhere = (category, { lotNumber = null, item = null, batchId = null, brandId = null } = {}) => {
  const where = { category };
  if (brandId) {
    where.brandId = String(brandId);
  } else if (item) {
    where.itemId = String(item);
  }
  if (batchId) {
    where.batchId = String(batchId);
  } else if (lotNumber) {
    where.lotNumber = lotNumber;
  } else if (!item && !brandId) {
    where.OR = [{ lotNumber: null }, { lotNumber: '' }];
  }
  return where;
};

class InventoryRepository {
  async getCurrentBalance(category, { item = null, lotNumber = null, batchId = null, brandId = null } = {}, tx = null) {
    const client = db(tx);
    const where = { category };
    if (brandId) {
      where.brandId = String(brandId);
    } else if (item) {
      where.itemId = String(item);
    }
    if (batchId) {
      where.batchId = String(batchId);
    } else if (lotNumber) {
      where.lotNumber = lotNumber;
    }

    const lastEntry = await client.stockLedger.findFirst({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return lastEntry?.balanceAfter ?? 0;
  }

  async getBalanceByLot(lotNumber, category, tx = null) {
    return this.getCurrentBalance(category, { lotNumber }, tx);
  }

  async getReferenceOutboundQuantity(referenceType, referenceId, category, scope = {}, tx = null) {
    const client = db(tx);
    const where = {
      referenceType,
      referenceId: String(referenceId),
      category,
      direction: 'out',
    };
    if (scope.item) where.itemId = String(scope.item);
    if (scope.brandId) where.brandId = String(scope.brandId);
    if (scope.lotNumber) where.lotNumber = scope.lotNumber;

    const entries = await client.stockLedger.findMany({ where });
    return entries.reduce((sum, entry) => sum + entry.quantity, 0);
  }

  async createMovement(
    {
      category,
      item = null,
      brandId = null,
      lotNumber = null,
      batchId = null,
      movementType,
      quantity,
      direction,
      referenceType,
      referenceId,
      date,
      createdBy,
    },
    tx = null
  ) {
    if (quantity <= 0) {
      throw new AppError('Quantity must be greater than zero', 400);
    }

    const currentBalance = await this.getCurrentBalance(
      category,
      { item, lotNumber, batchId, brandId },
      tx
    );

    let balanceAfter;
    if (direction === 'in') {
      balanceAfter = currentBalance + quantity;
    } else {
      if (currentBalance < quantity) {
        throw new AppError(
          `Insufficient stock in ${category}. Available: ${currentBalance}, Required: ${quantity}`,
          400
        );
      }
      balanceAfter = currentBalance - quantity;
    }

    const client = db(tx);
    const createdById = createdBy?.id ?? createdBy?._id ?? createdBy ?? null;

    const entry = await client.stockLedger.create({
      data: {
        category,
        itemId: item ? String(item) : null,
        brandId: brandId ? String(brandId) : null,
        lotNumber: lotNumber || null,
        batchId: batchId ? String(batchId) : null,
        movementType,
        quantity,
        direction,
        balanceAfter,
        referenceType,
        referenceId: String(referenceId),
        date: toDateTime(date),
        createdById,
      },
    });

    auditService.logInventory({
      userId: createdById,
      sourceModule: referenceType || 'Inventory',
      stockType: category,
      quantityBefore: currentBalance,
      quantityChanged: direction === 'in' ? quantity : -quantity,
      quantityAfter: balanceAfter,
      referenceType,
      referenceId,
    }).catch(() => {});

    return entry;
  }

  async recalculateScope(category, scope = {}, tx = null) {
    const client = db(tx);
    const entries = await client.stockLedger.findMany({
      where: scopeWhere(category, scope),
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    let balance = 0;
    for (const entry of entries) {
      balance = entry.direction === 'in'
        ? balance + entry.quantity
        : balance - entry.quantity;
      if (entry.balanceAfter !== balance) {
        await client.stockLedger.update({
          where: { id: entry.id },
          data: { balanceAfter: balance },
        });
      }
    }
    return balance;
  }

  collectScopes(entries) {
    const scopes = new Map();
    for (const entry of entries) {
      const key = JSON.stringify({
        category: entry.category,
        lotNumber: entry.lotNumber || null,
        item: entry.itemId ? String(entry.itemId) : null,
        batchId: entry.batchId ? String(entry.batchId) : null,
        brandId: entry.brandId ? String(entry.brandId) : null,
      });
      scopes.set(key, {
        category: entry.category,
        lotNumber: entry.lotNumber || null,
        item: entry.itemId || null,
        batchId: entry.batchId || null,
        brandId: entry.brandId || null,
      });
    }
    return [...scopes.values()];
  }

  scopeEffectKey(category, { lotNumber = null, item = null, batchId = null, brandId = null } = {}) {
    return JSON.stringify({
      category,
      lotNumber: lotNumber || null,
      item: item ? String(item) : null,
      batchId: batchId ? String(batchId) : null,
      brandId: brandId ? String(brandId) : null,
    });
  }

  parseScopeEffectKey(key) {
    return JSON.parse(key);
  }

  async getReferenceScopeNetEffects(referenceType, referenceId, tx = null) {
    const client = db(tx);
    const entries = await client.stockLedger.findMany({
      where: {
        referenceType,
        referenceId: String(referenceId),
      },
    });

    const effects = new Map();
    for (const entry of entries) {
      const key = this.scopeEffectKey(entry.category, {
        lotNumber: entry.lotNumber,
        item: entry.itemId,
        batchId: entry.batchId,
        brandId: entry.brandId,
      });
      const delta = entry.direction === 'in' ? entry.quantity : -entry.quantity;
      effects.set(key, Math.round(((effects.get(key) || 0) + delta) * 100) / 100);
    }
    return effects;
  }

  async validateReplaceReferenceStock(referenceType, referenceId, newEffectsMap, tx = null, context = {}) {
    const oldEffects = await this.getReferenceScopeNetEffects(referenceType, referenceId, tx);
    const allKeys = new Set([...oldEffects.keys(), ...newEffectsMap.keys()]);

    for (const key of allKeys) {
      const scope = this.parseScopeEffectKey(key);
      const current = await this.getCurrentBalance(scope.category, scope, tx);
      const oldNet = oldEffects.get(key) || 0;
      const newNet = newEffectsMap.has(key) ? newEffectsMap.get(key) : 0;
      const projected = Math.round((current - oldNet + newNet) * 100) / 100;

      if (projected < 0) {
        throw new AppError(
          this.buildEditStockErrorMessage(scope, { current, oldNet, newNet, projected, context }),
          400
        );
      }
    }
  }

  buildEditStockErrorMessage(scope, { current, oldNet, newNet, projected, context }) {
    const label = context.label || scope.category.replace(/_/g, ' ');
    const lotLabel = scope.lotNumber ? ` lot ${scope.lotNumber}` : '';
    const deficit = Math.round(Math.abs(projected) * 100) / 100;

    if (oldNet > 0 && newNet < oldNet) {
      const consumed = Math.round(Math.max(0, oldNet - current) * 100) / 100;
      if (consumed > 0) {
        return `Cannot reduce ${label}${lotLabel} quantity below consumed quantity. ${consumed} kg has already been consumed from this lot.`;
      }
      return `Cannot reduce ${label}${lotLabel} quantity. Resulting stock would be ${projected} kg.`;
    }

    if (oldNet < 0 && newNet < oldNet) {
      return `Insufficient ${label}${lotLabel} stock for this change. Available after reversing original entry: ${Math.round((current + Math.abs(oldNet)) * 100) / 100} kg, additional required: ${deficit} kg.`;
    }

    if (newNet < 0) {
      return `Insufficient ${label}${lotLabel} stock. Available after edit: ${projected} kg (short by ${deficit} kg).`;
    }

    return `Cannot modify entry: ${label}${lotLabel} stock would become negative (${projected} kg).`;
  }

  async computeScopeBalanceAfterRemovingReference(
    category,
    scope,
    referenceType,
    referenceId,
    tx = null
  ) {
    const client = db(tx);
    const allEntries = await client.stockLedger.findMany({
      where: scopeWhere(category, scope),
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    const refIdStr = String(referenceId);
    let balance = 0;
    for (const entry of allEntries) {
      if (
        entry.referenceType === referenceType &&
        entry.referenceId === refIdStr
      ) {
        continue;
      }
      balance =
        entry.direction === 'in'
          ? balance + entry.quantity
          : balance - entry.quantity;
    }
    return balance;
  }

  async validateDeleteMovementsByReference(referenceType, referenceId, tx = null) {
    const client = db(tx);
    const entries = await client.stockLedger.findMany({
      where: {
        referenceType,
        referenceId: String(referenceId),
      },
    });

    if (entries.length === 0) return;

    const scopes = this.collectScopes(entries);
    for (const scope of scopes) {
      const balance = await this.computeScopeBalanceAfterRemovingReference(
        scope.category,
        scope,
        referenceType,
        referenceId,
        tx
      );
      if (balance < 0) {
        throw new AppError(
          `Cannot modify entry: ${scope.category} stock would become negative (${balance})`,
          400
        );
      }
    }
  }

  async deleteMovementsByReference(referenceType, referenceId, tx = null, options = {}) {
    const { skipValidation = false } = options;
    const client = db(tx);
    const entries = await client.stockLedger.findMany({
      where: {
        referenceType,
        referenceId: String(referenceId),
      },
    });

    if (entries.length === 0) return [];

    if (!skipValidation) {
      await this.validateDeleteMovementsByReference(referenceType, referenceId, tx);
    }

    const scopes = this.collectScopes(entries);
    await client.stockLedger.deleteMany({
      where: {
        referenceType,
        referenceId: String(referenceId),
      },
    });

    for (const scope of scopes) {
      await this.recalculateScope(scope.category, scope, tx);
    }

    return scopes;
  }

  /**
   * Latest balanceAfter per lot/item scope from StockLedger (all movement types:
   * purchases, production, machine, sales, damages, adjustments) on or before asOfDate.
   */
  async getLatestScopeBalancesAsOf(category, asOfDate, tx = null) {
    const client = db(tx);
    const end = endOfDay(asOfDate);
    const rows = await client.$queryRaw`
      SELECT DISTINCT ON (
        COALESCE("lotNumber", ''),
        COALESCE("itemId", '')
      )
        COALESCE("itemId", '') AS "itemId",
        COALESCE("lotNumber", '') AS "lotNumber",
        "balanceAfter"::float AS balance
      FROM "StockLedger"
      WHERE category = ${category}::"StockCategory"
        AND date <= ${end}
      ORDER BY
        COALESCE("lotNumber", ''),
        COALESCE("itemId", ''),
        date DESC,
        "createdAt" DESC,
        id DESC
    `;
    return rows.map((row) => ({
      itemId: row.itemId || null,
      lotNumber: row.lotNumber || null,
      balance: Number(row.balance ?? 0),
    }));
  }

  async getCategoryQuantityAsOf(category, asOfDate, tx = null) {
    const scopes = await this.getLatestScopeBalancesAsOf(category, asOfDate, tx);
    return roundScopeTotal(scopes);
  }

  async getTradingItemBalancesAsOf(asOfDate, tx = null) {
    const scopes = await this.getLatestScopeBalancesAsOf(
      STOCK_CATEGORIES.TRADING,
      asOfDate,
      tx
    );
    const byItem = new Map();
    for (const scope of scopes) {
      if (!scope.itemId) continue;
      const key = String(scope.itemId);
      byItem.set(key, (byItem.get(key) || 0) + scope.balance);
    }
    return [...byItem.entries()].map(([itemId, quantity]) => ({
      itemId,
      quantity: roundScopeTotal([{ balance: quantity }]),
    })).filter((row) => row.quantity !== 0);
  }

  /** @deprecated Use getCategoryQuantityAsOf — kept for compatibility */
  async getTotalCategoryBalanceAsOf(category, asOfDate, tx = null) {
    return this.getCategoryQuantityAsOf(category, asOfDate, tx);
  }

  async getTradingStockQuantityAsOf(asOfDate, tx = null) {
    const items = await this.getTradingItemBalancesAsOf(asOfDate, tx);
    return items.reduce((sum, row) => sum + row.quantity, 0);
  }

  async getTotalCategoryBalance(category, tx = null) {
    if (category === STOCK_CATEGORIES.BRANDED_GOODS) {
      const rows = await this.getBrandedStockSummary(tx);
      return rows.reduce((sum, row) => sum + row.balance, 0);
    }

    const client = db(tx);
    const rows = await client.$queryRaw`
      SELECT COALESCE(SUM(latest."balanceAfter"), 0)::float AS total
      FROM (
        SELECT DISTINCT ON (
          COALESCE("lotNumber", ''),
          COALESCE("itemId", '')
        )
          "balanceAfter"
        FROM "StockLedger"
        WHERE category = ${category}::"StockCategory"
        ORDER BY
          COALESCE("lotNumber", ''),
          COALESCE("itemId", ''),
          "createdAt" DESC,
          id DESC
      ) AS latest
    `;
    return Number(rows[0]?.total ?? 0);
  }

  async getLotsWithBalance(category, tx = null) {
    const client = db(tx);
    const rows = await client.$queryRaw`
      SELECT DISTINCT "lotNumber"
      FROM "StockLedger"
      WHERE category = ${category}::"StockCategory"
        AND "lotNumber" IS NOT NULL
        AND "lotNumber" <> ''
    `;

    const lots = [];
    for (const row of rows) {
      const lotNumber = row.lotNumber;
      const balance = await this.getCurrentBalance(category, { lotNumber }, tx);
      if (balance > 0) {
        lots.push({ lotNumber, balance });
      }
    }
    return lots.sort((a, b) => a.lotNumber.localeCompare(b.lotNumber));
  }

  async deductFromLotsFIFO(category, quantity, movementBase, tx = null) {
    const lots = await this.getLotsWithBalance(category, tx);
    const totalAvailable = lots.reduce((sum, lot) => sum + lot.balance, 0);

    if (totalAvailable < quantity) {
      throw new AppError(
        `Insufficient stock in ${category}. Available: ${totalAvailable}, Required: ${quantity}`,
        400
      );
    }

    let remaining = quantity;
    const entries = [];

    for (const lot of lots) {
      if (remaining <= 0) break;
      const deductQty = Math.min(remaining, lot.balance);
      const entry = await this.createMovement(
        {
          ...movementBase,
          category,
          lotNumber: lot.lotNumber,
          quantity: deductQty,
        },
        tx
      );
      entries.push(entry);
      remaining -= deductQty;
    }

    return entries;
  }

  async deductFromBatchesFIFO(allocations, movementBase, tx = null) {
    const entries = [];
    for (const alloc of allocations) {
      const entry = await this.createMovement(
        {
          ...movementBase,
          category: STOCK_CATEGORIES.FINISHED_GOODS,
          lotNumber: alloc.lotNumber || null,
          batchId: alloc.batchId,
          quantity: alloc.quantity,
        },
        tx
      );
      entries.push(entry);
    }
    return entries;
  }

  async getFinishedGoodsTotalFromBatches(tx = null) {
    const client = db(tx);
    const agg = await client.finishedProduction.aggregate({
      _sum: { remainingQuantity: true },
    });
    return Number(agg._sum.remainingQuantity ?? 0);
  }

  async getLatestBatchBalancesAsOf(asOfDate, tx = null) {
    const client = db(tx);
    const end = endOfDay(asOfDate);
    const rows = await client.$queryRaw`
      SELECT DISTINCT ON ("batchId")
        "batchId",
        "balanceAfter"::float AS balance
      FROM "StockLedger"
      WHERE category = ${STOCK_CATEGORIES.FINISHED_GOODS}::"StockCategory"
        AND "batchId" IS NOT NULL
        AND date <= ${end}
      ORDER BY "batchId", date DESC, "createdAt" DESC, id DESC
    `;
    return rows
      .map((row) => ({
        batchId: row.batchId,
        balance: Number(row.balance ?? 0),
      }))
      .filter((row) => row.balance > 0);
  }

  async getScopeBalance(category, { lotNumber = null, item = null, batchId = null } = {}, tx = null) {
    const client = db(tx);
    const where = scopeWhere(category, { lotNumber, item, batchId });

    const lastEntry = await client.stockLedger.findFirst({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return lastEntry?.balanceAfter ?? 0;
  }

  async getAvailableWipLots(tx = null) {
    const lots = await this.getLotsWithBalance(STOCK_CATEGORIES.WIP, tx);
    const result = lots.map(({ lotNumber, balance }) => ({
      lotNumber,
      availableQty: balance,
    }));

    const unassigned = await this.getScopeBalance(STOCK_CATEGORIES.WIP, {}, tx);
    if (unassigned > 0) {
      result.unshift({
        lotNumber: '',
        availableQty: unassigned,
        label: 'Unassigned WIP',
      });
    }

    return result.sort((a, b) => {
      if (!a.lotNumber) return -1;
      if (!b.lotNumber) return 1;
      return a.lotNumber.localeCompare(b.lotNumber);
    });
  }

  async recalculateAllScopesForCategory(category, tx = null) {
    const client = db(tx);
    const rows = await client.$queryRaw`
      SELECT DISTINCT
        COALESCE("lotNumber", '') AS "lotNumber",
        COALESCE("itemId", '') AS "itemId"
      FROM "StockLedger"
      WHERE category = ${category}::"StockCategory"
    `;

    for (const row of rows) {
      await this.recalculateScope(
        category,
        {
          lotNumber: row.lotNumber || null,
          item: row.itemId || null,
        },
        tx
      );
    }
  }

  async getAvailableRawMaterialLots() {
    const rows = await prisma.$queryRaw`
      SELECT DISTINCT "lotNumber"
      FROM "StockLedger"
      WHERE category = ${STOCK_CATEGORIES.RAW_MATERIAL}::"StockCategory"
        AND "lotNumber" IS NOT NULL
        AND "lotNumber" <> ''
    `;

    const result = [];
    for (const row of rows) {
      const lotNumber = row.lotNumber;
      const availableQty = await this.getCurrentBalance(STOCK_CATEGORIES.RAW_MATERIAL, { lotNumber });
      if (availableQty > 0) {
        result.push({ lotNumber, availableQty });
      }
    }
    return result.sort((a, b) => a.lotNumber.localeCompare(b.lotNumber));
  }

  async getStockSummary() {
    const categories = Object.values(STOCK_CATEGORIES);
    const summary = {};

    for (const category of categories) {
      if (category === STOCK_CATEGORIES.BRANDED_GOODS) {
        // Packet balances are enriched in inventory.service.getStockSummary()
        continue;
      }
      if (category === STOCK_CATEGORIES.TRADING) {
        const tradingStock = await prisma.$queryRaw`
          SELECT DISTINCT ON ("itemId")
            "itemId" AS "_id",
            "balanceAfter" AS balance
          FROM "StockLedger"
          WHERE category = ${STOCK_CATEGORIES.TRADING}::"StockCategory"
            AND "itemId" IS NOT NULL
          ORDER BY "itemId", "createdAt" DESC, id DESC
        `;
        summary[category] = tradingStock.map((row) => ({
          _id: row._id,
          balance: Number(row.balance),
        }));
      } else if (category === STOCK_CATEGORIES.FINISHED_GOODS) {
        summary[category] = await this.getFinishedGoodsTotalFromBatches();
      } else {
        summary[category] = await this.getTotalCategoryBalance(category);
      }
    }

    return summary;
  }

  async getLotWiseStock(lotNumber) {
    const categories = [
      STOCK_CATEGORIES.RAW_MATERIAL,
      STOCK_CATEGORIES.WIP,
      STOCK_CATEGORIES.QUALITY_6NO,
      STOCK_CATEGORIES.QUALITY_5NO,
      STOCK_CATEGORIES.QUALITY_4_5NO,
      STOCK_CATEGORIES.QUALITY_4NO,
      STOCK_CATEGORIES.QUALITY_OTHERS,
    ];

    const result = {};
    for (const category of categories) {
      result[category] = await this.getCurrentBalance(category, { lotNumber });
    }
    return result;
  }

  async getLedgerEntries(filters = {}, pagination = {}) {
    const { category, item, lotNumber, movementType, direction, startDate, endDate, search } = filters;
    const { skip = 0, limit = 20 } = pagination;

    const where = {};
    if (category) where.category = category;
    if (item) where.itemId = String(item);
    if (lotNumber) where.lotNumber = lotNumber;
    if (movementType) where.movementType = movementType;
    if (direction) where.direction = direction;
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.date.lte = end;
      }
    }
    if (search) {
      Object.assign(where, buildSearchFilter(search, ['lotNumber', 'referenceType', 'referenceId']));
    }

    const [entries, total] = await Promise.all([
      prisma.stockLedger.findMany({
        where,
        include: {
          item: { select: { name: true, sku: true, unit: true } },
          brand: { select: { name: true, packetSizeGrams: true } },
          createdBy: { select: { name: true } },
        },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      prisma.stockLedger.count({ where }),
    ]);

    return { entries, total };
  }

  async getInventoryTrend(startDate, endDate) {
    const rows = await prisma.$queryRaw`
      SELECT
        EXTRACT(MONTH FROM date)::int AS month,
        EXTRACT(YEAR FROM date)::int AS year,
        category,
        COALESCE(SUM(CASE WHEN direction = 'in' THEN quantity ELSE 0 END), 0)::float AS "totalIn",
        COALESCE(SUM(CASE WHEN direction = 'out' THEN quantity ELSE 0 END), 0)::float AS "totalOut"
      FROM "StockLedger"
      WHERE date >= ${new Date(startDate)}
        AND date <= ${new Date(endDate)}
      GROUP BY year, month, category
      ORDER BY year, month
    `;

    return rows.map((row) => ({
      _id: {
        month: row.month,
        year: row.year,
        category: row.category,
      },
      totalIn: Number(row.totalIn),
      totalOut: Number(row.totalOut),
    }));
  }

  async getBrandedStockBalancesAsOf(asOfDate, tx = null) {
    const client = db(tx);
    const end = endOfDay(asOfDate);
    const rows = await client.$queryRaw`
      SELECT DISTINCT ON ("brandId")
        "brandId",
        "balanceAfter"::float AS balance
      FROM "StockLedger"
      WHERE category = ${STOCK_CATEGORIES.BRANDED_GOODS}::"StockCategory"
        AND "brandId" IS NOT NULL
        AND date <= ${end}
      ORDER BY "brandId", date DESC, "createdAt" DESC, id DESC
    `;
    return rows
      .map((row) => ({
        brandId: row.brandId,
        balance: Number(row.balance ?? 0),
      }))
      .filter((row) => row.balance > 0);
  }

  async getBrandedStockSummary(tx = null) {
    const client = db(tx);
    const rows = await client.$queryRaw`
      SELECT DISTINCT ON ("brandId")
        "brandId",
        "balanceAfter"::float AS balance
      FROM "StockLedger"
      WHERE category = ${STOCK_CATEGORIES.BRANDED_GOODS}::"StockCategory"
        AND "brandId" IS NOT NULL
      ORDER BY "brandId", "createdAt" DESC, id DESC
    `;
    return rows
      .map((row) => ({
        brandId: row.brandId,
        balance: Number(row.balance ?? 0),
      }))
      .filter((row) => row.balance > 0);
  }
}

export default new InventoryRepository();

























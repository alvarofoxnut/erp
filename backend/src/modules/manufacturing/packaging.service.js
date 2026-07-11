import { prisma } from '../../config/db.js';
import { withTransaction } from '../../shared/utils/transaction.js';
import { buildSearchFilter, buildDateRange } from '../../shared/utils/query.js';
import { endOfDay } from '../../shared/utils/stockDates.js';
import inventoryService from '../inventory/inventory.service.js';
import { STOCK_CATEGORIES } from '../../shared/constants/index.js';
import AppError from '../../shared/utils/AppError.js';
import { calculateBrandConsumption, validateBrandProportions } from '../../shared/utils/brandValidation.js';
import { validateOutboundCapacity } from '../inventory/stockValidation.js';
import {
  ACTIVE_ONLY,
  buildListFilter,
  softDeletePayload,
  restorePayload,
  assertNotDeleted,
  assertIsDeleted,
  softDeleteInvoice,
} from '../../shared/utils/softDelete.js';

const createdByInclude = {
  createdBy: { select: { id: true, name: true } },
};

const brandInclude = {
  brand: {
    select: {
      id: true,
      name: true,
      packetSizeGrams: true,
      packingWeightGrams: true,
      packagingPrice: true,
      proportion6No: true,
      proportion5No: true,
      proportion4_5No: true,
      proportion4No: true,
      proportionOthers: true,
    },
  },
  ...createdByInclude,
};

const round2 = (n) => Math.round((n || 0) * 100) / 100;
const sameQty = (a, b) => round2(a) === round2(b);

const QUALITY_LABELS = {
  [STOCK_CATEGORIES.QUALITY_6NO]: '6 No',
  [STOCK_CATEGORIES.QUALITY_5NO]: '5 No',
  [STOCK_CATEGORIES.QUALITY_4_5NO]: '4.5 No',
  [STOCK_CATEGORIES.QUALITY_4NO]: '4 No',
  [STOCK_CATEGORIES.QUALITY_OTHERS]: 'Others',
};

class PackagingService {
  async getBrandOrThrow(brandId, tx = prisma) {
    const brand = await tx.brand.findFirst({
      where: { ...ACTIVE_ONLY, id: brandId, isActive: true },
    });
    if (!brand) throw new AppError('Brand not found', 404);
    return brand;
  }

  async previewPackaging({ brandId, quantityPackedKg }) {
    const brand = await this.getBrandOrThrow(brandId);
    const calc = calculateBrandConsumption(brand, quantityPackedKg);
    return { brand, ...calc };
  }

  async validateLotStock(lotNumber, consumption, tx = null) {
    const scope = { lotNumber: lotNumber?.trim() };
    const checks = [
      { qty: consumption.consumed6No, category: STOCK_CATEGORIES.QUALITY_6NO },
      { qty: consumption.consumed5No, category: STOCK_CATEGORIES.QUALITY_5NO },
      { qty: consumption.consumed4_5No, category: STOCK_CATEGORIES.QUALITY_4_5NO },
      { qty: consumption.consumed4No, category: STOCK_CATEGORIES.QUALITY_4NO },
      { qty: consumption.consumedOthers, category: STOCK_CATEGORIES.QUALITY_OTHERS },
    ];

    for (const { qty, category } of checks) {
      if (qty <= 0) continue;
      try {
        await validateOutboundCapacity(category, scope, qty, tx, {
          label: QUALITY_LABELS[category],
        });
      } catch {
        throw new AppError(`Insufficient ${QUALITY_LABELS[category]} stock.`, 400);
      }
    }
  }

  async generatePackagingSerial(date, tx = prisma) {
    const year = new Date(date).getFullYear().toString().slice(-2);
    const prefix = `PKG-${year}-`;
    const count = await tx.packagingTransaction.count({
      where: { serialNumber: { startsWith: prefix } },
    });
    return `${prefix}${String(count + 1).padStart(5, '0')}`;
  }

  computeCostPerPacket(brand, finishedValue, packetsCreated) {
    const materialCostPerPacket =
      packetsCreated > 0 ? round2(finishedValue / packetsCreated) : 0;
    return round2(materialCostPerPacket + (brand.packagingPrice ?? 0));
  }

  async createPackaging(data, userId) {
    const lotNumber = data.lotNumber?.trim();
    if (!lotNumber) throw new AppError('Lot number is required', 400);

    return withTransaction(async (tx) => {
      const brand = await this.getBrandOrThrow(data.brandId, tx);
      const calc = calculateBrandConsumption(brand, data.quantityPackedKg);
      await this.validateLotStock(lotNumber, calc, tx);

      const { default: manufacturingService } = await import('./manufacturing.service.js');
      const lotStock = await manufacturingService.getLotQualityStock(lotNumber, tx);
      const { finishedValue } = manufacturingService.calculateFinishedGoodsPrice(
        calc,
        lotStock,
        calc.qualityConsumedKg
      );
      const costPerPacket = this.computeCostPerPacket(brand, finishedValue, calc.packetsCreated);

      const serialNumber = await this.generatePackagingSerial(data.date, tx);
      const transaction = await tx.packagingTransaction.create({
        data: {
          serialNumber,
          date: new Date(data.date),
          lotNumber,
          brandId: brand.id,
          quantityPackedKg: calc.quantityPackedKg,
          packetsCreated: calc.packetsCreated,
          consumed6No: calc.consumed6No,
          consumed5No: calc.consumed5No,
          consumed4_5No: calc.consumed4_5No,
          consumed4No: calc.consumed4No,
          consumedOthers: calc.consumedOthers,
          costPerPacket,
          remarks: data.remarks || null,
          createdById: userId,
        },
        include: brandInclude,
      });

      await inventoryService.recordBrandedPackaging(
        {
          lotNumber,
          brandId: brand.id,
          packetsCreated: calc.packetsCreated,
          consumed6No: calc.consumed6No,
          consumed5No: calc.consumed5No,
          consumed4_5No: calc.consumed4_5No,
          consumed4No: calc.consumed4No,
          consumedOthers: calc.consumedOthers,
          referenceId: transaction.id,
          date: data.date,
          createdBy: userId,
        },
        tx
      );

      return transaction;
    });
  }

  async getPackagingTransactions({
    search,
    startDate,
    endDate,
    lotNumber,
    brandId,
    page = 1,
    limit = 10,
    includeDeleted = false,
    deletedOnly = false,
  }) {
    const date = buildDateRange(startDate, endDate);
    const baseWhere = {
      ...buildSearchFilter(search, ['serialNumber', 'lotNumber', 'remarks']),
      ...(date ? { date } : {}),
      ...(lotNumber ? { lotNumber } : {}),
      ...(brandId ? { brandId } : {}),
    };
    const where = buildListFilter(baseWhere, { includeDeleted, deletedOnly });

    const skip = (page - 1) * limit;
    const [transactions, total] = await Promise.all([
      prisma.packagingTransaction.findMany({
        where,
        include: brandInclude,
        orderBy: { date: 'desc' },
        skip,
        take: limit,
      }),
      prisma.packagingTransaction.count({ where }),
    ]);

    return { transactions, total };
  }

  async updatePackaging(id, data) {
    const lotNumber = data.lotNumber?.trim();
    if (!lotNumber) throw new AppError('Lot number is required', 400);

    return withTransaction(async (tx) => {
      const existing = await tx.packagingTransaction.findUnique({ where: { id } });
      assertNotDeleted(existing, 'Packaging transaction');

      const brand = await this.getBrandOrThrow(data.brandId, tx);
      const calc = calculateBrandConsumption(brand, data.quantityPackedKg);

      const stockUnchanged =
        existing.lotNumber === lotNumber &&
        existing.brandId === brand.id &&
        sameQty(existing.quantityPackedKg, calc.quantityPackedKg);

      if (stockUnchanged) {
        return tx.packagingTransaction.update({
          where: { id },
          data: {
            date: new Date(data.date),
            remarks: data.remarks ?? null,
          },
          include: brandInclude,
        });
      }

      await inventoryService.validateDeleteMovementsByReference(
        'PackagingTransaction',
        existing.id,
        tx
      );
      await inventoryService.deleteMovementsByReference('PackagingTransaction', existing.id, tx, {
        skipValidation: true,
      });

      await this.validateLotStock(lotNumber, calc, tx);

      const { default: manufacturingService } = await import('./manufacturing.service.js');
      const lotStock = await manufacturingService.getLotQualityStock(lotNumber, tx);
      const { finishedValue } = manufacturingService.calculateFinishedGoodsPrice(
        calc,
        lotStock,
        calc.qualityConsumedKg
      );
      const costPerPacket = this.computeCostPerPacket(brand, finishedValue, calc.packetsCreated);

      const transaction = await tx.packagingTransaction.update({
        where: { id },
        data: {
          date: new Date(data.date),
          lotNumber,
          brandId: brand.id,
          quantityPackedKg: calc.quantityPackedKg,
          packetsCreated: calc.packetsCreated,
          consumed6No: calc.consumed6No,
          consumed5No: calc.consumed5No,
          consumed4_5No: calc.consumed4_5No,
          consumed4No: calc.consumed4No,
          consumedOthers: calc.consumedOthers,
          costPerPacket,
          remarks: data.remarks ?? null,
        },
        include: brandInclude,
      });

      await inventoryService.recordBrandedPackaging(
        {
          lotNumber,
          brandId: brand.id,
          packetsCreated: calc.packetsCreated,
          consumed6No: calc.consumed6No,
          consumed5No: calc.consumed5No,
          consumed4_5No: calc.consumed4_5No,
          consumed4No: calc.consumed4No,
          consumedOthers: calc.consumedOthers,
          referenceId: transaction.id,
          date: data.date,
          createdBy: existing.createdById,
        },
        tx
      );

      return transaction;
    });
  }

  async deletePackaging(id, userId, deleteReason) {
    return withTransaction(async (tx) => {
      const existing = await tx.packagingTransaction.findUnique({ where: { id } });
      assertNotDeleted(existing, 'Packaging transaction');

      await inventoryService.validateDeleteMovementsByReference(
        'PackagingTransaction',
        existing.id,
        tx
      );
      await inventoryService.deleteMovementsByReference('PackagingTransaction', existing.id, tx);
      return tx.packagingTransaction.update({
        where: { id },
        data: softDeletePayload(userId, deleteReason),
      });
    });
  }

  async restorePackaging(id, userId) {
    return withTransaction(async (tx) => {
      const existing = await tx.packagingTransaction.findUnique({ where: { id } });
      assertIsDeleted(existing, 'Packaging transaction');

      await this.validateLotStock(
        existing.lotNumber,
        {
          consumed6No: existing.consumed6No,
          consumed5No: existing.consumed5No,
          consumed4_5No: existing.consumed4_5No,
          consumed4No: existing.consumed4No,
          consumedOthers: existing.consumedOthers,
        },
        tx
      );

      const transaction = await tx.packagingTransaction.update({
        where: { id },
        data: restorePayload(),
        include: brandInclude,
      });

      await inventoryService.recordBrandedPackaging(
        {
          lotNumber: transaction.lotNumber,
          brandId: transaction.brandId,
          packetsCreated: transaction.packetsCreated,
          consumed6No: transaction.consumed6No,
          consumed5No: transaction.consumed5No,
          consumed4_5No: transaction.consumed4_5No,
          consumed4No: transaction.consumed4No,
          consumedOthers: transaction.consumedOthers,
          referenceId: transaction.id,
          date: transaction.date,
          createdBy: userId || transaction.createdById,
        },
        tx
      );

      return transaction;
    });
  }

  async getBrandedWeightedAvgCost(brandId, tx = null) {
    return this.getBrandedWeightedAvgCostAsOf(brandId, new Date(), tx);
  }

  async getBrandedWeightedAvgCostAsOf(brandId, asOfDate, tx = null) {
    const client = tx ?? prisma;
    const end = endOfDay(asOfDate);
    const rows = await client.packagingTransaction.findMany({
      where: { ...ACTIVE_ONLY, brandId, date: { lte: end } },
      select: { packetsCreated: true, costPerPacket: true },
    });
    const totalPackets = rows.reduce((s, r) => s + r.packetsCreated, 0);
    if (totalPackets <= 0) return 0;
    const totalCost = rows.reduce((s, r) => s + r.packetsCreated * r.costPerPacket, 0);
    return round2(totalCost / totalPackets);
  }
}

export { validateBrandProportions, calculateBrandConsumption };
export default new PackagingService();

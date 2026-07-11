import { prisma } from '../../config/db.js';
import { withTransaction } from '../../shared/utils/transaction.js';
import { buildSearchFilter, buildDateRange } from '../../shared/utils/query.js';
import inventoryService from '../inventory/inventory.service.js';
import inventoryRepository from '../inventory/inventory.repository.js';
import accountingService from '../accounting/accounting.service.js';
import { STOCK_CATEGORIES, PRODUCTION_MODES, MANUFACTURING_SALE_TYPES } from '../../shared/constants/index.js';
import AppError from '../../shared/utils/AppError.js';
import fifoAllocationService from '../inventory/fifoAllocation.service.js';
import packagingService from './packaging.service.js';
import { validateBrandProportions, calculateBrandedSalePackets } from '../../shared/utils/brandValidation.js';
import {
  ACTIVE_ONLY,
  buildListFilter,
  softDeletePayload,
  restorePayload,
  assertNotDeleted,
  assertIsDeleted,
  softDeleteInvoice,
} from '../../shared/utils/softDelete.js';
import {
  validateOutboundCapacity,
  validateWipOutbound,
  validateFinishedProductionStock,
  validateFinishedGoodsBatchCapacity,
  buildNetEffectsMap,
  netInbound,
  netOutbound,
} from '../inventory/stockValidation.js';

const createdByInclude = {
  createdBy: { select: { id: true, name: true } },
};

const rawPurchaseInclude = {
  vendor: { select: { id: true, name: true } },
  ...createdByInclude,
};

const QUALITY_LOT_CATEGORIES = [
  STOCK_CATEGORIES.QUALITY_6NO,
  STOCK_CATEGORIES.QUALITY_5NO,
  STOCK_CATEGORIES.QUALITY_4_5NO,
  STOCK_CATEGORIES.QUALITY_4NO,
  STOCK_CATEGORIES.QUALITY_OTHERS,
];

const round2 = (n) => Math.round((n || 0) * 100) / 100;

const sameQty = (a, b) => round2(a) === round2(b);
const sameLotNumber = (a, b) => (a || '').trim() === (b || '').trim();

function rawPurchaseEditEffects(existing, data) {
  const entries = [
    netInbound(STOCK_CATEGORIES.RAW_MATERIAL, { lotNumber: data.lotNumber }, data.quantity),
  ];
  if (!sameLotNumber(existing.lotNumber, data.lotNumber)) {
    entries.push(
      netInbound(STOCK_CATEGORIES.RAW_MATERIAL, { lotNumber: existing.lotNumber }, 0)
    );
  }
  return buildNetEffectsMap(entries);
}

function machineEntryEditEffects(existing, data) {
  const entries = [
    netOutbound(STOCK_CATEGORIES.RAW_MATERIAL, { lotNumber: data.lotNumber }, data.quantitySent),
    netInbound(STOCK_CATEGORIES.WIP, { lotNumber: data.lotNumber }, data.quantitySent),
  ];
  if (!sameLotNumber(existing.lotNumber, data.lotNumber)) {
    entries.push(
      netOutbound(STOCK_CATEGORIES.RAW_MATERIAL, { lotNumber: existing.lotNumber }, 0),
      netInbound(STOCK_CATEGORIES.WIP, { lotNumber: existing.lotNumber }, 0)
    );
  }
  return buildNetEffectsMap(entries);
}

function qualityProductionEditEffects(existing, lotNumber, data) {
  const totalOutput =
    data.quantity6No +
    data.quantity5No +
    data.quantity4_5No +
    data.quantity4No +
    data.quantityOthers;
  const entries = [netOutbound(STOCK_CATEGORIES.WIP, { lotNumber }, totalOutput)];
  const qualityLines = [
    { qty: data.quantity6No, category: STOCK_CATEGORIES.QUALITY_6NO },
    { qty: data.quantity5No, category: STOCK_CATEGORIES.QUALITY_5NO },
    { qty: data.quantity4_5No, category: STOCK_CATEGORIES.QUALITY_4_5NO },
    { qty: data.quantity4No, category: STOCK_CATEGORIES.QUALITY_4NO },
    { qty: data.quantityOthers, category: STOCK_CATEGORIES.QUALITY_OTHERS },
  ];
  for (const { qty, category } of qualityLines) {
    if (qty > 0) {
      entries.push(netInbound(category, { lotNumber }, qty));
    }
  }
  if (!sameLotNumber(existing.lotNumber, lotNumber)) {
    const oldLot = existing.lotNumber?.trim();
    entries.push(netOutbound(STOCK_CATEGORIES.WIP, { lotNumber: oldLot }, 0));
    for (const category of [
      STOCK_CATEGORIES.QUALITY_6NO,
      STOCK_CATEGORIES.QUALITY_5NO,
      STOCK_CATEGORIES.QUALITY_4_5NO,
      STOCK_CATEGORIES.QUALITY_4NO,
      STOCK_CATEGORIES.QUALITY_OTHERS,
    ]) {
      entries.push(netInbound(category, { lotNumber: oldLot }, 0));
    }
  }
  return buildNetEffectsMap(entries);
}

function finishedProductionEditEffects(existing, batchId, lotNumber, resolved, finishedQuantity) {
  const entries = [
    netInbound(
      STOCK_CATEGORIES.FINISHED_GOODS,
      { lotNumber, batchId },
      finishedQuantity
    ),
  ];
  const consumptions = [
    { qty: resolved.consumed6No, category: STOCK_CATEGORIES.QUALITY_6NO },
    { qty: resolved.consumed5No, category: STOCK_CATEGORIES.QUALITY_5NO },
    { qty: resolved.consumed4_5No, category: STOCK_CATEGORIES.QUALITY_4_5NO },
    { qty: resolved.consumed4No, category: STOCK_CATEGORIES.QUALITY_4NO },
    { qty: resolved.consumedOthers, category: STOCK_CATEGORIES.QUALITY_OTHERS },
  ];
  for (const { qty, category } of consumptions) {
    if (qty > 0) {
      entries.push(netOutbound(category, { lotNumber }, qty));
    }
  }
  if (!sameLotNumber(existing.lotNumber, lotNumber)) {
    const oldLot = existing.lotNumber?.trim();
    entries.push(
      netInbound(STOCK_CATEGORIES.FINISHED_GOODS, { lotNumber: oldLot, batchId }, 0)
    );
    for (const { category } of consumptions) {
      entries.push(netOutbound(category, { lotNumber: oldLot }, 0));
    }
  }
  return buildNetEffectsMap(entries);
}

/** Accounting helpers still expect Mongo-shaped reference fields */
function asAccountingDoc(doc) {
  return { ...doc, _id: doc.id, createdBy: doc.createdById };
}

function vendorIdFrom(data) {
  return data.vendor ?? data.vendorId;
}

class ManufacturingService {
  // Manufacturing Vendors (raw material suppliers — separate from trading parties)
  async getVendors({
    search,
    startDate,
    endDate,
    page = 1,
    limit = 10,
    includeDeleted = false,
    deletedOnly = false,
  }) {
    const createdAt = buildDateRange(startDate, endDate);
    const baseWhere = {
      isActive: true,
      ...buildSearchFilter(search, ['name', 'contactPerson', 'phone', 'email']),
      ...(createdAt ? { createdAt } : {}),
    };
    const where = buildListFilter(baseWhere, { includeDeleted, deletedOnly });

    const skip = (page - 1) * limit;
    const [vendors, total] = await Promise.all([
      prisma.manufacturingVendor.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
      prisma.manufacturingVendor.count({ where }),
    ]);
    return { vendors, total };
  }

  async createVendor(data, userId) {
    const name = data.name?.trim();
    if (!name) throw new AppError('Vendor name required', 400);

    const existing = await prisma.manufacturingVendor.findUnique({ where: { name } });
    if (existing) {
      if (existing.isActive) {
        throw new AppError('A vendor with this name already exists', 409);
      }
      return prisma.manufacturingVendor.update({
        where: { id: existing.id },
        data: {
          name,
          contactPerson: data.contactPerson,
          phone: data.phone,
          email: data.email,
          address: data.address,
          gstNumber: data.gstNumber,
          isActive: true,
        },
      });
    }

    return prisma.manufacturingVendor.create({
      data: { ...data, name, createdById: userId },
    });
  }

  async updateVendor(id, data) {
    const existing = await prisma.manufacturingVendor.findUnique({ where: { id } });
    assertNotDeleted(existing, 'Manufacturing vendor');
    try {
      return await prisma.manufacturingVendor.update({
        where: { id },
        data,
      });
    } catch (error) {
      if (error.code === 'P2025') throw new AppError('Manufacturing vendor not found', 404);
      throw error;
    }
  }

  async deleteVendor(id, userId, deleteReason) {
    const existing = await prisma.manufacturingVendor.findUnique({ where: { id } });
    assertNotDeleted(existing, 'Manufacturing vendor');
    try {
      return await prisma.manufacturingVendor.update({
        where: { id },
        data: softDeletePayload(userId, deleteReason, { deactivate: true }),
      });
    } catch (error) {
      if (error.code === 'P2025') throw new AppError('Manufacturing vendor not found', 404);
      throw error;
    }
  }

  async restoreVendor(id) {
    const existing = await prisma.manufacturingVendor.findUnique({ where: { id } });
    assertIsDeleted(existing, 'Manufacturing vendor');
    return prisma.manufacturingVendor.update({
      where: { id },
      data: restorePayload({ activate: true }),
    });
  }

  // Brand Master
  async getBrands({ search, page = 1, limit = 10, includeDeleted = false, deletedOnly = false }) {
    const baseWhere = {
      isActive: true,
      ...buildSearchFilter(search, ['name']),
    };
    const where = buildListFilter(baseWhere, { includeDeleted, deletedOnly });
    const skip = (page - 1) * limit;
    const [brands, total] = await Promise.all([
      prisma.brand.findMany({
        where,
        orderBy: [{ name: 'asc' }, { packetSizeGrams: 'asc' }],
        skip,
        take: limit,
      }),
      prisma.brand.count({ where }),
    ]);
    return { brands, total };
  }

  async getBrandOptions() {
    return prisma.brand.findMany({
      where: { ...ACTIVE_ONLY, isActive: true },
      orderBy: [{ name: 'asc' }, { packetSizeGrams: 'asc' }],
    });
  }

  async getBrandStock(brandId) {
    const brand = await prisma.brand.findFirst({
      where: { ...ACTIVE_ONLY, id: brandId, isActive: true },
    });
    if (!brand) throw new AppError('Brand not found', 404);
    const balance = await inventoryService.getBrandStockBalance(brandId);
    return { brand, balance };
  }

  async createBrand(data, userId) {
    const proportions = validateBrandProportions(data);
    try {
      return await prisma.brand.create({
        data: {
          name: data.name.trim(),
          ...proportions,
          createdById: userId,
        },
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new AppError('A brand with this name and packet size already exists', 400);
      }
      throw error;
    }
  }

  async updateBrand(id, data) {
    const existing = await prisma.brand.findUnique({ where: { id } });
    assertNotDeleted(existing, 'Brand');
    const proportions = validateBrandProportions(data);
    try {
      return await prisma.brand.update({
        where: { id },
        data: {
          name: data.name.trim(),
          ...proportions,
        },
      });
    } catch (error) {
      if (error.code === 'P2025') throw new AppError('Brand not found', 404);
      if (error.code === 'P2002') {
        throw new AppError('A brand with this name and packet size already exists', 400);
      }
      throw error;
    }
  }

  async deleteBrand(id, userId, deleteReason) {
    const existing = await prisma.brand.findUnique({ where: { id } });
    assertNotDeleted(existing, 'Brand');
    const stock = await inventoryService.getBrandStockBalance(id);
    if (stock > 0) {
      throw new AppError('Cannot deactivate brand with remaining stock', 400);
    }
    try {
      return await prisma.brand.update({
        where: { id },
        data: softDeletePayload(userId, deleteReason, { deactivate: true }),
      });
    } catch (error) {
      if (error.code === 'P2025') throw new AppError('Brand not found', 404);
      throw error;
    }
  }

  async restoreBrand(id) {
    const existing = await prisma.brand.findUnique({ where: { id } });
    assertIsDeleted(existing, 'Brand');
    return prisma.brand.update({
      where: { id },
      data: restorePayload({ activate: true }),
    });
  }

  // Raw Purchase
  async createRawPurchase(data, userId) {
    return withTransaction(async (tx) => {
      const totalAmount = data.quantity * data.purchaseRate;
      const purchase = await tx.rawPurchase.create({
        data: {
          vendorId: vendorIdFrom(data),
          lotNumber: data.lotNumber,
          quantity: data.quantity,
          purchaseRate: data.purchaseRate,
          totalAmount,
          date: new Date(data.date),
          createdById: userId,
        },
        include: rawPurchaseInclude,
      });

      await inventoryService.recordPurchase(
        {
          lotNumber: data.lotNumber,
          quantity: data.quantity,
          referenceId: purchase.id,
          date: data.date,
          createdBy: userId,
        },
        tx
      );

      const vendor = purchase.vendor;
      await accountingService.recordRawPurchase(
        asAccountingDoc(purchase),
        { vendorName: vendor?.name },
        tx
      );

      return purchase;
    });
  }

  async getRawPurchases({
    search,
    startDate,
    endDate,
    page = 1,
    limit = 10,
    includeDeleted = false,
    deletedOnly = false,
  }) {
    const date = buildDateRange(startDate, endDate);
    const baseWhere = {
      ...buildSearchFilter(search, ['lotNumber']),
      ...(date ? { date } : {}),
    };
    const where = buildListFilter(baseWhere, { includeDeleted, deletedOnly });

    const skip = (page - 1) * limit;
    const [purchases, total] = await Promise.all([
      prisma.rawPurchase.findMany({
        where,
        include: rawPurchaseInclude,
        orderBy: { date: 'desc' },
        skip,
        take: limit,
      }),
      prisma.rawPurchase.count({ where }),
    ]);

    return { purchases, total };
  }

  // Machine Entry
  async createMachineEntry(data, userId) {
    return withTransaction(async (tx) => {
      await validateOutboundCapacity(
        STOCK_CATEGORIES.RAW_MATERIAL,
        { lotNumber: data.lotNumber },
        data.quantitySent,
        tx,
        { label: `raw material for lot ${data.lotNumber}` }
      );

      const entry = await tx.machineEntry.create({
        data: {
          lotNumber: data.lotNumber,
          quantitySent: data.quantitySent,
          date: new Date(data.date),
          createdById: userId,
        },
        include: createdByInclude,
      });

      await inventoryService.transferRawToWIP(
        {
          lotNumber: data.lotNumber,
          quantity: data.quantitySent,
          referenceId: entry.id,
          date: data.date,
          createdBy: userId,
        },
        tx
      );

      return entry;
    });
  }

  async getMachineEntries({
    search,
    startDate,
    endDate,
    lotNumber,
    page = 1,
    limit = 10,
    includeDeleted = false,
    deletedOnly = false,
  }) {
    const date = buildDateRange(startDate, endDate);
    const lotFilter = search
      ? buildSearchFilter(search, ['lotNumber'])
      : lotNumber
        ? { lotNumber }
        : undefined;

    const baseWhere = {
      ...(lotFilter ?? {}),
      ...(date ? { date } : {}),
    };
    const where = buildListFilter(baseWhere, { includeDeleted, deletedOnly });

    const skip = (page - 1) * limit;
    const [entries, total] = await Promise.all([
      prisma.machineEntry.findMany({
        where,
        include: createdByInclude,
        orderBy: { date: 'desc' },
        skip,
        take: limit,
      }),
      prisma.machineEntry.count({ where }),
    ]);

    return { entries, total };
  }

  // Quality Production (lot-scoped WIP)
  async createQualityProduction(data, userId) {
    return withTransaction(async (tx) => {
      const lotNumber = data.lotNumber?.trim();
      if (!lotNumber) {
        throw new AppError('Lot number is required', 400);
      }

      const totalOutput =
        data.quantity6No +
        data.quantity5No +
        data.quantity4_5No +
        data.quantity4No +
        data.quantityOthers;

      if (totalOutput <= 0) {
        throw new AppError('At least one quality quantity must be greater than zero', 400);
      }

      await validateWipOutbound(totalOutput, tx, null, null, lotNumber);

      const production = await tx.qualityProduction.create({
        data: {
          lotNumber,
          date: new Date(data.date),
          quantity6No: data.quantity6No ?? 0,
          quantity5No: data.quantity5No ?? 0,
          quantity4_5No: data.quantity4_5No ?? 0,
          quantity4No: data.quantity4No ?? 0,
          quantityOthers: data.quantityOthers ?? 0,
          rate6No: data.rate6No ?? 0,
          rate5No: data.rate5No ?? 0,
          rate4_5No: data.rate4_5No ?? 0,
          rate4No: data.rate4No ?? 0,
          rateOthers: data.rateOthers ?? 0,
          totalOutput,
          createdById: userId,
        },
        include: createdByInclude,
      });

      await inventoryService.recordQualityProduction(
        {
          lotNumber,
          quantity6No: data.quantity6No,
          quantity5No: data.quantity5No,
          quantity4_5No: data.quantity4_5No,
          quantity4No: data.quantity4No,
          quantityOthers: data.quantityOthers,
          referenceId: production.id,
          date: data.date,
          createdBy: userId,
        },
        tx
      );

      return production;
    });
  }

  async getQualityProductions({
    startDate,
    endDate,
    lotNumber,
    page = 1,
    limit = 10,
    includeDeleted = false,
    deletedOnly = false,
  }) {
    const date = buildDateRange(startDate, endDate);
    const baseWhere = {
      ...(date ? { date } : {}),
      ...(lotNumber ? { lotNumber } : {}),
    };
    const where = buildListFilter(baseWhere, { includeDeleted, deletedOnly });

    const skip = (page - 1) * limit;
    const [productions, total] = await Promise.all([
      prisma.qualityProduction.findMany({
        where,
        include: createdByInclude,
        orderBy: { date: 'desc' },
        skip,
        take: limit,
      }),
      prisma.qualityProduction.count({ where }),
    ]);

    return { productions, total };
  }

  async getLotQualityRates(lotNumber, tx = prisma) {
    const productions = await tx.qualityProduction.findMany({
      where: { ...ACTIVE_ONLY, lotNumber },
      select: {
        quantity6No: true,
        quantity5No: true,
        quantity4_5No: true,
        quantity4No: true,
        quantityOthers: true,
        rate6No: true,
        rate5No: true,
        rate4_5No: true,
        rate4No: true,
        rateOthers: true,
      },
    });

    let qty6 = 0;
    let val6 = 0;
    let qty5 = 0;
    let val5 = 0;
    let qty4_5 = 0;
    let val4_5 = 0;
    let qty4 = 0;
    let val4 = 0;
    let qtyOthers = 0;
    let valOthers = 0;

    for (const row of productions) {
      if (row.quantity6No > 0) {
        qty6 += row.quantity6No;
        val6 += row.quantity6No * row.rate6No;
      }
      if (row.quantity5No > 0) {
        qty5 += row.quantity5No;
        val5 += row.quantity5No * row.rate5No;
      }
      if (row.quantity4_5No > 0) {
        qty4_5 += row.quantity4_5No;
        val4_5 += row.quantity4_5No * row.rate4_5No;
      }
      if (row.quantity4No > 0) {
        qty4 += row.quantity4No;
        val4 += row.quantity4No * row.rate4No;
      }
      if (row.quantityOthers > 0) {
        qtyOthers += row.quantityOthers;
        valOthers += row.quantityOthers * row.rateOthers;
      }
    }

    return {
      rate6No: qty6 > 0 ? round2(val6 / qty6) : 0,
      rate5No: qty5 > 0 ? round2(val5 / qty5) : 0,
      rate4_5No: qty4_5 > 0 ? round2(val4_5 / qty4_5) : 0,
      rate4No: qty4 > 0 ? round2(val4 / qty4) : 0,
      rateOthers: qtyOthers > 0 ? round2(valOthers / qtyOthers) : 0,
    };
  }

  async getLotQualityStock(lotNumber, tx = prisma) {
    const [stock6No, stock5No, stock4_5No, stock4No, stockOthers, rates] = await Promise.all([
      inventoryRepository.getScopeBalance(STOCK_CATEGORIES.QUALITY_6NO, { lotNumber }, tx),
      inventoryRepository.getScopeBalance(STOCK_CATEGORIES.QUALITY_5NO, { lotNumber }, tx),
      inventoryRepository.getScopeBalance(STOCK_CATEGORIES.QUALITY_4_5NO, { lotNumber }, tx),
      inventoryRepository.getScopeBalance(STOCK_CATEGORIES.QUALITY_4NO, { lotNumber }, tx),
      inventoryRepository.getScopeBalance(STOCK_CATEGORIES.QUALITY_OTHERS, { lotNumber }, tx),
      this.getLotQualityRates(lotNumber, tx),
    ]);

    return {
      lotNumber,
      stock6No: round2(stock6No),
      stock5No: round2(stock5No),
      stock4_5No: round2(stock4_5No),
      stock4No: round2(stock4No),
      stockOthers: round2(stockOthers),
      ...rates,
      totalStock: round2(stock6No + stock5No + stock4_5No + stock4No + stockOthers),
    };
  }

  async getLotsQualityStock() {
    const lotNumbers = new Set();
    for (const category of QUALITY_LOT_CATEGORIES) {
      const lots = await inventoryRepository.getLotsWithBalance(category);
      lots.forEach(({ lotNumber }) => lotNumbers.add(lotNumber));
    }

    const result = [];
    for (const lotNumber of [...lotNumbers].sort()) {
      const detail = await this.getLotQualityStock(lotNumber);
      if (detail.totalStock > 0) {
        result.push(detail);
      }
    }
    return result;
  }

  async generateBatchNumber(date, tx = prisma) {
    const year = new Date(date).getFullYear().toString().slice(-2);
    const prefix = `FG-${year}-`;
    const count = await tx.finishedProduction.count({
      where: { batchNumber: { startsWith: prefix } },
    });
    return `${prefix}${String(count + 1).padStart(5, '0')}`;
  }

  calculateFinishedGoodsPrice(consumed, rates, finishedQuantity) {
    const finishedValue = round2(
      consumed.consumed6No * rates.rate6No +
        consumed.consumed5No * rates.rate5No +
        consumed.consumed4_5No * rates.rate4_5No +
        consumed.consumed4No * rates.rate4No +
        (consumed.consumedOthers || 0) * (rates.rateOthers || 0)
    );
    const finishedRate =
      finishedQuantity > 0 ? round2(finishedValue / finishedQuantity) : 0;
    return { finishedRate, finishedValue };
  }

  async resolveFinishedProductionData(data, tx, referenceType = null, referenceId = null) {
    const lotNumber = data.lotNumber?.trim();
    if (!lotNumber) {
      throw new AppError('Lot number is required', 400);
    }

    const lotStock = await this.getLotQualityStock(lotNumber, tx);
    let consumed6No = data.consumed6No || 0;
    let consumed5No = data.consumed5No || 0;
    let consumed4_5No = data.consumed4_5No || 0;
    let consumed4No = data.consumed4No || 0;
    let consumedOthers = data.consumedOthers || 0;

    if (data.productionMode === PRODUCTION_MODES.PROPORTIONATE) {
      const consumption = inventoryService.calculateProportionateConsumption(
        data.finishedQuantity,
        {
          stock6No: lotStock.stock6No,
          stock5No: lotStock.stock5No,
          stock4_5No: lotStock.stock4_5No,
          stock4No: lotStock.stock4No,
          stockOthers: lotStock.stockOthers,
        }
      );
      consumed6No = consumption.consumed6No;
      consumed5No = consumption.consumed5No;
      consumed4_5No = consumption.consumed4_5No;
      consumed4No = consumption.consumed4No;
      consumedOthers = consumption.consumedOthers;
    } else {
      const totalManual =
        consumed6No + consumed5No + consumed4_5No + consumed4No + consumedOthers;
      if (round2(totalManual) !== round2(data.finishedQuantity)) {
        throw new AppError(
          `Manual consumption total (${totalManual}) must equal finished quantity (${data.finishedQuantity})`,
          400
        );
      }
    }

    await validateFinishedProductionStock(
      { consumed6No, consumed5No, consumed4_5No, consumed4No, consumedOthers, lotNumber },
      tx,
      referenceType,
      referenceId
    );

    const { finishedRate, finishedValue } = this.calculateFinishedGoodsPrice(
      { consumed6No, consumed5No, consumed4_5No, consumed4No, consumedOthers },
      lotStock,
      data.finishedQuantity
    );

    return {
      lotNumber,
      consumed6No,
      consumed5No,
      consumed4_5No,
      consumed4No,
      consumedOthers,
      finishedRate,
      finishedValue,
    };
  }

  // Finished Production (lot-scoped quality stock)
  async createFinishedProduction(data, userId) {
    return withTransaction(async (tx) => {
      const resolved = await this.resolveFinishedProductionData(data, tx);
      const batchNumber = await this.generateBatchNumber(data.date, tx);

      const production = await tx.finishedProduction.create({
        data: {
          batchNumber,
          lotNumber: resolved.lotNumber,
          date: new Date(data.date),
          finishedQuantity: data.finishedQuantity,
          remainingQuantity: data.finishedQuantity,
          productionMode: data.productionMode,
          consumed6No: resolved.consumed6No,
          consumed5No: resolved.consumed5No,
          consumed4_5No: resolved.consumed4_5No,
          consumed4No: resolved.consumed4No,
          consumedOthers: resolved.consumedOthers,
          finishedRate: resolved.finishedRate,
          finishedValue: resolved.finishedValue,
          createdById: userId,
        },
        include: createdByInclude,
      });

      await inventoryService.recordFinishedProduction(
        {
          lotNumber: resolved.lotNumber,
          batchId: production.id,
          finishedQuantity: data.finishedQuantity,
          consumed6No: resolved.consumed6No,
          consumed5No: resolved.consumed5No,
          consumed4_5No: resolved.consumed4_5No,
          consumed4No: resolved.consumed4No,
          consumedOthers: resolved.consumedOthers,
          referenceId: production.id,
          date: data.date,
          createdBy: userId,
        },
        tx
      );

      return production;
    });
  }

  async getFinishedProductions({
    startDate,
    endDate,
    lotNumber,
    page = 1,
    limit = 10,
    includeDeleted = false,
    deletedOnly = false,
  }) {
    const date = buildDateRange(startDate, endDate);
    const baseWhere = {
      ...(date ? { date } : {}),
      ...(lotNumber ? { lotNumber } : {}),
    };
    const where = buildListFilter(baseWhere, { includeDeleted, deletedOnly });

    const skip = (page - 1) * limit;
    const [productions, total] = await Promise.all([
      prisma.finishedProduction.findMany({
        where,
        include: createdByInclude,
        orderBy: { date: 'desc' },
        skip,
        take: limit,
      }),
      prisma.finishedProduction.count({ where }),
    ]);

    return { productions, total };
  }

  async getProductionTrend(startDate, endDate) {
    const date = buildDateRange(startDate, endDate);
    const productions = await prisma.qualityProduction.findMany({
      where: buildListFilter(date ? { date } : {}),
      select: { date: true, totalOutput: true },
    });

    const grouped = new Map();
    for (const row of productions) {
      const d = new Date(row.date);
      const month = d.getMonth() + 1;
      const year = d.getFullYear();
      const key = `${year}-${month}`;
      const existing = grouped.get(key) ?? {
        _id: { month, year },
        totalOutput: 0,
        count: 0,
      };
      existing.totalOutput += row.totalOutput;
      existing.count += 1;
      grouped.set(key, existing);
    }

    return [...grouped.values()].sort(
      (a, b) => a._id.year - b._id.year || a._id.month - b._id.month
    );
  }

  async getAvailableLots() {
    return inventoryService.getAvailableRawMaterialLots();
  }

  async getWipStock() {
    const balance = await inventoryService.getWipBalance();
    return { balance };
  }

  async getWipLots() {
    return inventoryService.getAvailableWipLots();
  }

  async updateRawPurchase(id, data) {
    return withTransaction(async (tx) => {
      const existing = await tx.rawPurchase.findUnique({ where: { id } });
      assertNotDeleted(existing, 'Raw purchase');

      const stockUnchanged =
        sameLotNumber(existing.lotNumber, data.lotNumber) &&
        sameQty(existing.quantity, data.quantity);

      if (stockUnchanged) {
        const totalAmount = round2(data.quantity * data.purchaseRate);
        await accountingService.deleteLedgerEntriesByReference('RawPurchase', existing.id, tx);
        const purchase = await tx.rawPurchase.update({
          where: { id },
          data: {
            vendorId: vendorIdFrom(data),
            lotNumber: data.lotNumber,
            purchaseRate: data.purchaseRate,
            totalAmount,
            date: new Date(data.date),
          },
          include: rawPurchaseInclude,
        });
        await accountingService.recordRawPurchase(
          asAccountingDoc(purchase),
          { vendorName: purchase.vendor?.name },
          tx
        );
        return purchase;
      }

      await inventoryService.validateEditStockImpact(
        'RawPurchase',
        existing.id,
        rawPurchaseEditEffects(existing, data),
        tx,
        { label: 'raw material' }
      );
      await accountingService.deleteLedgerEntriesByReference('RawPurchase', existing.id, tx);
      await inventoryService.deleteMovementsByReference('RawPurchase', existing.id, tx, {
        skipValidation: true,
      });

      const totalAmount = data.quantity * data.purchaseRate;
      const purchase = await tx.rawPurchase.update({
        where: { id },
        data: {
          vendorId: vendorIdFrom(data),
          lotNumber: data.lotNumber,
          quantity: data.quantity,
          purchaseRate: data.purchaseRate,
          totalAmount,
          date: new Date(data.date),
        },
        include: rawPurchaseInclude,
      });

      await inventoryService.recordPurchase(
        {
          lotNumber: data.lotNumber,
          quantity: data.quantity,
          referenceId: purchase.id,
          date: data.date,
          createdBy: existing.createdById,
        },
        tx
      );

      const vendor = purchase.vendor;
      await accountingService.recordRawPurchase(
        asAccountingDoc(purchase),
        { vendorName: vendor?.name },
        tx
      );

      return purchase;
    });
  }

  async deleteRawPurchase(id, userId, deleteReason) {
    return withTransaction(async (tx) => {
      const existing = await tx.rawPurchase.findUnique({ where: { id } });
      assertNotDeleted(existing, 'Raw purchase');

      await softDeleteInvoice(tx, { rawPurchaseId: id }, userId, deleteReason);

      await inventoryService.validateDeleteMovementsByReference('RawPurchase', existing.id, tx);
      await accountingService.deleteLedgerEntriesByReference('RawPurchase', existing.id, tx);
      await inventoryService.deleteMovementsByReference('RawPurchase', existing.id, tx);
      return tx.rawPurchase.update({
        where: { id },
        data: softDeletePayload(userId, deleteReason),
      });
    });
  }

  async restoreRawPurchase(id, userId) {
    return withTransaction(async (tx) => {
      const existing = await tx.rawPurchase.findUnique({ where: { id } });
      assertIsDeleted(existing, 'Raw purchase');

      const purchase = await tx.rawPurchase.update({
        where: { id },
        data: restorePayload(),
        include: rawPurchaseInclude,
      });

      await inventoryService.recordPurchase(
        {
          lotNumber: purchase.lotNumber,
          quantity: purchase.quantity,
          referenceId: purchase.id,
          date: purchase.date,
          createdBy: userId || purchase.createdById,
        },
        tx
      );

      await accountingService.recordRawPurchase(
        asAccountingDoc(purchase),
        { vendorName: purchase.vendor?.name },
        tx
      );

      return purchase;
    });
  }

  async updateMachineEntry(id, data) {
    return withTransaction(async (tx) => {
      const existing = await tx.machineEntry.findUnique({ where: { id } });
      assertNotDeleted(existing, 'Machine entry');

      const stockUnchanged =
        sameLotNumber(existing.lotNumber, data.lotNumber) &&
        sameQty(existing.quantitySent, data.quantitySent);

      if (stockUnchanged) {
        return tx.machineEntry.update({
          where: { id },
          data: { date: new Date(data.date) },
          include: createdByInclude,
        });
      }

      await inventoryService.validateEditStockImpact(
        'MachineEntry',
        existing.id,
        machineEntryEditEffects(existing, data),
        tx,
        { label: 'machine entry' }
      );
      await inventoryService.deleteMovementsByReference('MachineEntry', existing.id, tx, {
        skipValidation: true,
      });

      const entry = await tx.machineEntry.update({
        where: { id },
        data: {
          lotNumber: data.lotNumber,
          quantitySent: data.quantitySent,
          date: new Date(data.date),
        },
        include: createdByInclude,
      });

      await inventoryService.transferRawToWIP(
        {
          lotNumber: data.lotNumber,
          quantity: data.quantitySent,
          referenceId: entry.id,
          date: data.date,
          createdBy: existing.createdById,
        },
        tx
      );

      return entry;
    });
  }

  async deleteMachineEntry(id, userId, deleteReason) {
    return withTransaction(async (tx) => {
      const existing = await tx.machineEntry.findUnique({ where: { id } });
      assertNotDeleted(existing, 'Machine entry');

      await inventoryService.validateDeleteMovementsByReference('MachineEntry', existing.id, tx);
      await inventoryService.deleteMovementsByReference('MachineEntry', existing.id, tx);
      return tx.machineEntry.update({
        where: { id },
        data: softDeletePayload(userId, deleteReason),
      });
    });
  }

  async restoreMachineEntry(id, userId) {
    return withTransaction(async (tx) => {
      const existing = await tx.machineEntry.findUnique({ where: { id } });
      assertIsDeleted(existing, 'Machine entry');

      await validateOutboundCapacity(
        STOCK_CATEGORIES.RAW_MATERIAL,
        { lotNumber: existing.lotNumber },
        existing.quantitySent,
        tx,
        { label: `raw material for lot ${existing.lotNumber}` }
      );

      const entry = await tx.machineEntry.update({
        where: { id },
        data: restorePayload(),
        include: createdByInclude,
      });

      await inventoryService.transferRawToWIP(
        {
          lotNumber: entry.lotNumber,
          quantity: entry.quantitySent,
          referenceId: entry.id,
          date: entry.date,
          createdBy: userId || entry.createdById,
        },
        tx
      );

      return entry;
    });
  }

  async updateQualityProduction(id, data) {
    return withTransaction(async (tx) => {
      const existing = await tx.qualityProduction.findUnique({ where: { id } });
      assertNotDeleted(existing, 'Quality production');

      const lotNumber = data.lotNumber?.trim();
      if (!lotNumber) {
        throw new AppError('Lot number is required', 400);
      }

      const totalOutput =
        data.quantity6No +
        data.quantity5No +
        data.quantity4_5No +
        data.quantity4No +
        data.quantityOthers;
      if (totalOutput <= 0) {
        throw new AppError('At least one quality quantity must be greater than zero', 400);
      }

      const stockUnchanged =
        sameLotNumber(existing.lotNumber, lotNumber) &&
        sameQty(existing.quantity6No, data.quantity6No) &&
        sameQty(existing.quantity5No, data.quantity5No) &&
        sameQty(existing.quantity4_5No, data.quantity4_5No) &&
        sameQty(existing.quantity4No, data.quantity4No) &&
        sameQty(existing.quantityOthers, data.quantityOthers);

      if (stockUnchanged) {
        return tx.qualityProduction.update({
          where: { id },
          data: {
            date: new Date(data.date),
            rate6No: data.rate6No ?? 0,
            rate5No: data.rate5No ?? 0,
            rate4_5No: data.rate4_5No ?? 0,
            rate4No: data.rate4No ?? 0,
            rateOthers: data.rateOthers ?? 0,
          },
          include: createdByInclude,
        });
      }

      await inventoryService.validateEditStockImpact(
        'QualityProduction',
        existing.id,
        qualityProductionEditEffects(existing, lotNumber, data),
        tx,
        { label: 'quality production' }
      );
      await inventoryService.deleteMovementsByReference('QualityProduction', existing.id, tx, {
        skipValidation: true,
      });

      const production = await tx.qualityProduction.update({
        where: { id },
        data: {
          lotNumber,
          date: new Date(data.date),
          quantity6No: data.quantity6No,
          quantity5No: data.quantity5No,
          quantity4_5No: data.quantity4_5No,
          quantity4No: data.quantity4No,
          quantityOthers: data.quantityOthers,
          rate6No: data.rate6No ?? 0,
          rate5No: data.rate5No ?? 0,
          rate4_5No: data.rate4_5No ?? 0,
          rate4No: data.rate4No ?? 0,
          rateOthers: data.rateOthers ?? 0,
          totalOutput,
        },
        include: createdByInclude,
      });

      await inventoryService.recordQualityProduction(
        {
          lotNumber,
          quantity6No: data.quantity6No,
          quantity5No: data.quantity5No,
          quantity4_5No: data.quantity4_5No,
          quantity4No: data.quantity4No,
          quantityOthers: data.quantityOthers,
          referenceId: production.id,
          date: data.date,
          createdBy: existing.createdById,
        },
        tx
      );

      return production;
    });
  }

  async deleteQualityProduction(id, userId, deleteReason) {
    return withTransaction(async (tx) => {
      const existing = await tx.qualityProduction.findUnique({ where: { id } });
      assertNotDeleted(existing, 'Quality production');

      await inventoryService.validateDeleteMovementsByReference(
        'QualityProduction',
        existing.id,
        tx
      );
      await inventoryService.deleteMovementsByReference('QualityProduction', existing.id, tx);
      return tx.qualityProduction.update({
        where: { id },
        data: softDeletePayload(userId, deleteReason),
      });
    });
  }

  async restoreQualityProduction(id, userId) {
    return withTransaction(async (tx) => {
      const existing = await tx.qualityProduction.findUnique({ where: { id } });
      assertIsDeleted(existing, 'Quality production');

      const totalOutput =
        existing.quantity6No +
        existing.quantity5No +
        existing.quantity4_5No +
        existing.quantity4No +
        existing.quantityOthers;
      await validateWipOutbound(totalOutput, tx, null, null, existing.lotNumber);

      const production = await tx.qualityProduction.update({
        where: { id },
        data: restorePayload(),
        include: createdByInclude,
      });

      await inventoryService.recordQualityProduction(
        {
          lotNumber: production.lotNumber,
          quantity6No: production.quantity6No,
          quantity5No: production.quantity5No,
          quantity4_5No: production.quantity4_5No,
          quantity4No: production.quantity4No,
          quantityOthers: production.quantityOthers,
          referenceId: production.id,
          date: production.date,
          createdBy: userId || production.createdById,
        },
        tx
      );

      return production;
    });
  }

  async updateFinishedProduction(id, data) {
    return withTransaction(async (tx) => {
      const existing = await tx.finishedProduction.findUnique({ where: { id } });
      assertNotDeleted(existing, 'Finished production');

      const lotNumber = data.lotNumber?.trim();
      if (!lotNumber) {
        throw new AppError('Lot number is required', 400);
      }

      const manualConsumptionUnchanged =
        existing.productionMode !== PRODUCTION_MODES.MANUAL ||
        (sameQty(existing.consumed6No, data.consumed6No || 0) &&
          sameQty(existing.consumed5No, data.consumed5No || 0) &&
          sameQty(existing.consumed4_5No, data.consumed4_5No || 0) &&
          sameQty(existing.consumed4No, data.consumed4No || 0) &&
          sameQty(existing.consumedOthers, data.consumedOthers || 0));

      const stockUnchanged =
        sameLotNumber(existing.lotNumber, lotNumber) &&
        sameQty(existing.finishedQuantity, data.finishedQuantity) &&
        existing.productionMode === data.productionMode &&
        manualConsumptionUnchanged;

      if (stockUnchanged) {
        return tx.finishedProduction.update({
          where: { id },
          data: { date: new Date(data.date) },
          include: createdByInclude,
        });
      }

      const resolved = await this.resolveFinishedProductionData(
        data,
        tx,
        'FinishedProduction',
        id
      );

      const allocatedQty = await tx.manufacturingSaleAllocation.aggregate({
        where: { batchId: id },
        _sum: { quantity: true },
      });
      const soldQty = allocatedQty._sum.quantity || 0;
      const newRemaining = round2(data.finishedQuantity - soldQty);
      if (newRemaining < 0) {
        throw new AppError(
          `Cannot reduce batch below sold quantity (${soldQty} kg already allocated to sales)`,
          400
        );
      }

      await inventoryService.validateEditStockImpact(
        'FinishedProduction',
        existing.id,
        finishedProductionEditEffects(
          existing,
          id,
          resolved.lotNumber,
          resolved,
          data.finishedQuantity
        ),
        tx,
        { label: 'finished production' }
      );
      await inventoryService.deleteMovementsByReference('FinishedProduction', existing.id, tx, {
        skipValidation: true,
      });

      const production = await tx.finishedProduction.update({
        where: { id },
        data: {
          lotNumber: resolved.lotNumber,
          date: new Date(data.date),
          finishedQuantity: data.finishedQuantity,
          remainingQuantity: newRemaining,
          productionMode: data.productionMode,
          consumed6No: resolved.consumed6No,
          consumed5No: resolved.consumed5No,
          consumed4_5No: resolved.consumed4_5No,
          consumed4No: resolved.consumed4No,
          consumedOthers: resolved.consumedOthers,
          finishedRate: resolved.finishedRate,
          finishedValue: resolved.finishedValue,
        },
        include: createdByInclude,
      });

      await inventoryService.recordFinishedProduction(
        {
          lotNumber: resolved.lotNumber,
          batchId: production.id,
          finishedQuantity: data.finishedQuantity,
          consumed6No: resolved.consumed6No,
          consumed5No: resolved.consumed5No,
          consumed4_5No: resolved.consumed4_5No,
          consumed4No: resolved.consumed4No,
          consumedOthers: resolved.consumedOthers,
          referenceId: production.id,
          date: data.date,
          createdBy: existing.createdById,
        },
        tx
      );

      return production;
    });
  }

  async deleteFinishedProduction(id, userId, deleteReason) {
    return withTransaction(async (tx) => {
      const existing = await tx.finishedProduction.findUnique({ where: { id } });
      assertNotDeleted(existing, 'Finished production');

      if (existing.remainingQuantity < existing.finishedQuantity) {
        throw new AppError(
          'Cannot delete batch with allocated sales. Remaining quantity is less than produced quantity.',
          400
        );
      }

      const allocationCount = await tx.manufacturingSaleAllocation.count({
        where: { batchId: id },
      });
      if (allocationCount > 0) {
        throw new AppError('Cannot delete batch that has sale allocations', 400);
      }

      await inventoryService.validateDeleteMovementsByReference(
        'FinishedProduction',
        existing.id,
        tx
      );
      await inventoryService.deleteMovementsByReference('FinishedProduction', existing.id, tx);
      return tx.finishedProduction.update({
        where: { id },
        data: softDeletePayload(userId, deleteReason),
      });
    });
  }

  async restoreFinishedProduction(id, userId) {
    return withTransaction(async (tx) => {
      const existing = await tx.finishedProduction.findUnique({ where: { id } });
      assertIsDeleted(existing, 'Finished production');

      await validateFinishedProductionStock(
        {
          consumed6No: existing.consumed6No,
          consumed5No: existing.consumed5No,
          consumed4_5No: existing.consumed4_5No,
          consumed4No: existing.consumed4No,
          consumedOthers: existing.consumedOthers,
          lotNumber: existing.lotNumber,
        },
        tx
      );

      const production = await tx.finishedProduction.update({
        where: { id },
        data: restorePayload(),
        include: createdByInclude,
      });

      await inventoryService.recordFinishedProduction(
        {
          lotNumber: production.lotNumber,
          batchId: production.id,
          finishedQuantity: production.finishedQuantity,
          consumed6No: production.consumed6No,
          consumed5No: production.consumed5No,
          consumed4_5No: production.consumed4_5No,
          consumed4No: production.consumed4No,
          consumedOthers: production.consumedOthers,
          referenceId: production.id,
          date: production.date,
          createdBy: userId || production.createdById,
        },
        tx
      );

      return production;
    });
  }

  // Manufacturing Sales (finished goods only)
  async generateManufacturingSaleSerial(tx = prisma) {
    const count = await tx.manufacturingSale.count();
    const year = new Date().getFullYear().toString().slice(-2);
    return `MSAL-${year}-${String(count + 1).padStart(5, '0')}`;
  }

  async getFinishedGoodsStock() {
    const balance = await fifoAllocationService.getTotalRemainingQuantity();
    return { category: STOCK_CATEGORIES.FINISHED_GOODS, balance };
  }

  async getFinishedGoodsBatches() {
    return fifoAllocationService.getBatchInventory();
  }

  async getManufacturingSaleAllocations(saleId) {
    return fifoAllocationService.getSaleAllocations(saleId);
  }

  async createManufacturingSale(data, userId) {
    const saleType = data.saleType || MANUFACTURING_SALE_TYPES.LOOSE;
    if (saleType === MANUFACTURING_SALE_TYPES.BRANDED) {
      return this.createBrandedManufacturingSale(data, userId);
    }

    const productCategory = STOCK_CATEGORIES.FINISHED_GOODS;

    return withTransaction(async (tx) => {
      await validateFinishedGoodsBatchCapacity(data.quantity, tx);

      const allocations = await fifoAllocationService.allocateQuantity(data.quantity, tx);
      const costOfGoodsSold = fifoAllocationService.sumAllocationCost(allocations);

      const serialNumber = data.serialNumber || (await this.generateManufacturingSaleSerial(tx));
      const sale = await tx.manufacturingSale.create({
        data: {
          serialNumber,
          date: new Date(data.date),
          customerName: data.customerName,
          customerPhone: data.customerPhone,
          customerEmail: data.customerEmail,
          customerAddress: data.customerAddress,
          customerGstNumber: data.customerGstNumber,
          saleType: MANUFACTURING_SALE_TYPES.LOOSE,
          productCategory,
          quantity: data.quantity,
          rate: data.rate ?? 0,
          amount: data.amount,
          costOfGoodsSold,
          createdById: userId,
        },
        include: createdByInclude,
      });

      await fifoAllocationService.persistSaleAllocations(sale.id, allocations, tx);
      await fifoAllocationService.applyAllocations(allocations, tx);

      await inventoryService.recordManufacturingSale(
        {
          productCategory,
          quantity: data.quantity,
          allocations,
          referenceId: sale.id,
          date: data.date,
          createdBy: userId,
        },
        tx
      );

      await accountingService.recordManufacturingSale(asAccountingDoc(sale), tx);

      return sale;
    });
  }

  async createBrandedManufacturingSale(data, userId) {
    if (!data.brandId) throw new AppError('Brand is required for branded sale', 400);

    return withTransaction(async (tx) => {
      const { brand, quantity, packetCount } = await this.resolveBrandedSaleQuantities(data, null, tx);

      await validateOutboundCapacity(
        STOCK_CATEGORIES.BRANDED_GOODS,
        { brandId: data.brandId },
        packetCount,
        tx,
        { label: 'branded stock' }
      );

      const costPerPacket = await packagingService.getBrandedWeightedAvgCost(data.brandId, tx);
      const costOfGoodsSold = round2(packetCount * costPerPacket);

      const serialNumber = data.serialNumber || (await this.generateManufacturingSaleSerial(tx));
      const sale = await tx.manufacturingSale.create({
        data: {
          serialNumber,
          date: new Date(data.date),
          customerName: data.customerName,
          customerPhone: data.customerPhone,
          customerEmail: data.customerEmail,
          customerAddress: data.customerAddress,
          customerGstNumber: data.customerGstNumber,
          saleType: MANUFACTURING_SALE_TYPES.BRANDED,
          brandId: data.brandId,
          productCategory: STOCK_CATEGORIES.BRANDED_GOODS,
          quantity,
          packetCount,
          rate: data.rate ?? 0,
          amount: data.amount,
          costOfGoodsSold,
          createdById: userId,
        },
        include: {
          ...createdByInclude,
          brand: { select: { id: true, name: true, packetSizeGrams: true, packingWeightGrams: true } },
        },
      });

      await inventoryService.recordBrandedManufacturingSale(
        {
          brandId: data.brandId,
          packetCount,
          referenceId: sale.id,
          date: data.date,
          createdBy: userId,
        },
        tx
      );

      await accountingService.recordManufacturingSale(asAccountingDoc(sale), tx);
      return sale;
    });
  }

  async resolveBrandedSaleQuantities(data, existing = null, tx = prisma) {
    const brandId = data.brandId || existing?.brandId;
    if (!brandId) throw new AppError('Brand is required for branded sale', 400);

    const brand = await packagingService.getBrandOrThrow(brandId, tx);

    if (data.quantity != null && round2(data.quantity) > 0) {
      return { brand, ...calculateBrandedSalePackets(brand, data.quantity) };
    }

    if (data.packetCount != null && round2(data.packetCount) > 0) {
      const packetCount = round2(data.packetCount);
      const packetSizeKg = Number(brand.packetSizeGrams ?? 0) / 1000;
      return {
        brand,
        quantity: round2(packetCount * packetSizeKg),
        packetCount,
      };
    }

    if (existing) {
      const packetCount = round2(existing.packetCount);
      const packetSizeKg = Number(brand.packetSizeGrams ?? 0) / 1000;
      const quantity = round2(existing.quantity) > 0
        ? round2(existing.quantity)
        : round2(packetCount * packetSizeKg);
      return { brand, quantity, packetCount };
    }

    throw new AppError('Quantity sold must be greater than zero', 400);
  }

  async getManufacturingSales({
    search,
    startDate,
    endDate,
    page = 1,
    limit = 10,
    includeDeleted = false,
    deletedOnly = false,
  }) {
    const date = buildDateRange(startDate, endDate);
    const baseWhere = {
      ...buildSearchFilter(search, ['serialNumber', 'customerName']),
      ...(date ? { date } : {}),
    };
    const where = buildListFilter(baseWhere, { includeDeleted, deletedOnly });

    const skip = (page - 1) * limit;
    const [sales, total] = await Promise.all([
      prisma.manufacturingSale.findMany({
        where,
        include: { brand: { select: { id: true, name: true, packetSizeGrams: true, packingWeightGrams: true } } },
        orderBy: { date: 'desc' },
        skip,
        take: limit,
      }),
      prisma.manufacturingSale.count({ where }),
    ]);

    return { sales, total };
  }

  async updateManufacturingSale(id, data) {
    const existing = await prisma.manufacturingSale.findUnique({ where: { id } });
    assertNotDeleted(existing, 'Manufacturing sale');

    if ((existing.saleType || MANUFACTURING_SALE_TYPES.LOOSE) === MANUFACTURING_SALE_TYPES.BRANDED) {
      return this.updateBrandedManufacturingSale(id, data, existing);
    }

    const productCategory = STOCK_CATEGORIES.FINISHED_GOODS;

    return withTransaction(async (tx) => {
      const existingSale = await tx.manufacturingSale.findUnique({ where: { id } });
      assertNotDeleted(existingSale, 'Manufacturing sale');

      const stockUnchanged = sameQty(existingSale.quantity, data.quantity);

      if (stockUnchanged) {
        const sale = await tx.manufacturingSale.update({
          where: { id },
          data: {
            date: new Date(data.date),
            customerName: data.customerName,
            customerPhone: data.customerPhone,
            customerEmail: data.customerEmail,
            customerAddress: data.customerAddress,
            customerGstNumber: data.customerGstNumber,
            rate: data.rate ?? existingSale.rate,
            amount: data.amount,
          },
          include: createdByInclude,
        });

        await accountingService.deleteLedgerEntriesByReference('ManufacturingSale', existingSale.id, tx);
        await accountingService.recordManufacturingSale(asAccountingDoc(sale), tx);
        return sale;
      }

      await validateFinishedGoodsBatchCapacity(data.quantity, tx, {
        referenceType: 'ManufacturingSale',
        referenceId: id,
      });

      await fifoAllocationService.reverseAllocations(existingSale.id, tx);
      await accountingService.deleteLedgerEntriesByReference('ManufacturingSale', existingSale.id, tx);
      await inventoryService.deleteMovementsByReference('ManufacturingSale', existingSale.id, tx, {
        skipValidation: true,
      });

      const allocations = await fifoAllocationService.allocateQuantity(data.quantity, tx);
      const costOfGoodsSold = fifoAllocationService.sumAllocationCost(allocations);

      const sale = await tx.manufacturingSale.update({
        where: { id },
        data: {
          date: new Date(data.date),
          customerName: data.customerName,
          customerPhone: data.customerPhone,
          customerEmail: data.customerEmail,
          customerAddress: data.customerAddress,
          customerGstNumber: data.customerGstNumber,
          productCategory,
          quantity: data.quantity,
          rate: data.rate ?? existingSale.rate,
          amount: data.amount,
          costOfGoodsSold,
        },
        include: createdByInclude,
      });

      await fifoAllocationService.persistSaleAllocations(sale.id, allocations, tx);
      await fifoAllocationService.applyAllocations(allocations, tx);

      await inventoryService.recordManufacturingSale(
        {
          productCategory,
          quantity: data.quantity,
          allocations,
          referenceId: sale.id,
          date: data.date,
          createdBy: existingSale.createdById,
        },
        tx
      );

      await accountingService.recordManufacturingSale(asAccountingDoc(sale), tx);

      return sale;
    });
  }

  async updateBrandedManufacturingSale(id, data, existing) {
    const brandId = data.brandId || existing.brandId;

    return withTransaction(async (tx) => {
      const { quantity, packetCount } = await this.resolveBrandedSaleQuantities(
        { ...data, brandId },
        existing,
        tx
      );

      const stockUnchanged =
        sameQty(existing.packetCount, packetCount)
        && sameQty(existing.quantity, quantity)
        && brandId === existing.brandId;

      if (stockUnchanged) {
        const sale = await tx.manufacturingSale.update({
          where: { id },
          data: {
            date: new Date(data.date),
            customerName: data.customerName,
            customerPhone: data.customerPhone,
            customerEmail: data.customerEmail,
            customerAddress: data.customerAddress,
            customerGstNumber: data.customerGstNumber,
            rate: data.rate ?? existing.rate,
            amount: data.amount,
          },
          include: {
            ...createdByInclude,
            brand: { select: { id: true, name: true, packetSizeGrams: true, packingWeightGrams: true } },
          },
        });
        await accountingService.deleteLedgerEntriesByReference('ManufacturingSale', existing.id, tx);
        await accountingService.recordManufacturingSale(asAccountingDoc(sale), tx);
        return sale;
      }

      await validateOutboundCapacity(
        STOCK_CATEGORIES.BRANDED_GOODS,
        { brandId },
        packetCount,
        tx,
        { referenceType: 'ManufacturingSale', referenceId: id, label: 'branded stock' }
      );

      await accountingService.deleteLedgerEntriesByReference('ManufacturingSale', existing.id, tx);
      await inventoryService.deleteMovementsByReference('ManufacturingSale', existing.id, tx, {
        skipValidation: true,
      });

      const costPerPacket = await packagingService.getBrandedWeightedAvgCost(brandId, tx);
      const costOfGoodsSold = round2(packetCount * costPerPacket);

      const sale = await tx.manufacturingSale.update({
        where: { id },
        data: {
          date: new Date(data.date),
          customerName: data.customerName,
          customerPhone: data.customerPhone,
          customerEmail: data.customerEmail,
          customerAddress: data.customerAddress,
          customerGstNumber: data.customerGstNumber,
          brandId,
          quantity,
          packetCount,
          rate: data.rate ?? existing.rate,
          amount: data.amount,
          costOfGoodsSold,
        },
        include: {
          ...createdByInclude,
          brand: { select: { id: true, name: true, packetSizeGrams: true, packingWeightGrams: true } },
        },
      });

      await inventoryService.recordBrandedManufacturingSale(
        {
          brandId,
          packetCount,
          referenceId: sale.id,
          date: data.date,
          createdBy: existing.createdById,
        },
        tx
      );

      await accountingService.recordManufacturingSale(asAccountingDoc(sale), tx);
      return sale;
    });
  }

  async deleteManufacturingSale(id, userId, deleteReason) {
    return withTransaction(async (tx) => {
      const existing = await tx.manufacturingSale.findUnique({ where: { id } });
      assertNotDeleted(existing, 'Manufacturing sale');

      await inventoryService.validateDeleteMovementsByReference(
        'ManufacturingSale',
        existing.id,
        tx
      );

      await softDeleteInvoice(tx, { manufacturingSaleId: id }, userId, deleteReason);

      if ((existing.saleType || MANUFACTURING_SALE_TYPES.LOOSE) === MANUFACTURING_SALE_TYPES.BRANDED) {
        await accountingService.deleteLedgerEntriesByReference('ManufacturingSale', existing.id, tx);
        await inventoryService.deleteMovementsByReference('ManufacturingSale', existing.id, tx);
        return tx.manufacturingSale.update({
          where: { id },
          data: softDeletePayload(userId, deleteReason),
        });
      }

      await fifoAllocationService.reverseAllocations(existing.id, tx);
      await accountingService.deleteLedgerEntriesByReference('ManufacturingSale', existing.id, tx);
      await inventoryService.deleteMovementsByReference('ManufacturingSale', existing.id, tx);
      return tx.manufacturingSale.update({
        where: { id },
        data: softDeletePayload(userId, deleteReason),
      });
    });
  }

  async restoreManufacturingSale(id, userId) {
    return withTransaction(async (tx) => {
      const existing = await tx.manufacturingSale.findUnique({ where: { id } });
      assertIsDeleted(existing, 'Manufacturing sale');

      if ((existing.saleType || MANUFACTURING_SALE_TYPES.LOOSE) === MANUFACTURING_SALE_TYPES.BRANDED) {
        await validateOutboundCapacity(
          STOCK_CATEGORIES.BRANDED_GOODS,
          { brandId: existing.brandId },
          existing.packetCount,
          tx,
          { label: 'branded stock' }
        );

        const sale = await tx.manufacturingSale.update({
          where: { id },
          data: restorePayload(),
          include: {
            ...createdByInclude,
            brand: { select: { id: true, name: true, packetSizeGrams: true, packingWeightGrams: true } },
          },
        });

        await inventoryService.recordBrandedManufacturingSale(
          {
            brandId: sale.brandId,
            packetCount: sale.packetCount,
            referenceId: sale.id,
            date: sale.date,
            createdBy: userId || sale.createdById,
          },
          tx
        );
        await accountingService.recordManufacturingSale(asAccountingDoc(sale), tx);
        return sale;
      }

      await validateFinishedGoodsBatchCapacity(existing.quantity, tx);
      const allocations = await fifoAllocationService.allocateQuantity(existing.quantity, tx);
      const costOfGoodsSold = fifoAllocationService.sumAllocationCost(allocations);
      const sale = await tx.manufacturingSale.update({
        where: { id },
        data: { ...restorePayload(), costOfGoodsSold },
        include: createdByInclude,
      });

      await fifoAllocationService.persistSaleAllocations(sale.id, allocations, tx);
      await fifoAllocationService.applyAllocations(allocations, tx);
      await inventoryService.recordManufacturingSale(
        {
          productCategory: sale.productCategory || STOCK_CATEGORIES.FINISHED_GOODS,
          quantity: sale.quantity,
          allocations,
          referenceId: sale.id,
          date: sale.date,
          createdBy: userId || sale.createdById,
        },
        tx
      );
      await accountingService.recordManufacturingSale(asAccountingDoc(sale), tx);
      return sale;
    });
  }
}

export default new ManufacturingService();

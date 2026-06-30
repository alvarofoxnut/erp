import inventoryRepository from './inventory.repository.js';
import fifoAllocationService from './fifoAllocation.service.js';
import { prisma } from '../../config/db.js';
import { STOCK_CATEGORIES, STOCK_MOVEMENT_TYPES } from '../../shared/constants/index.js';
import AppError from '../../shared/utils/AppError.js';
import { validateOutboundCapacity } from './stockValidation.js';
import { withTransaction as runTransaction } from '../../shared/utils/transaction.js';

class InventoryService {
  async recordPurchase(data, tx) {
    return inventoryRepository.createMovement(
      {
        category: STOCK_CATEGORIES.RAW_MATERIAL,
        lotNumber: data.lotNumber,
        movementType: STOCK_MOVEMENT_TYPES.PURCHASE,
        quantity: data.quantity,
        direction: 'in',
        referenceType: 'RawPurchase',
        referenceId: data.referenceId,
        date: data.date,
        createdBy: data.createdBy,
      },
      tx
    );
  }

  async transferRawToWIP(data, tx) {
    await inventoryRepository.createMovement(
      {
        category: STOCK_CATEGORIES.RAW_MATERIAL,
        lotNumber: data.lotNumber,
        movementType: STOCK_MOVEMENT_TYPES.TRANSFER,
        quantity: data.quantity,
        direction: 'out',
        referenceType: 'MachineEntry',
        referenceId: data.referenceId,
        date: data.date,
        createdBy: data.createdBy,
      },
      tx
    );

    return inventoryRepository.createMovement(
      {
        category: STOCK_CATEGORIES.WIP,
        lotNumber: data.lotNumber,
        movementType: STOCK_MOVEMENT_TYPES.TRANSFER,
        quantity: data.quantity,
        direction: 'in',
        referenceType: 'MachineEntry',
        referenceId: data.referenceId,
        date: data.date,
        createdBy: data.createdBy,
      },
      tx
    );
  }

  async recordQualityProduction(data, tx, referenceType = null, referenceId = null) {
    const lotNumber = data.lotNumber?.trim();
    if (!lotNumber) {
      throw new AppError('Lot number is required for quality production', 400);
    }

    const wipScope = { lotNumber };

    const wipTotal =
      data.quantity6No +
      data.quantity5No +
      data.quantity4_5No +
      data.quantity4No +
      data.quantityOthers;

    await validateOutboundCapacity(
      STOCK_CATEGORIES.WIP,
      wipScope,
      wipTotal,
      tx,
      { referenceType, referenceId, label: `WIP for lot ${lotNumber}` }
    );

    await inventoryRepository.createMovement(
      {
        category: STOCK_CATEGORIES.WIP,
        lotNumber,
        movementType: STOCK_MOVEMENT_TYPES.PRODUCTION,
        quantity: wipTotal,
        direction: 'out',
        referenceType: 'QualityProduction',
        referenceId: data.referenceId,
        date: data.date,
        createdBy: data.createdBy,
      },
      tx
    );

    const movements = [];
    const qualityMap = [
      { qty: data.quantity6No, category: STOCK_CATEGORIES.QUALITY_6NO },
      { qty: data.quantity5No, category: STOCK_CATEGORIES.QUALITY_5NO },
      { qty: data.quantity4_5No, category: STOCK_CATEGORIES.QUALITY_4_5NO },
      { qty: data.quantity4No, category: STOCK_CATEGORIES.QUALITY_4NO },
      { qty: data.quantityOthers, category: STOCK_CATEGORIES.QUALITY_OTHERS },
    ];

    for (const { qty, category } of qualityMap) {
      if (qty > 0) {
        const entry = await inventoryRepository.createMovement(
          {
            category,
            lotNumber,
            movementType: STOCK_MOVEMENT_TYPES.PRODUCTION,
            quantity: qty,
            direction: 'in',
            referenceType: 'QualityProduction',
            referenceId: data.referenceId,
            date: data.date,
            createdBy: data.createdBy,
          },
          tx
        );
        movements.push(entry);
      }
    }

    return movements;
  }

  async recordFinishedProduction(data, tx, referenceType = null, referenceId = null) {
    const lotNumber = data.lotNumber?.trim();
    if (!lotNumber) {
      throw new AppError('Lot number is required for finished production', 400);
    }

    const scope = { lotNumber };
    const consumptions = [
      { qty: data.consumed6No, category: STOCK_CATEGORIES.QUALITY_6NO, label: '6 No' },
      { qty: data.consumed5No, category: STOCK_CATEGORIES.QUALITY_5NO, label: '5 No' },
      { qty: data.consumed4_5No, category: STOCK_CATEGORIES.QUALITY_4_5NO, label: '4.5 No' },
      { qty: data.consumed4No, category: STOCK_CATEGORIES.QUALITY_4NO, label: '4 No' },
      { qty: data.consumedOthers, category: STOCK_CATEGORIES.QUALITY_OTHERS, label: 'Others' },
    ];

    for (const { qty, category, label } of consumptions) {
      if (qty > 0) {
        await validateOutboundCapacity(
          category,
          scope,
          qty,
          tx,
          { referenceType, referenceId, label: `${label} for lot ${lotNumber}` }
        );
      }
    }

    for (const { qty, category } of consumptions) {
      if (qty > 0) {
        await inventoryRepository.createMovement(
          {
            category,
            lotNumber,
            movementType: STOCK_MOVEMENT_TYPES.CONSUMPTION,
            quantity: qty,
            direction: 'out',
            referenceType: 'FinishedProduction',
            referenceId: data.referenceId,
            date: data.date,
            createdBy: data.createdBy,
          },
          tx
        );
      }
    }

    return inventoryRepository.createMovement(
      {
        category: STOCK_CATEGORIES.FINISHED_GOODS,
        lotNumber,
        batchId: data.batchId,
        movementType: STOCK_MOVEMENT_TYPES.PRODUCTION,
        quantity: data.finishedQuantity,
        direction: 'in',
        referenceType: 'FinishedProduction',
        referenceId: data.referenceId,
        date: data.date,
        createdBy: data.createdBy,
      },
      tx
    );
  }

  async recordBrandedPackaging(data, tx) {
    const lotNumber = data.lotNumber?.trim();
    if (!lotNumber) {
      throw new AppError('Lot number is required for branded packaging', 400);
    }
    if (!data.brandId) {
      throw new AppError('Brand is required for branded packaging', 400);
    }

    const scope = { lotNumber };
    const consumptions = [
      { qty: data.consumed6No, category: STOCK_CATEGORIES.QUALITY_6NO, label: '6 No' },
      { qty: data.consumed5No, category: STOCK_CATEGORIES.QUALITY_5NO, label: '5 No' },
      { qty: data.consumed4_5No, category: STOCK_CATEGORIES.QUALITY_4_5NO, label: '4.5 No' },
      { qty: data.consumed4No, category: STOCK_CATEGORIES.QUALITY_4NO, label: '4 No' },
      { qty: data.consumedOthers, category: STOCK_CATEGORIES.QUALITY_OTHERS, label: 'Others' },
    ];

    for (const { qty, category, label } of consumptions) {
      if (qty > 0) {
        await validateOutboundCapacity(
          category,
          scope,
          qty,
          tx,
          { referenceType: 'PackagingTransaction', referenceId: data.referenceId, label: `${label} for lot ${lotNumber}` }
        );
      }
    }

    for (const { qty, category } of consumptions) {
      if (qty > 0) {
        await inventoryRepository.createMovement(
          {
            category,
            lotNumber,
            movementType: STOCK_MOVEMENT_TYPES.CONSUMPTION,
            quantity: qty,
            direction: 'out',
            referenceType: 'PackagingTransaction',
            referenceId: data.referenceId,
            date: data.date,
            createdBy: data.createdBy,
          },
          tx
        );
      }
    }

    return inventoryRepository.createMovement(
      {
        category: STOCK_CATEGORIES.BRANDED_GOODS,
        brandId: data.brandId,
        movementType: STOCK_MOVEMENT_TYPES.PRODUCTION,
        quantity: data.packetsCreated,
        direction: 'in',
        referenceType: 'PackagingTransaction',
        referenceId: data.referenceId,
        date: data.date,
        createdBy: data.createdBy,
      },
      tx
    );
  }

  async recordBrandedManufacturingSale(data, tx) {
    return inventoryRepository.createMovement(
      {
        category: STOCK_CATEGORIES.BRANDED_GOODS,
        brandId: data.brandId,
        movementType: STOCK_MOVEMENT_TYPES.SALES,
        quantity: data.packetCount,
        direction: 'out',
        referenceType: 'ManufacturingSale',
        referenceId: data.referenceId,
        date: data.date,
        createdBy: data.createdBy,
      },
      tx
    );
  }

  calculateProportionateConsumption(finishedQty, stocks) {
    const { stock6No = 0, stock5No = 0, stock4_5No = 0, stock4No = 0, stockOthers = 0 } = stocks;
    const totalAvailable = stock6No + stock5No + stock4_5No + stock4No + stockOthers;

    if (totalAvailable === 0) {
      throw new AppError('No quality stock available for proportionate consumption', 400);
    }

    if (finishedQty > totalAvailable) {
      throw new AppError(
        `Insufficient quality stock. Available: ${totalAvailable}, Required: ${finishedQty}`,
        400
      );
    }

    const ratio6 = stock6No / totalAvailable;
    const ratio5 = stock5No / totalAvailable;
    const ratio4_5 = stock4_5No / totalAvailable;
    const ratio4 = stock4No / totalAvailable;
    const ratioOthers = stockOthers / totalAvailable;

    let consumed6No = Math.round(finishedQty * ratio6 * 100) / 100;
    let consumed5No = Math.round(finishedQty * ratio5 * 100) / 100;
    let consumed4_5No = Math.round(finishedQty * ratio4_5 * 100) / 100;
    let consumed4No = Math.round(finishedQty * ratio4 * 100) / 100;
    let consumedOthers = Math.round(finishedQty * ratioOthers * 100) / 100;

    const totalConsumed = consumed6No + consumed5No + consumed4_5No + consumed4No + consumedOthers;
    const diff = finishedQty - totalConsumed;
    if (diff !== 0) {
      const buckets = [
        { key: 'consumed6No', stock: stock6No },
        { key: 'consumed5No', stock: stock5No },
        { key: 'consumed4_5No', stock: stock4_5No },
        { key: 'consumed4No', stock: stock4No },
        { key: 'consumedOthers', stock: stockOthers },
      ];
      const values = { consumed6No, consumed5No, consumed4_5No, consumed4No, consumedOthers };
      for (const { key, stock } of buckets) {
        if (stock >= values[key] + diff) {
          values[key] += diff;
          break;
        }
      }
      ({ consumed6No, consumed5No, consumed4_5No, consumed4No, consumedOthers } = values);
    }

    return { consumed6No, consumed5No, consumed4_5No, consumed4No, consumedOthers };
  }

  async recordTradingPurchase(data, tx) {
    return inventoryRepository.createMovement(
      {
        category: STOCK_CATEGORIES.TRADING,
        item: data.item,
        movementType: STOCK_MOVEMENT_TYPES.PURCHASE,
        quantity: data.quantity,
        direction: 'in',
        referenceType: 'Purchase',
        referenceId: data.referenceId,
        date: data.date,
        createdBy: data.createdBy,
      },
      tx
    );
  }

  async recordTradingSale(data, tx) {
    return inventoryRepository.createMovement(
      {
        category: STOCK_CATEGORIES.TRADING,
        item: data.item,
        movementType: STOCK_MOVEMENT_TYPES.SALES,
        quantity: data.quantity,
        direction: 'out',
        referenceType: 'Sale',
        referenceId: data.referenceId,
        date: data.date,
        createdBy: data.createdBy,
      },
      tx
    );
  }

  async recordManufacturingSale(data, tx) {
    const allocations = data.allocations;
    if (!allocations?.length) {
      throw new AppError('Sale allocations are required for finished goods', 400);
    }

    return inventoryRepository.deductFromBatchesFIFO(
      allocations,
      {
        movementType: STOCK_MOVEMENT_TYPES.SALES,
        direction: 'out',
        referenceType: 'ManufacturingSale',
        referenceId: data.referenceId,
        date: data.date,
        createdBy: data.createdBy,
      },
      tx
    );
  }

  async recordManufacturingDamage(data, tx) {
    const movementBase = {
      movementType: STOCK_MOVEMENT_TYPES.DAMAGE,
      direction: 'out',
      referenceType: 'ManufacturingDamage',
      referenceId: data.referenceId,
      date: data.date,
      createdBy: data.createdBy,
    };

    if (data.category === STOCK_CATEGORIES.RAW_MATERIAL) {
      return inventoryRepository.deductFromLotsFIFO(
        data.category,
        data.quantity,
        movementBase,
        tx
      );
    }

    if (data.category === STOCK_CATEGORIES.FINISHED_GOODS) {
      const { allocations, totalLoss } = await fifoAllocationService.allocateForDamage(
        data.quantity,
        tx
      );
      await fifoAllocationService.applyDamageAllocations(allocations, tx);
      const entries = await inventoryRepository.deductFromBatchesFIFO(
        allocations,
        {
          ...movementBase,
          category: STOCK_CATEGORIES.FINISHED_GOODS,
        },
        tx
      );
      return { entries, totalLoss, allocations };
    }

    return inventoryRepository.createMovement({
      ...movementBase,
      category: data.category,
      quantity: data.quantity,
    }, tx);
  }

  async recordTradingDamage(data, tx) {
    return inventoryRepository.createMovement(
      {
        category: STOCK_CATEGORIES.TRADING,
        item: data.item,
        movementType: STOCK_MOVEMENT_TYPES.DAMAGE,
        quantity: data.quantity,
        direction: 'out',
        referenceType: 'TradingDamage',
        referenceId: data.referenceId,
        date: data.date,
        createdBy: data.createdBy,
      },
      tx
    );
  }

  async getBrandedStockDetail(tx = null) {
    const stockRows = await inventoryRepository.getBrandedStockSummary(tx);
    const brandIds = stockRows.map((r) => r.brandId);
    const brands = brandIds.length
      ? await prisma.brand.findMany({ where: { id: { in: brandIds } } })
      : [];
    const brandMap = new Map(brands.map((b) => [b.id, b]));

    const rows = stockRows.map((row) => {
      const brand = brandMap.get(row.brandId);
      const packetSizeKg = (brand?.packetSizeGrams || 0) / 1000;
      return {
        brandId: row.brandId,
        brand: brand
          ? { id: brand.id, name: brand.name, packetSizeGrams: brand.packetSizeGrams }
          : null,
        brandName: brand?.name || 'Unknown',
        packetSizeGrams: brand?.packetSizeGrams || 0,
        availablePackets: row.balance,
        equivalentWeightKg: Math.round(row.balance * packetSizeKg * 100) / 100,
      };
    });

    return {
      rows,
      totalPackets: rows.reduce((sum, row) => sum + row.availablePackets, 0),
      totalEquivalentKg: Math.round(rows.reduce((sum, row) => sum + row.equivalentWeightKg, 0) * 100) / 100,
    };
  }

  async getStockSummary() {
    const summary = await inventoryRepository.getStockSummary();
    const branded = await this.getBrandedStockDetail();
    summary.brandedStock = branded.rows;
    summary.brandedGoodsTotalPackets = branded.totalPackets;
    summary.brandedGoodsEquivalentKg = branded.totalEquivalentKg;
    return summary;
  }

  async getLotWiseStock(lotNumber) {
    return inventoryRepository.getLotWiseStock(lotNumber);
  }

  async getLedgerEntries(filters, pagination) {
    return inventoryRepository.getLedgerEntries(filters, pagination);
  }

  async getInventoryTrend(startDate, endDate) {
    return inventoryRepository.getInventoryTrend(startDate, endDate);
  }

  async validateDeleteMovementsByReference(referenceType, referenceId, tx = null) {
    return inventoryRepository.validateDeleteMovementsByReference(
      referenceType,
      referenceId,
      tx
    );
  }

  async validateEditStockImpact(referenceType, referenceId, newEffectsMap, tx, context = {}) {
    return inventoryRepository.validateReplaceReferenceStock(
      referenceType,
      referenceId,
      newEffectsMap,
      tx,
      context
    );
  }

  async deleteMovementsByReference(referenceType, referenceId, tx = null, options = {}) {
    return inventoryRepository.deleteMovementsByReference(
      referenceType,
      referenceId,
      tx,
      options
    );
  }

  async getAvailableRawMaterialLots() {
    return inventoryRepository.getAvailableRawMaterialLots();
  }

  async getAvailableWipLots(tx = null) {
    return inventoryRepository.getAvailableWipLots(tx);
  }

  async getWipBalance(tx = null) {
    return inventoryRepository.getTotalCategoryBalance(STOCK_CATEGORIES.WIP, tx);
  }

  async getBrandedStockSummary(tx = null) {
    return inventoryRepository.getBrandedStockSummary(tx);
  }

  async getBrandStockBalance(brandId, tx = null) {
    return inventoryRepository.getCurrentBalance(
      STOCK_CATEGORIES.BRANDED_GOODS,
      { brandId },
      tx
    );
  }

  async withTransaction(callback) {
    return runTransaction(async (tx) => callback(tx));
  }
}

export default new InventoryService();

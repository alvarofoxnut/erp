import { prisma } from '../../config/db.js';
import inventoryRepository from '../inventory/inventory.repository.js';
import inventoryValuationService from '../inventory/inventoryValuation.service.js';
import manufacturingService from '../manufacturing/manufacturing.service.js';
import { STOCK_CATEGORIES, MANUFACTURING_DAMAGE_INVENTORY_TYPES } from '../../shared/constants/index.js';
import AppError from '../../shared/utils/AppError.js';

const round2 = (n) => Math.round((n || 0) * 100) / 100;

const QUALITY_GRADE_LABELS = {
  [STOCK_CATEGORIES.QUALITY_6NO]: '6 No',
  [STOCK_CATEGORIES.QUALITY_5NO]: '5 No',
  [STOCK_CATEGORIES.QUALITY_4_5NO]: '4.5 No',
  [STOCK_CATEGORIES.QUALITY_4NO]: '4 No',
  [STOCK_CATEGORIES.QUALITY_OTHERS]: 'Others',
};

const QUALITY_RATE_KEYS = {
  [STOCK_CATEGORIES.QUALITY_6NO]: 'rate6No',
  [STOCK_CATEGORIES.QUALITY_5NO]: 'rate5No',
  [STOCK_CATEGORIES.QUALITY_4_5NO]: 'rate4_5No',
  [STOCK_CATEGORIES.QUALITY_4NO]: 'rate4No',
  [STOCK_CATEGORIES.QUALITY_OTHERS]: 'rateOthers',
};

async function getLotOthersRate(lotNumber, tx = prisma) {
  const productions = await tx.qualityProduction.findMany({
    where: { lotNumber },
    select: { quantityOthers: true, rateOthers: true },
  });
  let qty = 0;
  let val = 0;
  for (const row of productions) {
    if (row.quantityOthers > 0) {
      qty += row.quantityOthers;
      val += row.quantityOthers * (row.rateOthers || 0);
    }
  }
  return qty > 0 ? round2(val / qty) : 0;
}

class DamageStockOptionsService {
  async getManufacturingOptions(inventoryType, tx = prisma) {
    if (!MANUFACTURING_DAMAGE_INVENTORY_TYPES.includes(inventoryType)) {
      throw new AppError(`Invalid inventory type: ${inventoryType}`, 400);
    }

    if (inventoryType === STOCK_CATEGORIES.FINISHED_GOODS) {
      const batches = await tx.finishedProduction.findMany({
        where: { remainingQuantity: { gt: 0 } },
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          batchNumber: true,
          lotNumber: true,
          remainingQuantity: true,
          finishedRate: true,
        },
      });
      return batches.map((b) => ({
        key: b.id,
        batchId: b.id,
        batchNumber: b.batchNumber,
        lotNumber: b.lotNumber,
        label: b.batchNumber,
        availableQty: round2(b.remainingQuantity),
        costPerKg: round2(b.finishedRate),
      }));
    }

    if (inventoryType === STOCK_CATEGORIES.RAW_MATERIAL) {
      const lots = await inventoryRepository.getLotsWithBalance(STOCK_CATEGORIES.RAW_MATERIAL, tx);
      const rates = await inventoryValuationService.loadLotRawPurchaseRates(new Date());
      return lots.map(({ lotNumber, balance }) => ({
        key: lotNumber,
        lotNumber,
        label: lotNumber,
        availableQty: round2(balance),
        costPerKg: round2(rates.get(lotNumber) || 0),
      }));
    }

    const lots = await inventoryRepository.getLotsWithBalance(inventoryType, tx);
    const options = [];

    for (const { lotNumber, balance } of lots) {
      const rates = await manufacturingService.getLotQualityRates(lotNumber, tx);
      const rateKey = QUALITY_RATE_KEYS[inventoryType];
      let costPerKg = rateKey ? round2(rates[rateKey] || 0) : 0;
      if (inventoryType === STOCK_CATEGORIES.QUALITY_OTHERS) {
        costPerKg = await getLotOthersRate(lotNumber, tx);
      }
      const gradeLabel = QUALITY_GRADE_LABELS[inventoryType] || inventoryType;
      options.push({
        key: `${lotNumber}|${inventoryType}`,
        lotNumber,
        label: `${lotNumber} → ${gradeLabel}`,
        availableQty: round2(balance),
        costPerKg,
      });
    }

    return options;
  }

  async resolveManufacturingLine(line, tx = prisma) {
    const { inventoryType, lotNumber, batchId, quantity } = line;
    const qty = round2(quantity);

    if (inventoryType === STOCK_CATEGORIES.FINISHED_GOODS) {
      if (!batchId) throw new AppError('Finished goods damage requires a batch selection', 400);
      const batch = await tx.finishedProduction.findUnique({
        where: { id: String(batchId) },
        select: {
          id: true,
          batchNumber: true,
          lotNumber: true,
          remainingQuantity: true,
          finishedRate: true,
        },
      });
      if (!batch) throw new AppError('Selected FG batch not found', 404);
      return {
        inventoryType,
        lotNumber: batch.lotNumber,
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        quantity: qty,
        costPerKg: round2(batch.finishedRate),
        lossAmount: round2(qty * batch.finishedRate),
        availableQty: round2(batch.remainingQuantity),
      };
    }

    const lot = lotNumber?.trim();
    if (!lot) throw new AppError('Lot number is required for this inventory type', 400);

    const options = await this.getManufacturingOptions(inventoryType, tx);
    const match = options.find((o) => o.lotNumber === lot);

    let costPerKg = match?.costPerKg ?? 0;
    let availableQty = match?.availableQty ?? 0;

    if (!match) {
      const balance = await inventoryRepository.getCurrentBalance(
        inventoryType,
        { lotNumber: lot },
        tx
      );
      availableQty = round2(balance);
      if (availableQty <= 0) {
        throw new AppError(`No available stock for lot ${lot} in ${inventoryType}`, 400);
      }

      if (inventoryType === STOCK_CATEGORIES.RAW_MATERIAL) {
        const rates = await inventoryValuationService.loadLotRawPurchaseRates(new Date());
        costPerKg = round2(rates.get(lot) || 0);
      } else {
        const rates = await manufacturingService.getLotQualityRates(lot, tx);
        const rateKey = QUALITY_RATE_KEYS[inventoryType];
        costPerKg = rateKey ? round2(rates[rateKey] || 0) : 0;
        if (inventoryType === STOCK_CATEGORIES.QUALITY_OTHERS) {
          costPerKg = await getLotOthersRate(lot, tx);
        }
      }
    }

    if (costPerKg <= 0) {
      throw new AppError(`Could not resolve cost price for lot ${lot}`, 400);
    }

    return {
      inventoryType,
      lotNumber: lot,
      batchId: null,
      batchNumber: null,
      quantity: qty,
      costPerKg,
      lossAmount: round2(qty * costPerKg),
      availableQty,
    };
  }

  async getTradingOption(itemId, tx = prisma) {
    const id = String(itemId);
    const item = await tx.item.findUnique({
      where: { id },
      select: { id: true, name: true, unit: true },
    });
    if (!item) throw new AppError('Product not found', 404);

    const availableQty = round2(
      await inventoryRepository.getCurrentBalance(STOCK_CATEGORIES.TRADING, { item: id }, tx)
    );
    const costPerUnit = round2(await inventoryValuationService.getTradingItemWac(id, new Date()));

    return {
      itemId: item.id,
      itemName: item.name,
      unit: item.unit,
      availableQty,
      costPerUnit,
    };
  }

  async resolveTradingLine(line, tx = prisma) {
    const itemId = String(line.itemId || line.item);
    const qty = round2(line.quantity);
    const option = await this.getTradingOption(itemId, tx);

    return {
      itemId: option.itemId,
      quantity: qty,
      costPerUnit: option.costPerUnit,
      lossAmount: round2(qty * option.costPerUnit),
      availableQty: option.availableQty,
    };
  }
}

export default new DamageStockOptionsService();

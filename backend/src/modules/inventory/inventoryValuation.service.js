import { prisma } from '../../config/db.js';

import { STOCK_CATEGORIES, BUSINESS_UNITS } from '../../shared/constants/index.js';

import inventoryRepository from './inventory.repository.js';
import packagingService from '../manufacturing/packaging.service.js';

import { endOfDay } from '../../shared/utils/stockDates.js';



const round2 = (n) => Math.round((n || 0) * 100) / 100;



const QUALITY_CATEGORIES = [

  STOCK_CATEGORIES.QUALITY_6NO,

  STOCK_CATEGORIES.QUALITY_5NO,

  STOCK_CATEGORIES.QUALITY_4_5NO,

  STOCK_CATEGORIES.QUALITY_4NO,

  STOCK_CATEGORIES.QUALITY_OTHERS,

];



const LOT_VALUED_CATEGORIES = new Set([

  STOCK_CATEGORIES.RAW_MATERIAL,

  STOCK_CATEGORIES.WIP,

  ...QUALITY_CATEGORIES,

]);



const QUALITY_CATEGORY_FIELDS = [

  [STOCK_CATEGORIES.QUALITY_6NO, 'quantity6No', 'rate6No'],

  [STOCK_CATEGORIES.QUALITY_5NO, 'quantity5No', 'rate5No'],

  [STOCK_CATEGORIES.QUALITY_4_5NO, 'quantity4_5No', 'rate4_5No'],

  [STOCK_CATEGORIES.QUALITY_4NO, 'quantity4No', 'rate4No'],

  [STOCK_CATEGORIES.QUALITY_OTHERS, 'quantityOthers', 'rateOthers'],

];



/**

 * Weighted average cost (WAC) from purchase transactions on or before asOfDate.

 * Used as fallback when lot-specific rates are unavailable.

 */

class InventoryValuationService {

  async getRawMaterialWac(asOfDate) {

    const end = endOfDay(asOfDate);

    const agg = await prisma.rawPurchase.aggregate({

      where: { date: { lte: end } },

      _sum: { quantity: true, totalAmount: true },

    });

    const qty = agg._sum.quantity || 0;

    const amt = agg._sum.totalAmount || 0;

    return qty > 0 ? amt / qty : 0;

  }



  async getFinishedGoodsWac(asOfDate) {

    return this.getRawMaterialWac(asOfDate);

  }



  async getTradingItemWac(itemId, asOfDate) {

    const end = endOfDay(asOfDate);

    const agg = await prisma.purchase.aggregate({

      where: { date: { lte: end }, itemId: String(itemId) },

      _sum: { quantity: true, amount: true },

    });

    const qty = agg._sum.quantity || 0;

    const amt = agg._sum.amount || 0;

    return qty > 0 ? amt / qty : 0;

  }



  async getCategoryWac(category, asOfDate) {

    if (category === STOCK_CATEGORIES.FINISHED_GOODS) {

      return this.getFinishedGoodsWac(asOfDate);

    }

    if (category === STOCK_CATEGORIES.TRADING) {

      const end = endOfDay(asOfDate);

      const agg = await prisma.purchase.aggregate({

        where: { date: { lte: end } },

        _sum: { quantity: true, amount: true },

      });

      const qty = agg._sum.quantity || 0;

      const amt = agg._sum.amount || 0;

      return qty > 0 ? amt / qty : 0;

    }

    return this.getRawMaterialWac(asOfDate);

  }



  async loadLotRawPurchaseRates(asOfDate) {

    const end = endOfDay(asOfDate);

    const purchases = await prisma.rawPurchase.findMany({

      where: { date: { lte: end } },

      select: { lotNumber: true, quantity: true, totalAmount: true },

    });



    const byLot = new Map();

    for (const purchase of purchases) {

      const lot = purchase.lotNumber?.trim();

      if (!lot) continue;

      const entry = byLot.get(lot) || { qty: 0, amt: 0 };

      entry.qty += purchase.quantity || 0;

      entry.amt += purchase.totalAmount || 0;

      byLot.set(lot, entry);

    }



    const rates = new Map();

    for (const [lot, { qty, amt }] of byLot) {

      rates.set(lot, qty > 0 ? amt / qty : 0);

    }

    return rates;

  }



  async loadLotQualityRates(asOfDate) {

    const end = endOfDay(asOfDate);

    const productions = await prisma.qualityProduction.findMany({

      where: {

        date: { lte: end },

        lotNumber: { not: null },

      },

      select: {

        lotNumber: true,

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



    const accum = new Map();

    for (const production of productions) {

      const lot = production.lotNumber?.trim();

      if (!lot) continue;



      for (const [category, qtyField, rateField] of QUALITY_CATEGORY_FIELDS) {

        const qty = production[qtyField] || 0;

        if (qty <= 0) continue;

        const rate = production[rateField] || 0;

        const key = `${lot}|${category}`;

        const prev = accum.get(key) || { qty: 0, value: 0 };

        prev.qty += qty;

        prev.value += qty * rate;

        accum.set(key, prev);

      }

    }



    const rates = new Map();

    for (const [key, { qty, value }] of accum) {

      rates.set(key, qty > 0 ? value / qty : 0);

    }

    return rates;

  }



  async valuateFinishedGoodsByBatch(asOfDate) {

    const batchBalances = await inventoryRepository.getLatestBatchBalancesAsOf(asOfDate);

    if (!batchBalances.length) {

      return {

        category: STOCK_CATEGORIES.FINISHED_GOODS,

        quantity: 0,

        value: 0,

      };

    }



    const batchIds = batchBalances.map((b) => b.batchId);

    const batches = await prisma.finishedProduction.findMany({

      where: { id: { in: batchIds } },

      select: { id: true, finishedRate: true },

    });

    const rateById = new Map(batches.map((b) => [b.id, b.finishedRate || 0]));



    let totalQty = 0;

    let totalValue = 0;

    for (const { batchId, balance } of batchBalances) {

      const qty = round2(balance);

      if (qty === 0) continue;

      const rate = round2(rateById.get(batchId) || 0);

      totalQty = round2(totalQty + qty);

      totalValue = round2(totalValue + qty * rate);

    }



    return {

      category: STOCK_CATEGORIES.FINISHED_GOODS,

      quantity: totalQty,

      value: totalValue,

    };

  }



  resolveLotRate(category, lotNumber, rateCaches, fallbackRate) {

    if (!lotNumber) return fallbackRate;



    if (category === STOCK_CATEGORIES.RAW_MATERIAL || category === STOCK_CATEGORIES.WIP) {

      return rateCaches.rawRatesByLot.get(lotNumber) ?? fallbackRate;

    }



    if (QUALITY_CATEGORIES.includes(category)) {

      const key = `${lotNumber}|${category}`;

      return (

        rateCaches.qualityRatesByLot.get(key)

        ?? rateCaches.rawRatesByLot.get(lotNumber)

        ?? fallbackRate

      );

    }



    return fallbackRate;

  }



  valuateQuantity(quantity, rate) {

    const qty = round2(quantity);

    return {

      quantity: qty,

      value: round2(qty * rate),

      rate: round2(rate),

    };

  }



  async valuateCategoryLine(category, quantity, asOfDate) {

    const rate = await this.getCategoryWac(category, asOfDate);

    return {

      ...this.valuateQuantity(quantity, rate),

      category,

    };

  }



  async valuateCategoryByLot(category, asOfDate, rateCaches) {

    const scopes = await inventoryRepository.getLatestScopeBalancesAsOf(category, asOfDate);

    const fallbackRate = await this.getCategoryWac(category, asOfDate);

    let totalQty = 0;

    let totalValue = 0;

    for (const scope of scopes) {

      const qty = round2(scope.balance);

      if (qty === 0) continue;

      const lotNumber = scope.lotNumber?.trim() || null;

      const rate = this.resolveLotRate(category, lotNumber, rateCaches, fallbackRate);

      totalQty = round2(totalQty + qty);

      totalValue = round2(totalValue + qty * rate);

    }

    return {

      category,

      quantity: totalQty,

      value: totalValue,

    };

  }



  async getManufacturingStockPosition(asOfDate, categoryKeys) {

    const rateCaches = {

      rawRatesByLot: await this.loadLotRawPurchaseRates(asOfDate),

      qualityRatesByLot: await this.loadLotQualityRates(asOfDate),

    };



    const lines = [];

    for (const category of categoryKeys) {

      if (category === STOCK_CATEGORIES.FINISHED_GOODS) {

        lines.push(await this.valuateFinishedGoodsByBatch(asOfDate));

      } else if (LOT_VALUED_CATEGORIES.has(category)) {

        lines.push(await this.valuateCategoryByLot(category, asOfDate, rateCaches));

      } else {

        const quantity = await inventoryRepository.getCategoryQuantityAsOf(

          category,

          asOfDate

        );

        lines.push(await this.valuateCategoryLine(category, quantity, asOfDate));

      }

    }



    return {

      lines,

      quantity: round2(lines.reduce((s, l) => s + l.quantity, 0)),

      value: round2(lines.reduce((s, l) => s + l.value, 0)),

      asOfDate: endOfDay(asOfDate),

    };

  }



  async valuateBrandedGoods(asOfDate) {

    const balances = await inventoryRepository.getBrandedStockBalancesAsOf(asOfDate);

    const brandIds = balances.map((row) => row.brandId);

    const brands = brandIds.length

      ? await prisma.brand.findMany({

        where: { id: { in: brandIds } },

        select: { id: true, name: true, packetSizeGrams: true },

      })

      : [];

    const brandMap = new Map(brands.map((brand) => [brand.id, brand]));



    const lines = [];

    for (const { brandId, balance: packets } of balances) {

      const brand = brandMap.get(brandId);

      const packetSizeKg = (brand?.packetSizeGrams || 0) / 1000;

      const equivalentKg = round2(packets * packetSizeKg);

      const costPerPacket = await packagingService.getBrandedWeightedAvgCostAsOf(brandId, asOfDate);

      const value = round2(packets * costPerPacket);

      const brandName = brand?.name || 'Unknown Brand';



      lines.push({

        key: brandId,

        brandId,

        category: STOCK_CATEGORIES.BRANDED_GOODS,

        label: `${brandName} (${round2(packets)} pkts)`,

        packets,

        packetSizeGrams: brand?.packetSizeGrams || 0,

        quantity: equivalentKg,

        value,

      });

    }



    return {

      lines,

      quantity: round2(lines.reduce((sum, line) => sum + line.quantity, 0)),

      value: round2(lines.reduce((sum, line) => sum + line.value, 0)),

      asOfDate: endOfDay(asOfDate),

    };

  }



  async getTradingStockPosition(asOfDate) {

    const itemBalances = await inventoryRepository.getTradingItemBalancesAsOf(

      asOfDate

    );

    const items = await prisma.item.findMany({

      where: { id: { in: itemBalances.map((b) => b.itemId) } },

      select: { id: true, name: true },

    });

    const nameById = new Map(items.map((i) => [String(i.id), i.name]));



    const lines = [];

    for (const { itemId, quantity } of itemBalances) {

      if (quantity === 0) continue;

      const rate = await this.getTradingItemWac(itemId, asOfDate);

      const valued = this.valuateQuantity(quantity, rate);

      lines.push({

        key: itemId,

        label: nameById.get(String(itemId)) || 'Trading Item',

        itemId,

        ...valued,

      });

    }



    return {

      lines,

      quantity: round2(lines.reduce((s, l) => s + l.quantity, 0)),

      value: round2(lines.reduce((s, l) => s + l.value, 0)),

      asOfDate: endOfDay(asOfDate),

    };

  }



  async getUnitStockPosition(businessUnit, asOfDate, mfgCategories) {

    if (businessUnit === BUSINESS_UNITS.MANUFACTURING) {

      return this.getManufacturingStockPosition(asOfDate, mfgCategories);

    }

    return this.getTradingStockPosition(asOfDate);

  }

}



export default new InventoryValuationService();


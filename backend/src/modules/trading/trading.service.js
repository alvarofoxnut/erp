import { prisma } from '../../config/db.js';
import { withTransaction } from '../../shared/utils/transaction.js';
import { buildSearchFilter, buildDateRange } from '../../shared/utils/query.js';
import inventoryService from '../inventory/inventory.service.js';
import accountingService from '../accounting/accounting.service.js';
import { STOCK_CATEGORIES } from '../../shared/constants/index.js';
import { validateOutboundCapacity, buildNetEffectsMap, netInbound, netOutbound } from '../inventory/stockValidation.js';
import AppError from '../../shared/utils/AppError.js';
import {
  ACTIVE_ONLY,
  buildListFilter,
  softDeletePayload,
  restorePayload,
  assertNotDeleted,
  assertIsDeleted,
  softDeleteInvoice,
} from '../../shared/utils/softDelete.js';

function normalizeItemInput(data = {}) {
  const normalized = { ...data };

  if ('name' in normalized && normalized.name != null) {
    normalized.name = String(normalized.name).trim();
  }

  if ('sku' in normalized) {
    const sku = normalized.sku == null ? '' : String(normalized.sku).trim();
    normalized.sku = sku || null;
  }

  if ('description' in normalized) {
    const description = normalized.description == null ? '' : String(normalized.description).trim();
    normalized.description = description || null;
  }

  return normalized;
}

async function assertItemUnique({ name, sku }, excludeId = null) {
  const notCurrent = excludeId ? { NOT: { id: excludeId } } : {};

  if (name) {
    const existingByName = await prisma.item.findFirst({
      where: { name, ...notCurrent },
    });
    if (existingByName) {
      throw new AppError('An item with this name already exists', 409);
    }
  }

  if (sku) {
    const existingBySku = await prisma.item.findFirst({
      where: { sku, ...notCurrent },
    });
    if (existingBySku) {
      throw new AppError('An item with this SKU already exists', 409);
    }
  }
}

function mapItemUniqueError(error) {
  if (error.code !== 'P2002') return error;

  const field = error.meta?.target?.[0];
  if (field === 'sku') {
    return new AppError('An item with this SKU already exists', 409);
  }
  if (field === 'name') {
    return new AppError('An item with this name already exists', 409);
  }
  return new AppError('An item with these details already exists', 409);
}

const PARTY_LIST_INCLUDE = {
  suppliedItems: {
    include: {
      item: { select: { id: true, name: true, unit: true } },
    },
  },
};

const PURCHASE_LIST_INCLUDE = {
  party: { select: { id: true, name: true, type: true } },
  item: { select: { id: true, name: true, unit: true } },
};

const SALE_LIST_INCLUDE = {
  item: { select: { id: true, name: true, unit: true } },
};

function formatParty(party) {
  if (!party) return party;
  const { suppliedItems, ...rest } = party;
  return {
    ...rest,
    suppliedItems: suppliedItems?.map((link) => link.item) ?? [],
  };
}

function pickPartyData(data) {
  const {
    suppliedItems: _suppliedItems,
    party: _party,
    item: _item,
    createdBy: _createdBy,
    ...fields
  } = data;
  return fields;
}

function toPurchaseWriteData(data, userId, serialNumber) {
  return {
    serialNumber,
    date: new Date(data.date),
    partyId: data.party,
    itemId: data.item,
    quantity: data.quantity,
    rate: data.rate ?? 0,
    amount: data.amount,
    createdById: userId,
  };
}

function toPurchaseUpdateData(data) {
  return {
    date: data.date ? new Date(data.date) : undefined,
    partyId: data.party,
    itemId: data.item,
    quantity: data.quantity,
    rate: data.rate,
    amount: data.amount,
  };
}

function toSaleWriteData(data, userId, serialNumber) {
  return {
    serialNumber,
    date: new Date(data.date),
    customerName: data.customerName,
    customerPhone: data.customerPhone,
    customerEmail: data.customerEmail,
    customerAddress: data.customerAddress,
    customerGstNumber: data.customerGstNumber,
    itemId: data.item,
    quantity: data.quantity,
    rate: data.rate ?? 0,
    amount: data.amount,
    createdById: userId,
  };
}

function toSaleUpdateData(data) {
  return {
    date: data.date ? new Date(data.date) : undefined,
    customerName: data.customerName,
    customerPhone: data.customerPhone,
    customerEmail: data.customerEmail,
    customerAddress: data.customerAddress,
    customerGstNumber: data.customerGstNumber,
    itemId: data.item,
    quantity: data.quantity,
    rate: data.rate,
    amount: data.amount,
  };
}

class TradingService {
  async generateSerialNumber(prefix, tx = prisma) {
    const count =
      prefix === 'PUR' ? await tx.purchase.count() : await tx.sale.count();
    const year = new Date().getFullYear().toString().slice(-2);
    return `${prefix}-${year}-${String(count + 1).padStart(5, '0')}`;
  }

  // Items
  async getItems({ search, startDate, endDate, page = 1, limit = 10 }) {
    const where = buildListFilter({
      ...buildSearchFilter(search, ['name', 'sku', 'description']),
    });
    const createdAt = buildDateRange(startDate, endDate);
    if (createdAt) where.createdAt = createdAt;

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      prisma.item.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
      prisma.item.count({ where }),
    ]);

    return { items, total };
  }

  async createItem(data, userId) {
    const normalized = normalizeItemInput(data);
    await assertItemUnique(normalized);

    try {
      return await prisma.item.create({
        data: { ...normalized, createdById: userId },
      });
    } catch (error) {
      throw mapItemUniqueError(error);
    }
  }

  async updateItem(id, data) {
    const normalized = normalizeItemInput(data);
    await assertItemUnique(normalized, id);

    try {
      return await prisma.item.update({
        where: { id },
        data: normalized,
      });
    } catch (error) {
      if (error.code === 'P2025') throw new AppError('Item not found', 404);
      throw mapItemUniqueError(error);
    }
  }

  async deleteItem(id, userId, deleteReason) {
    try {
      const existing = await prisma.item.findUnique({ where: { id } });
      assertNotDeleted(existing, 'Item');

      return await prisma.item.update({
        where: { id },
        data: softDeletePayload(userId, deleteReason, { deactivate: true }),
      });
    } catch (error) {
      if (error.code === 'P2025') throw new AppError('Item not found', 404);
      throw error;
    }
  }

  // Parties (vendors for purchases)
  async getParties({ search, type, item, startDate, endDate, page = 1, limit = 10 }) {
    const where = buildListFilter({
      ...buildSearchFilter(search, ['name', 'contactPerson', 'phone', 'email']),
    });

    if (type === 'vendor') where.type = { in: ['vendor', 'both'] };
    else if (type === 'customer') where.type = { in: ['customer', 'both'] };
    else if (type) where.type = type;

    if (item) {
      where.suppliedItems = { some: { itemId: item } };
    }

    const createdAt = buildDateRange(startDate, endDate);
    if (createdAt) where.createdAt = createdAt;

    const skip = (page - 1) * limit;
    const [parties, total] = await Promise.all([
      prisma.party.findMany({
        where,
        include: PARTY_LIST_INCLUDE,
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
      prisma.party.count({ where }),
    ]);

    return { parties: parties.map(formatParty), total };
  }

  async createParty(data, userId) {
    const { suppliedItems, ...partyData } = data;
    const party = await prisma.party.create({
      data: {
        ...pickPartyData(partyData),
        createdById: userId,
        ...(suppliedItems?.length
          ? {
              suppliedItems: {
                create: suppliedItems.map((itemId) => ({ itemId })),
              },
            }
          : {}),
      },
      include: PARTY_LIST_INCLUDE,
    });

    return formatParty(party);
  }

  async updateParty(id, data) {
    const { suppliedItems, ...partyData } = data;

    try {
      if (suppliedItems !== undefined) {
        await prisma.partySuppliedItem.deleteMany({ where: { partyId: id } });
      }

      const party = await prisma.party.update({
        where: { id },
        data: {
          ...pickPartyData(partyData),
          ...(suppliedItems?.length
            ? {
                suppliedItems: {
                  create: suppliedItems.map((itemId) => ({ itemId })),
                },
              }
            : {}),
        },
        include: PARTY_LIST_INCLUDE,
      });

      return formatParty(party);
    } catch (error) {
      if (error.code === 'P2025') throw new AppError('Party not found', 404);
      throw error;
    }
  }

  async deleteParty(id, userId, deleteReason) {
    try {
      const existing = await prisma.party.findUnique({ where: { id } });
      assertNotDeleted(existing, 'Party');

      const party = await prisma.party.update({
        where: { id },
        data: softDeletePayload(userId, deleteReason, { deactivate: true }),
        include: PARTY_LIST_INCLUDE,
      });
      return formatParty(party);
    } catch (error) {
      if (error.code === 'P2025') throw new AppError('Party not found', 404);
      throw error;
    }
  }

  async validateTradingStock(itemId, quantity, tx, referenceType = null, referenceId = null) {
    await validateOutboundCapacity(
      STOCK_CATEGORIES.TRADING,
      { item: itemId },
      quantity,
      tx,
      { referenceType, referenceId, label: 'trading' }
    );
  }

  tradingPurchaseEditEffects(existing, data) {
    const entries = [
      netInbound(STOCK_CATEGORIES.TRADING, { item: data.item }, data.quantity),
    ];
    if (String(existing.itemId) !== String(data.item)) {
      entries.push(netInbound(STOCK_CATEGORIES.TRADING, { item: existing.itemId }, 0));
    }
    return buildNetEffectsMap(entries);
  }

  tradingSaleEditEffects(existing, data) {
    const entries = [
      netOutbound(STOCK_CATEGORIES.TRADING, { item: data.item }, data.quantity),
    ];
    if (String(existing.itemId) !== String(data.item)) {
      entries.push(netOutbound(STOCK_CATEGORIES.TRADING, { item: existing.itemId }, 0));
    }
    return buildNetEffectsMap(entries);
  }

  // Purchases
  async createPurchase(data, userId) {
    return withTransaction(async (tx) => {
      const party = await tx.party.findUnique({
        where: { id: data.party },
        include: { suppliedItems: true },
      });
      assertNotDeleted(party, 'Party');

      if (!['vendor', 'both'].includes(party.type)) {
        throw new AppError('Selected party must be a vendor', 400);
      }

      if (
        party.suppliedItems?.length &&
        !party.suppliedItems.some((link) => link.itemId === data.item)
      ) {
        throw new AppError('Selected vendor does not supply this item', 400);
      }

      const itemDoc = await tx.item.findUnique({ where: { id: data.item } });
      assertNotDeleted(itemDoc, 'Item');
      const serialNumber = data.serialNumber || (await this.generateSerialNumber('PUR', tx));

      const purchase = await tx.purchase.create({
        data: toPurchaseWriteData(data, userId, serialNumber),
      });

      await inventoryService.recordTradingPurchase(
        {
          item: data.item,
          quantity: data.quantity,
          referenceId: purchase.id,
          date: data.date,
          createdBy: userId,
        },
        tx
      );

      await accountingService.recordTradingPurchase(
        purchase,
        { partyName: party.name, itemName: itemDoc?.name },
        tx
      );

      return purchase;
    });
  }

  async getPurchases({ search, startDate, endDate, party, item, page = 1, limit = 10 }) {
    const where = { ...ACTIVE_ONLY };

    if (party) where.partyId = party;
    if (item) where.itemId = item;

    const searchFilter = buildSearchFilter(search, ['serialNumber']);
    if (searchFilter) Object.assign(where, searchFilter);

    const date = buildDateRange(startDate, endDate);
    if (date) where.date = date;

    const skip = (page - 1) * limit;
    const [purchases, total] = await Promise.all([
      prisma.purchase.findMany({
        where,
        include: PURCHASE_LIST_INCLUDE,
        orderBy: { date: 'desc' },
        skip,
        take: limit,
      }),
      prisma.purchase.count({ where }),
    ]);

    return { purchases, total };
  }

  // Sales
  async createSale(data, userId) {
    return withTransaction(async (tx) => {
      const itemDoc = await tx.item.findUnique({ where: { id: data.item } });
      assertNotDeleted(itemDoc, 'Item');
      await this.validateTradingStock(data.item, data.quantity, tx);

      const serialNumber = data.serialNumber || (await this.generateSerialNumber('SAL', tx));

      const sale = await tx.sale.create({
        data: toSaleWriteData(data, userId, serialNumber),
      });

      await inventoryService.recordTradingSale(
        {
          item: data.item,
          quantity: data.quantity,
          referenceId: sale.id,
          date: data.date,
          createdBy: userId,
        },
        tx
      );

      await accountingService.recordTradingSale(sale, { itemName: itemDoc?.name }, tx);

      return sale;
    });
  }

  async getSales({ search, startDate, endDate, item, page = 1, limit = 10 }) {
    const where = { ...ACTIVE_ONLY };

    if (item) where.itemId = item;

    const searchFilter = buildSearchFilter(search, ['serialNumber', 'customerName']);
    if (searchFilter) Object.assign(where, searchFilter);

    const date = buildDateRange(startDate, endDate);
    if (date) where.date = date;

    const skip = (page - 1) * limit;
    const [sales, total] = await Promise.all([
      prisma.sale.findMany({
        where,
        include: SALE_LIST_INCLUDE,
        orderBy: { date: 'desc' },
        skip,
        take: limit,
      }),
      prisma.sale.count({ where }),
    ]);

    return { sales, total };
  }

  async updatePurchase(id, data) {
    return withTransaction(async (tx) => {
      const existing = await tx.purchase.findUnique({ where: { id } });
      assertNotDeleted(existing, 'Purchase');
      const nextPartyId = data.party ?? existing.partyId;
      const nextItemId = data.item ?? existing.itemId;
      const nextQuantity = data.quantity ?? existing.quantity;

      const party = await tx.party.findUnique({ where: { id: nextPartyId } });
      assertNotDeleted(party, 'Party');
      const itemDoc = await tx.item.findUnique({ where: { id: nextItemId } });
      assertNotDeleted(itemDoc, 'Item');

      await inventoryService.validateEditStockImpact(
        'Purchase',
        existing.id,
        this.tradingPurchaseEditEffects(existing, { item: nextItemId, quantity: nextQuantity }),
        tx,
        { label: 'trading stock' }
      );
      await accountingService.deleteLedgerEntriesByReference('Purchase', existing.id, tx);
      await inventoryService.deleteMovementsByReference('Purchase', existing.id, tx, {
        skipValidation: true,
      });

      const purchase = await tx.purchase.update({
        where: { id },
        data: toPurchaseUpdateData(data),
      });

      await inventoryService.recordTradingPurchase(
        {
          item: purchase.itemId,
          quantity: purchase.quantity,
          referenceId: purchase.id,
          date: purchase.date,
          createdBy: existing.createdById,
        },
        tx
      );

      await accountingService.recordTradingPurchase(
        purchase,
        { partyName: party?.name, itemName: itemDoc?.name },
        tx
      );

      return purchase;
    });
  }

  async deletePurchase(id, userId, deleteReason) {
    return withTransaction(async (tx) => {
      const existing = await tx.purchase.findUnique({ where: { id } });
      assertNotDeleted(existing, 'Purchase');
      await softDeleteInvoice(tx, { tradingPurchaseId: id }, userId, deleteReason);

      await inventoryService.validateDeleteMovementsByReference('Purchase', existing.id, tx);
      await accountingService.deleteLedgerEntriesByReference('Purchase', existing.id, tx);
      await inventoryService.deleteMovementsByReference('Purchase', existing.id, tx);
      await tx.purchase.update({
        where: { id },
        data: softDeletePayload(userId, deleteReason),
      });
    });
  }

  async updateSale(id, data) {
    return withTransaction(async (tx) => {
      const existing = await tx.sale.findUnique({ where: { id } });
      assertNotDeleted(existing, 'Sale');
      const nextItemId = data.item ?? existing.itemId;
      const nextQuantity = data.quantity ?? existing.quantity;

      const itemDoc = await tx.item.findUnique({ where: { id: nextItemId } });
      assertNotDeleted(itemDoc, 'Item');

      await inventoryService.validateEditStockImpact(
        'Sale',
        existing.id,
        this.tradingSaleEditEffects(existing, { item: nextItemId, quantity: nextQuantity }),
        tx,
        { label: 'trading stock' }
      );
      await accountingService.deleteLedgerEntriesByReference('Sale', existing.id, tx);
      await inventoryService.deleteMovementsByReference('Sale', existing.id, tx, {
        skipValidation: true,
      });

      const sale = await tx.sale.update({
        where: { id },
        data: toSaleUpdateData(data),
      });

      await inventoryService.recordTradingSale(
        {
          item: sale.itemId,
          quantity: sale.quantity,
          referenceId: sale.id,
          date: sale.date,
          createdBy: existing.createdById,
        },
        tx
      );

      await accountingService.recordTradingSale(sale, { itemName: itemDoc?.name }, tx);

      return sale;
    });
  }

  async deleteSale(id, userId, deleteReason) {
    return withTransaction(async (tx) => {
      const existing = await tx.sale.findUnique({ where: { id } });
      assertNotDeleted(existing, 'Sale');

      await inventoryService.validateDeleteMovementsByReference('Sale', existing.id, tx);

      await softDeleteInvoice(tx, { tradingSaleId: id }, userId, deleteReason);

      await accountingService.deleteLedgerEntriesByReference('Sale', existing.id, tx);
      await inventoryService.deleteMovementsByReference('Sale', existing.id, tx);
      await tx.sale.update({
        where: { id },
        data: softDeletePayload(userId, deleteReason),
      });
    });
  }

  async restoreItem(id) {
    const existing = await prisma.item.findUnique({ where: { id } });
    assertIsDeleted(existing, 'Item');

    return prisma.item.update({
      where: { id },
      data: restorePayload({ activate: true }),
    });
  }

  async restoreParty(id) {
    const existing = await prisma.party.findUnique({ where: { id } });
    assertIsDeleted(existing, 'Party');

    const party = await prisma.party.update({
      where: { id },
      data: restorePayload({ activate: true }),
      include: PARTY_LIST_INCLUDE,
    });
    return formatParty(party);
  }

  async restorePurchase(id, userId) {
    return withTransaction(async (tx) => {
      const existing = await tx.purchase.findUnique({ where: { id } });
      assertIsDeleted(existing, 'Purchase');

      const party = await tx.party.findUnique({
        where: { id: existing.partyId },
        include: { suppliedItems: true },
      });
      assertNotDeleted(party, 'Party');
      if (!['vendor', 'both'].includes(party.type)) {
        throw new AppError('Selected party must be a vendor', 400);
      }
      if (
        party.suppliedItems?.length &&
        !party.suppliedItems.some((link) => link.itemId === existing.itemId)
      ) {
        throw new AppError('Selected vendor does not supply this item', 400);
      }

      const itemDoc = await tx.item.findUnique({ where: { id: existing.itemId } });
      assertNotDeleted(itemDoc, 'Item');

      const purchase = await tx.purchase.update({
        where: { id },
        data: restorePayload(),
      });

      await inventoryService.recordTradingPurchase(
        {
          item: purchase.itemId,
          quantity: purchase.quantity,
          referenceId: purchase.id,
          date: purchase.date,
          createdBy: userId || purchase.createdById,
        },
        tx
      );

      await accountingService.recordTradingPurchase(
        purchase,
        { partyName: party.name, itemName: itemDoc?.name },
        tx
      );

      return purchase;
    });
  }

  async restoreSale(id, userId) {
    return withTransaction(async (tx) => {
      const existing = await tx.sale.findUnique({ where: { id } });
      assertIsDeleted(existing, 'Sale');

      const itemDoc = await tx.item.findUnique({ where: { id: existing.itemId } });
      assertNotDeleted(itemDoc, 'Item');
      await this.validateTradingStock(existing.itemId, existing.quantity, tx);

      const sale = await tx.sale.update({
        where: { id },
        data: restorePayload(),
      });

      await inventoryService.recordTradingSale(
        {
          item: sale.itemId,
          quantity: sale.quantity,
          referenceId: sale.id,
          date: sale.date,
          createdBy: userId || sale.createdById,
        },
        tx
      );

      await accountingService.recordTradingSale(sale, { itemName: itemDoc?.name }, tx);

      return sale;
    });
  }
}

export default new TradingService();

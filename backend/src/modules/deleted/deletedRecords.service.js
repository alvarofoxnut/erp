import { prisma } from '../../config/db.js';
import { buildPagination, buildPaginationMeta } from '../../shared/utils/helpers.js';
import { buildSearchFilter } from '../../shared/utils/query.js';
import tradingService from '../../modules/trading/trading.service.js';
import manufacturingService from '../../modules/manufacturing/manufacturing.service.js';
import packagingService from '../../modules/manufacturing/packaging.service.js';
import damagesService from '../../modules/damages/damages.service.js';
import accountingModuleService from '../../modules/accounting/accountingModule.service.js';
import AppError from '../../shared/utils/AppError.js';

export const DELETED_MODULE_KEYS = [
  'trading-items',
  'trading-parties',
  'trading-purchases',
  'trading-sales',
  'mfg-vendors',
  'mfg-brands',
  'mfg-raw-purchases',
  'mfg-machine-entries',
  'mfg-quality-productions',
  'mfg-finished-productions',
  'mfg-packaging',
  'mfg-sales',
  'mfg-damages',
  'trading-damages',
  'expenses',
  'invoices',
];

const MODULE_CONFIG = {
  'trading-items': {
    label: 'Trading Items',
    model: 'item',
    searchFields: ['name', 'sku'],
    orderBy: { deletedAt: 'desc' },
    restore: (id, userId) => tradingService.restoreItem(id),
    labelField: (r) => r.name,
  },
  'trading-parties': {
    label: 'Parties',
    model: 'party',
    searchFields: ['name', 'email', 'phone'],
    orderBy: { deletedAt: 'desc' },
    restore: (id, userId) => tradingService.restoreParty(id),
    labelField: (r) => r.name,
  },
  'trading-purchases': {
    label: 'Trading Purchases',
    model: 'purchase',
    searchFields: ['serialNumber'],
    orderBy: { deletedAt: 'desc' },
    restore: (id, userId) => tradingService.restorePurchase(id, userId),
    labelField: (r) => r.serialNumber,
  },
  'trading-sales': {
    label: 'Trading Sales',
    model: 'sale',
    searchFields: ['serialNumber', 'customerName'],
    orderBy: { deletedAt: 'desc' },
    restore: (id, userId) => tradingService.restoreSale(id, userId),
    labelField: (r) => r.serialNumber,
  },
  'mfg-vendors': {
    label: 'Manufacturing Vendors',
    model: 'manufacturingVendor',
    searchFields: ['name', 'email'],
    orderBy: { deletedAt: 'desc' },
    restore: (id) => manufacturingService.restoreVendor(id),
    labelField: (r) => r.name,
  },
  'mfg-brands': {
    label: 'Brands',
    model: 'brand',
    searchFields: ['name'],
    orderBy: { deletedAt: 'desc' },
    restore: (id) => manufacturingService.restoreBrand(id),
    labelField: (r) => r.name,
  },
  'mfg-raw-purchases': {
    label: 'Raw Purchases',
    model: 'rawPurchase',
    searchFields: ['lotNumber'],
    orderBy: { deletedAt: 'desc' },
    restore: (id, userId) => manufacturingService.restoreRawPurchase(id, userId),
    labelField: (r) => r.lotNumber,
  },
  'mfg-machine-entries': {
    label: 'Machine Entries',
    model: 'machineEntry',
    searchFields: ['lotNumber'],
    orderBy: { deletedAt: 'desc' },
    restore: (id, userId) => manufacturingService.restoreMachineEntry(id, userId),
    labelField: (r) => r.lotNumber,
  },
  'mfg-quality-productions': {
    label: 'Quality Productions',
    model: 'qualityProduction',
    searchFields: ['lotNumber'],
    orderBy: { deletedAt: 'desc' },
    restore: (id, userId) => manufacturingService.restoreQualityProduction(id, userId),
    labelField: (r) => r.lotNumber || r.id,
  },
  'mfg-finished-productions': {
    label: 'Finished Productions',
    model: 'finishedProduction',
    searchFields: ['batchNumber', 'lotNumber'],
    orderBy: { deletedAt: 'desc' },
    restore: (id, userId) => manufacturingService.restoreFinishedProduction(id, userId),
    labelField: (r) => r.batchNumber,
  },
  'mfg-packaging': {
    label: 'Packaging',
    model: 'packagingTransaction',
    searchFields: ['serialNumber', 'lotNumber'],
    orderBy: { deletedAt: 'desc' },
    restore: (id, userId) => packagingService.restorePackaging(id, userId),
    labelField: (r) => r.serialNumber,
  },
  'mfg-sales': {
    label: 'Manufacturing Sales',
    model: 'manufacturingSale',
    searchFields: ['serialNumber', 'customerName'],
    orderBy: { deletedAt: 'desc' },
    restore: (id, userId) => manufacturingService.restoreManufacturingSale(id, userId),
    labelField: (r) => r.serialNumber,
  },
  'mfg-damages': {
    label: 'Manufacturing Damages',
    model: 'manufacturingDamage',
    searchFields: ['serialNumber'],
    orderBy: { deletedAt: 'desc' },
    restore: (id, userId) => damagesService.restoreManufacturingDamage(id, userId),
    labelField: (r) => r.serialNumber,
  },
  'trading-damages': {
    label: 'Trading Damages',
    model: 'tradingDamage',
    searchFields: ['serialNumber'],
    orderBy: { deletedAt: 'desc' },
    restore: (id, userId) => damagesService.restoreTradingDamage(id, userId),
    labelField: (r) => r.serialNumber,
  },
  expenses: {
    label: 'Expenses',
    model: 'expense',
    searchFields: ['category', 'description'],
    orderBy: { deletedAt: 'desc' },
    restore: (id) => accountingModuleService.restoreExpense(id),
    labelField: (r) => r.category,
  },
  invoices: {
    label: 'Invoices',
    model: 'invoice',
    searchFields: ['invoiceNumber', 'partyName'],
    orderBy: { deletedAt: 'desc' },
    restore: (id) => accountingModuleService.restoreInvoice(id),
    labelField: (r) => r.invoiceNumber,
  },
};

class DeletedRecordsService {
  listModules() {
    return DELETED_MODULE_KEYS.map((key) => ({
      key,
      label: MODULE_CONFIG[key].label,
    }));
  }

  getConfig(moduleKey) {
    const config = MODULE_CONFIG[moduleKey];
    if (!config) throw new AppError('Unknown deleted-records module', 404);
    return config;
  }

  async listDeleted(moduleKey, { search, page = 1, limit = 10 }) {
    const config = this.getConfig(moduleKey);
    const where = {
      isDeleted: true,
      ...buildSearchFilter(search, config.searchFields),
    };

    const skip = (page - 1) * limit;
    const [records, total] = await Promise.all([
      prisma[config.model].findMany({
        where,
        orderBy: config.orderBy,
        skip,
        take: limit,
      }),
      prisma[config.model].count({ where }),
    ]);

    const userIds = [...new Set(records.map((r) => r.deletedById).filter(Boolean))];
    const users = userIds.length
      ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      })
      : [];
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

    const items = records.map((record) => ({
      id: record.id,
      module: moduleKey,
      label: config.labelField(record),
      deletedAt: record.deletedAt,
      deleteReason: record.deleteReason,
      deletedBy: userMap[record.deletedById] || null,
      record,
    }));

    return { items, pagination: buildPaginationMeta(total, page, limit) };
  }

  async restore(moduleKey, id, userId) {
    const config = this.getConfig(moduleKey);
    const existing = await prisma[config.model].findUnique({ where: { id } });
    if (!existing || !existing.isDeleted) {
      throw new AppError('Deleted record not found', 404);
    }
    return config.restore(id, userId);
  }

  async countAll() {
    const counts = await Promise.all(
      DELETED_MODULE_KEYS.map(async (key) => {
        const { model } = MODULE_CONFIG[key];
        const count = await prisma[model].count({ where: { isDeleted: true } });
        return { key, label: MODULE_CONFIG[key].label, count };
      })
    );
    return counts.filter((c) => c.count > 0);
  }
}

export default new DeletedRecordsService();

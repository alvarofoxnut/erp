import { prisma } from '../../config/db.js';
import AppError from '../../shared/utils/AppError.js';
import { STOCK_CATEGORIES, PRODUCTION_MODES } from '../../shared/constants/index.js';
import tradingService from '../trading/trading.service.js';
import manufacturingService from '../manufacturing/manufacturing.service.js';
import damagesService from '../damages/damages.service.js';
import accountingModuleService from '../accounting/accountingModule.service.js';
import userService from '../users/user.service.js';
import { IMPORT_SCHEMAS, getImportSchema } from './import.schemas.js';

const INVENTORY_TYPE_ALIASES = {
  'raw material': STOCK_CATEGORIES.RAW_MATERIAL,
  raw: STOCK_CATEGORIES.RAW_MATERIAL,
  raw_material: STOCK_CATEGORIES.RAW_MATERIAL,
  '6 no': STOCK_CATEGORIES.QUALITY_6NO,
  '6no': STOCK_CATEGORIES.QUALITY_6NO,
  quality_6no: STOCK_CATEGORIES.QUALITY_6NO,
  '5 no': STOCK_CATEGORIES.QUALITY_5NO,
  '5no': STOCK_CATEGORIES.QUALITY_5NO,
  quality_5no: STOCK_CATEGORIES.QUALITY_5NO,
  '4.5 no': STOCK_CATEGORIES.QUALITY_4_5NO,
  '4.5no': STOCK_CATEGORIES.QUALITY_4_5NO,
  quality_4_5no: STOCK_CATEGORIES.QUALITY_4_5NO,
  '4 no': STOCK_CATEGORIES.QUALITY_4NO,
  '4no': STOCK_CATEGORIES.QUALITY_4NO,
  quality_4no: STOCK_CATEGORIES.QUALITY_4NO,
  others: STOCK_CATEGORIES.QUALITY_OTHERS,
  quality_others: STOCK_CATEGORIES.QUALITY_OTHERS,
  'finished goods': STOCK_CATEGORIES.FINISHED_GOODS,
  finished: STOCK_CATEGORIES.FINISHED_GOODS,
  finished_goods: STOCK_CATEGORIES.FINISHED_GOODS,
  fg: STOCK_CATEGORIES.FINISHED_GOODS,
};

function normalizeStr(val) {
  if (val == null) return '';
  return String(val).trim();
}

function parseDate(val) {
  const s = normalizeStr(val);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new AppError(`Invalid date: ${val}`, 400);
  return d.toISOString().slice(0, 10);
}

function parseNumber(val, label) {
  if (val == null || val === '') return null;
  const n = parseFloat(String(val).replace(/,/g, ''));
  if (Number.isNaN(n)) throw new AppError(`Invalid number for ${label}: ${val}`, 400);
  return n;
}

function coerceFieldValue(field, raw) {
  if (raw == null || raw === '') {
    if (field.required) throw new AppError(`${field.label} is required`, 400);
    return field.default ?? undefined;
  }

  switch (field.type) {
    case 'date':
      return parseDate(raw);
    case 'number': {
      const n = parseNumber(raw, field.label);
      return n ?? field.default ?? 0;
    }
    default:
      return normalizeStr(raw);
  }
}

function mapRow(rawRow, columnMapping, fields) {
  const mapped = {};
  let paidAmount;

  for (const field of fields) {
    const col = columnMapping[field.key];
    if (!col) {
      if (field.required && field.default === undefined) {
        throw new AppError(`${field.label} is required but not mapped`, 400);
      }
      if (field.default !== undefined) mapped[field.key] = field.default;
      continue;
    }

    const raw = rawRow[col];
    if (field.key === 'paidAmount') {
      paidAmount = coerceFieldValue({ ...field, required: false }, raw);
      continue;
    }
    mapped[field.key] = coerceFieldValue(field, raw);
  }

  return { mapped, paidAmount };
}

async function resolveItemId(value) {
  const v = normalizeStr(value);
  if (!v) throw new AppError('Item is required', 400);
  const byId = await prisma.item.findFirst({ where: { id: v, isActive: true } });
  if (byId) return byId.id;
  const byName = await prisma.item.findFirst({
    where: { name: { equals: v, mode: 'insensitive' }, isActive: true },
  });
  if (!byName) throw new AppError(`Item not found: ${v}`, 400);
  return byName.id;
}

async function resolvePartyId(value) {
  const v = normalizeStr(value);
  if (!v) throw new AppError('Vendor is required', 400);
  const byId = await prisma.party.findFirst({ where: { id: v, isActive: true } });
  if (byId) return byId.id;
  const byName = await prisma.party.findFirst({
    where: { name: { equals: v, mode: 'insensitive' }, isActive: true },
  });
  if (!byName) throw new AppError(`Vendor not found: ${v}`, 400);
  return byName.id;
}

async function resolveMfgVendorId(value) {
  const v = normalizeStr(value);
  if (!v) throw new AppError('Vendor is required', 400);
  const byId = await prisma.manufacturingVendor.findFirst({ where: { id: v, isActive: true } });
  if (byId) return byId.id;
  const byName = await prisma.manufacturingVendor.findFirst({
    where: { name: { equals: v, mode: 'insensitive' }, isActive: true },
  });
  if (!byName) throw new AppError(`Manufacturing vendor not found: ${v}`, 400);
  return byName.id;
}

async function resolveReferences(data, fields) {
  const resolved = { ...data };
  for (const field of fields) {
    if (!field.ref || resolved[field.key] == null) continue;
    if (field.ref === 'item') resolved[field.key] = await resolveItemId(resolved[field.key]);
    if (field.ref === 'party') resolved[field.key] = await resolvePartyId(resolved[field.key]);
    if (field.ref === 'mfgVendor') resolved[field.key] = await resolveMfgVendorId(resolved[field.key]);
  }
  return resolved;
}

function resolveInventoryType(value) {
  const key = normalizeStr(value).toLowerCase();
  const resolved = INVENTORY_TYPE_ALIASES[key];
  if (!resolved) throw new AppError(`Unknown inventory type: ${value}`, 400);
  return resolved;
}

async function resolveSuppliedItems(namesStr) {
  if (!namesStr) return [];
  const names = String(namesStr).split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  const ids = [];
  for (const name of names) {
    ids.push(await resolveItemId(name));
  }
  return ids;
}

function groupRows(rows, groupByKeys) {
  if (!groupByKeys?.length) return rows.map((r) => [r]);

  const groups = new Map();
  for (const row of rows) {
    const key = groupByKeys.map((k) => row.mapped[k] ?? '').join('||');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.values()];
}

async function autoCreateInvoice(schema, record, paidAmount, userId) {
  if (!schema.autoInvoice) return null;

  const amount = record.amount ?? record.totalAmount;
  const date = record.date;
  const invoiceType = schema.invoiceType || 'customer';
  const base = {
    date,
    amount,
    paidAmount: paidAmount ?? 0,
    invoiceType,
    totalQuantity: record.quantity ?? 0,
    rate: record.rate ?? record.purchaseRate ?? 0,
  };

  if (record.serialNumber) base.reference = record.serialNumber;

  if (schema.entityType === 'trading-sales') {
    return accountingModuleService.createInvoice({
      ...base,
      tradingSale: record.id,
      partyName: record.customerName,
      phone: record.customerPhone,
      email: record.customerEmail,
      address: record.customerAddress,
      itemDescription: record.itemName,
    }, userId);
  }
  if (schema.entityType === 'manufacturing-sales') {
    return accountingModuleService.createInvoice({
      ...base,
      manufacturingSale: record.id,
      partyName: record.customerName,
      phone: record.customerPhone,
      email: record.customerEmail,
      address: record.customerAddress,
      itemDescription: 'Finished Goods (Makhana)',
    }, userId);
  }
  if (schema.entityType === 'trading-purchases') {
    const purchase = await prisma.purchase.findUnique({
      where: { id: record.id },
      include: { party: true, item: true },
    });
    return accountingModuleService.createInvoice({
      ...base,
      tradingPurchase: record.id,
      party: purchase?.partyId,
      partyName: purchase?.party?.name,
      itemDescription: purchase?.item?.name,
    }, userId);
  }
  if (schema.entityType === 'raw-purchases') {
    const purchase = await prisma.rawPurchase.findUnique({
      where: { id: record.id },
      include: { vendor: true },
    });
    return accountingModuleService.createInvoice({
      ...base,
      rawPurchase: record.id,
      amount: purchase?.totalAmount ?? amount,
      totalQuantity: purchase?.quantity ?? 0,
      rate: purchase?.purchaseRate ?? 0,
      partyName: purchase?.vendor?.name,
      itemDescription: `Raw Material (Lot ${purchase?.lotNumber})`,
    }, userId);
  }
  return null;
}

async function importSingleRow(entityType, data, options, userId) {
  const { createInvoice = false, paidAmount } = options || {};
  const schema = { ...IMPORT_SCHEMAS[entityType], entityType };

  switch (entityType) {
    case 'trading-items':
      return tradingService.createItem(data, userId);
    case 'trading-parties': {
      const suppliedItems = await resolveSuppliedItems(data.suppliedItemNames);
      const { suppliedItemNames: _s, ...partyData } = data;
      return tradingService.createParty({ ...partyData, suppliedItems }, userId);
    }
    case 'trading-purchases': {
      const record = await tradingService.createPurchase(data, userId);
      if (createInvoice) await autoCreateInvoice(schema, record, paidAmount, userId);
      return record;
    }
    case 'trading-sales': {
      const item = await prisma.item.findUnique({ where: { id: data.item } });
      const record = await tradingService.createSale(data, userId);
      if (createInvoice) {
        await autoCreateInvoice(schema, { ...record, itemName: item?.name }, paidAmount, userId);
      }
      return record;
    }
    case 'manufacturing-vendors':
      return manufacturingService.createVendor(data, userId);
    case 'raw-purchases': {
      const record = await manufacturingService.createRawPurchase(data, userId);
      if (createInvoice) await autoCreateInvoice(schema, record, paidAmount, userId);
      return record;
    }
    case 'machine-entries':
      return manufacturingService.createMachineEntry(data, userId);
    case 'quality-productions':
      return manufacturingService.createQualityProduction({
        ...data,
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
      }, userId);
    case 'finished-productions': {
      const mode = (data.productionMode || 'proportionate').toLowerCase();
      const productionMode = mode === 'manual' ? PRODUCTION_MODES.MANUAL : PRODUCTION_MODES.PROPORTIONATE;
      return manufacturingService.createFinishedProduction({
        lotNumber: data.lotNumber,
        date: data.date,
        finishedQuantity: data.finishedQuantity,
        productionMode,
        consumed6No: data.consumed6No ?? 0,
        consumed5No: data.consumed5No ?? 0,
        consumed4_5No: data.consumed4_5No ?? 0,
        consumed4No: data.consumed4No ?? 0,
      }, userId);
    }
    case 'manufacturing-sales': {
      const record = await manufacturingService.createManufacturingSale(data, userId);
      if (createInvoice) await autoCreateInvoice(schema, record, paidAmount, userId);
      return record;
    }
    case 'expenses-manufacturing':
      return accountingModuleService.createExpense({ ...data, businessUnit: 'manufacturing' }, userId);
    case 'expenses-trading':
      return accountingModuleService.createExpense({ ...data, businessUnit: 'trading' }, userId);
    case 'users':
      return userService.create(data);
    default:
      throw new AppError(`Unsupported entity type: ${entityType}`, 400);
  }
}

async function importDamageGroup(entityType, group, userId) {
  const first = group[0].mapped;
  const lines = group.map((row) => {
    const d = row.mapped;
    if (entityType === 'trading-damages') {
      return {
        itemId: d.item,
        quantity: d.quantity,
        reason: d.reason,
      };
    }
    return {
      inventoryType: resolveInventoryType(d.inventoryType),
      lotNumber: d.lotNumber || undefined,
      quantity: d.quantity,
      reason: d.reason,
    };
  });

  const payload = { date: first.date, lines };
  if (entityType === 'trading-damages') {
    return damagesService.createTradingDamage(payload, userId);
  }
  return damagesService.createManufacturingDamage(payload, userId);
}

class ImportService {
  getSchema(entityType) {
    return getImportSchema(entityType);
  }

  listSchemas() {
    return Object.entries(IMPORT_SCHEMAS).map(([entityType, s]) => ({
      entityType,
      label: s.label,
      autoInvoice: s.autoInvoice,
    }));
  }

  async importRows(entityType, { rows, columnMapping, autoCreateInvoice: autoInvoiceOpt }, userId) {
    const schema = IMPORT_SCHEMAS[entityType];
    if (!schema) throw new AppError('Unknown import type', 400);
    if (!rows?.length) throw new AppError('No rows to import', 400);
    if (!columnMapping || typeof columnMapping !== 'object') {
      throw new AppError('Column mapping is required', 400);
    }

    const mappedRows = [];
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      try {
        const { mapped, paidAmount } = mapRow(rows[i], columnMapping, schema.fields);
        let resolved = await resolveReferences(mapped, schema.fields);

        if (entityType === 'trading-purchases' || entityType === 'trading-sales') {
          if (!resolved.amount && resolved.quantity != null && resolved.rate != null) {
            resolved.amount = resolved.quantity * resolved.rate;
          }
        }

        mappedRows.push({ rowIndex: i + 1, mapped: resolved, paidAmount });
      } catch (err) {
        errors.push({ row: i + 1, message: err.message || 'Mapping failed' });
      }
    }

    if (errors.length && mappedRows.length === 0) {
      return { imported: 0, failed: errors.length, errors, invoicesCreated: 0 };
    }

    let imported = 0;
    let invoicesCreated = 0;
    const shouldInvoice = autoInvoiceOpt !== false && schema.autoInvoice;

    const processGroup = async (group) => {
      try {
        if (schema.groupBy) {
          await importDamageGroup(entityType, group, userId);
          imported += group.length;
          return;
        }

        for (const row of group) {
          await importSingleRow(
            entityType,
            row.mapped,
            { createInvoice: shouldInvoice, paidAmount: row.paidAmount },
            userId
          );
          imported += 1;
          if (shouldInvoice && schema.autoInvoice) invoicesCreated += 1;
        }
      } catch (err) {
        const rowNums = group.map((g) => g.rowIndex).join(', ');
        errors.push({ row: rowNums, message: err.message || 'Import failed' });
      }
    };

    const groups = groupRows(mappedRows, schema.groupBy);
    for (const group of groups) {
      await processGroup(group);
    }

    return {
      imported,
      failed: errors.length,
      errors,
      invoicesCreated: shouldInvoice ? invoicesCreated : 0,
    };
  }
}

export default new ImportService();

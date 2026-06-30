export const ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  OPERATOR: 'operator',
};

export {
  PERMISSIONS,
  PERMISSION_GROUPS,
  ALL_PERMISSIONS,
  DEFAULT_ROLES,
} from './permissions.js';

export const STOCK_CATEGORIES = {
  RAW_MATERIAL: 'raw_material',
  WIP: 'wip',
  QUALITY_6NO: 'quality_6no',
  QUALITY_5NO: 'quality_5no',
  QUALITY_4_5NO: 'quality_4_5no',
  QUALITY_4NO: 'quality_4no',
  QUALITY_OTHERS: 'quality_others',
  FINISHED_GOODS: 'finished_goods',
  BRANDED_GOODS: 'branded_goods',
  TRADING: 'trading',
};

export const MANUFACTURING_SALE_TYPES = {
  LOOSE: 'loose',
  BRANDED: 'branded',
};

export const MANUFACTURING_SALE_CATEGORIES = [
  STOCK_CATEGORIES.FINISHED_GOODS,
  STOCK_CATEGORIES.BRANDED_GOODS,
];

export const STOCK_MOVEMENT_TYPES = {
  PURCHASE: 'purchase',
  PRODUCTION: 'production',
  CONSUMPTION: 'consumption',
  SALES: 'sales',
  RETURNS: 'returns',
  TRANSFER: 'transfer',
  DAMAGE: 'damage',
};

export const MANUFACTURING_DAMAGE_INVENTORY_TYPES = [
  STOCK_CATEGORIES.RAW_MATERIAL,
  STOCK_CATEGORIES.QUALITY_6NO,
  STOCK_CATEGORIES.QUALITY_5NO,
  STOCK_CATEGORIES.QUALITY_4_5NO,
  STOCK_CATEGORIES.QUALITY_4NO,
  STOCK_CATEGORIES.QUALITY_OTHERS,
  STOCK_CATEGORIES.FINISHED_GOODS,
];

export const EXPENSE_TYPES = {
  DIRECT: 'direct',
  INDIRECT: 'indirect',
  PERSONAL: 'personal',
};

export const LEDGER_TYPES = {
  CASH: 'cash',
  BANK: 'bank',
  VENDOR: 'vendor',
  CUSTOMER: 'customer',
  SALES: 'sales',
  PURCHASES: 'purchases',
  EXPENSES: 'expenses',
};

export const PRODUCTION_MODES = {
  MANUAL: 'manual',
  PROPORTIONATE: 'proportionate',
};

export const PAYMENT_STATUS = {
  PAID: 'paid',
  PARTIAL: 'partial',
  UNPAID: 'unpaid',
};

export const PARTY_TYPES = {
  VENDOR: 'vendor',
  CUSTOMER: 'customer',
  BOTH: 'both',
};

export const BUSINESS_UNITS = {
  MANUFACTURING: 'manufacturing',
  TRADING: 'trading',
};

export const MANUFACTURING_REFERENCE_TYPES = ['RawPurchase', 'ManufacturingSale'];

export const TRADING_REFERENCE_TYPES = ['Purchase', 'Sale'];

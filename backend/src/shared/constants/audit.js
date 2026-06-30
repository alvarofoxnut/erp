export const AUDIT_ACTIONS = {
  LOGIN: 'login',
  LOGOUT: 'logout',
  FAILED_LOGIN: 'failed_login',
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  RESTORE: 'restore',
  APPROVE: 'approve',
  REJECT: 'reject',
  EXPORT: 'export',
  IMPORT: 'import',
  PERMISSION_CHANGE: 'permission_change',
  PASSWORD_RESET: 'password_reset',
  STATUS_CHANGE: 'status_change',
  STOCK_ADJUSTMENT: 'stock_adjustment',
};

export const AUDIT_MODULES = {
  AUTHENTICATION: 'Authentication',
  USERS: 'Users',
  ROLES: 'Roles & Permissions',
  MANUFACTURING: 'Manufacturing',
  TRADING: 'Trading',
  INVENTORY: 'Inventory',
  STOCK_LEDGER: 'Stock Ledger',
  DAMAGES: 'Damages',
  SALES: 'Sales',
  PURCHASES: 'Purchases',
  EXPENSES: 'Expenses',
  REPORTS: 'Reports',
  SETTINGS: 'Settings',
};

export const AUDIT_PRIORITY = {
  NORMAL: 'normal',
  HIGH: 'high',
};

export const AUTH_SESSION_AUDIT_ACTIONS = [
  AUDIT_ACTIONS.LOGIN,
  AUDIT_ACTIONS.LOGOUT,
  AUDIT_ACTIONS.FAILED_LOGIN,
];

export const LARGE_INVENTORY_THRESHOLD = 1000;

export const AUDIT_MODULE_MAP = {
  users: { model: 'user', recordType: 'User', category: AUDIT_MODULES.USERS },
  role: { model: 'role', recordType: 'Role', category: AUDIT_MODULES.ROLES },
  manufacturingVendor: { model: 'manufacturingVendor', recordType: 'Manufacturing Vendor', category: AUDIT_MODULES.MANUFACTURING },
  rawPurchase: { model: 'rawPurchase', recordType: 'Raw Purchase', category: AUDIT_MODULES.MANUFACTURING },
  machineEntry: { model: 'machineEntry', recordType: 'Machine Entry', category: AUDIT_MODULES.MANUFACTURING },
  qualityProduction: { model: 'qualityProduction', recordType: 'Quality Production', category: AUDIT_MODULES.MANUFACTURING },
  finishedProduction: { model: 'finishedProduction', recordType: 'Finished Production', category: AUDIT_MODULES.MANUFACTURING },
  manufacturingSale: { model: 'manufacturingSale', recordType: 'Manufacturing Sale', category: AUDIT_MODULES.SALES },
  manufacturingDamage: { model: 'manufacturingDamage', recordType: 'Manufacturing Damage', category: AUDIT_MODULES.DAMAGES },
  item: { model: 'item', recordType: 'Trading Item', category: AUDIT_MODULES.TRADING },
  party: { model: 'party', recordType: 'Party', category: AUDIT_MODULES.TRADING },
  purchase: { model: 'purchase', recordType: 'Trading Purchase', category: AUDIT_MODULES.PURCHASES },
  sale: { model: 'sale', recordType: 'Trading Sale', category: AUDIT_MODULES.SALES },
  tradingDamage: { model: 'tradingDamage', recordType: 'Trading Damage', category: AUDIT_MODULES.DAMAGES },
  expense: { model: 'expense', recordType: 'Expense', category: AUDIT_MODULES.EXPENSES },
  invoice: { model: 'invoice', recordType: 'Invoice', category: AUDIT_MODULES.SALES },
  invoicePayment: { model: 'invoice', recordType: 'Invoice Payment', category: AUDIT_MODULES.SALES },
};

export const REFERENCE_MODULE_MAP = {
  RawPurchase: AUDIT_MODULES.MANUFACTURING,
  MachineEntry: AUDIT_MODULES.MANUFACTURING,
  QualityProduction: AUDIT_MODULES.MANUFACTURING,
  FinishedProduction: AUDIT_MODULES.MANUFACTURING,
  ManufacturingSale: AUDIT_MODULES.SALES,
  ManufacturingDamage: AUDIT_MODULES.DAMAGES,
  Purchase: AUDIT_MODULES.PURCHASES,
  Sale: AUDIT_MODULES.SALES,
  TradingDamage: AUDIT_MODULES.DAMAGES,
  Expense: AUDIT_MODULES.EXPENSES,
  Invoice: AUDIT_MODULES.SALES,
};

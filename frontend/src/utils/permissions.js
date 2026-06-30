export const PERMISSIONS = {
  DASHBOARD_READ: 'dashboard:read',
  USERS_READ: 'users:read',
  USERS_WRITE: 'users:write',
  ROLES_READ: 'roles:read',
  ROLES_WRITE: 'roles:write',
  MFG_VENDORS_READ: 'mfg:vendors:read',
  MFG_VENDORS_WRITE: 'mfg:vendors:write',
  MFG_RAW_PURCHASE_READ: 'mfg:raw-purchase:read',
  MFG_RAW_PURCHASE_WRITE: 'mfg:raw-purchase:write',
  MFG_WIP_READ: 'mfg:wip:read',
  MFG_WIP_WRITE: 'mfg:wip:write',
  MFG_QUALITY_READ: 'mfg:quality:read',
  MFG_QUALITY_WRITE: 'mfg:quality:write',
  MFG_BRANDS_READ: 'mfg:brands:read',
  MFG_BRANDS_WRITE: 'mfg:brands:write',
  MFG_FINISHED_READ: 'mfg:finished:read',
  MFG_FINISHED_WRITE: 'mfg:finished:write',
  MFG_SALES_READ: 'mfg:sales:read',
  MFG_SALES_WRITE: 'mfg:sales:write',
  MFG_DAMAGES_READ: 'mfg:damages:read',
  MFG_DAMAGES_WRITE: 'mfg:damages:write',
  TRADING_ITEMS_READ: 'trading:items:read',
  TRADING_ITEMS_WRITE: 'trading:items:write',
  TRADING_VENDORS_READ: 'trading:vendors:read',
  TRADING_VENDORS_WRITE: 'trading:vendors:write',
  TRADING_PURCHASES_READ: 'trading:purchases:read',
  TRADING_PURCHASES_WRITE: 'trading:purchases:write',
  TRADING_SALES_READ: 'trading:sales:read',
  TRADING_SALES_WRITE: 'trading:sales:write',
  TRADING_DAMAGES_READ: 'trading:damages:read',
  TRADING_DAMAGES_WRITE: 'trading:damages:write',
  INVENTORY_READ: 'inventory:read',
  INVOICES_READ: 'invoices:read',
  INVOICES_WRITE: 'invoices:write',
  EXPENSES_READ: 'expenses:read',
  EXPENSES_WRITE: 'expenses:write',
  LEDGERS_READ: 'ledgers:read',
  REPORTS_READ: 'reports:read',
};

export function hasPermission(user, permission) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return user.permissions?.includes(permission);
}

export function hasAnyPermission(user, permissions = []) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return permissions.some((p) => user.permissions?.includes(p));
}

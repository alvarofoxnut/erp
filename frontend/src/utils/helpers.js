import { format, parseISO } from 'date-fns';

export const formatDate = (date) => {
  if (!date) return '-';
  try {
    return format(typeof date === 'string' ? parseISO(date) : new Date(date), 'dd MMM yyyy');
  } catch {
    return '-';
  }
};

export const formatDateTime = (date) => {
  if (!date) return '-';
  try {
    return format(typeof date === 'string' ? parseISO(date) : new Date(date), 'dd MMM yyyy, HH:mm');
  } catch {
    return '-';
  }
};

export const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(amount || 0);
};

export const formatNumber = (num) => {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(num || 0);
};

export const STOCK_LABELS = {
  raw_material: 'Raw Material',
  wip: 'WIP',
  quality_6no: '6 No Quality',
  quality_5no: '5 No Quality',
  quality_4_5no: '4.5 No Quality',
  quality_4no: '4 No Quality',
  quality_others: 'Others Quality',
  finished_goods: 'Finished Goods',
  branded_goods: 'Branded Goods',
  trading: 'Trading',
};

export const MOVEMENT_TYPE_LABELS = {
  purchase: 'Purchase',
  production: 'Production',
  consumption: 'Consumption',
  sales: 'Sales',
  returns: 'Returns',
  transfer: 'Transfer',
  damage: 'Damage / Write-Off',
};

export const REFERENCE_TYPE_LABELS = {
  RawPurchase: 'Raw Purchase',
  MachineEntry: 'Machine Entry',
  QualityProduction: 'Quality Output',
  FinishedProduction: 'Finished Production',
  PackagingTransaction: 'Branded Packaging',
  Purchase: 'Trading Purchase',
  Sale: 'Trading Sale',
  ManufacturingSale: 'Manufacturing Sale',
  ManufacturingDamage: 'Manufacturing Damage',
  TradingDamage: 'Trading Damage',
};

export const ROLE_LABELS = {
  admin: 'Admin',
  manager: 'Manager',
  operator: 'Operator',
};

export const getErrorMessage = (error) => {
  return error.response?.data?.message || error.message || 'Something went wrong';
};

/** Trim and Title Case so "salary", "SALARY" store/display as "Salary". */
export function normalizeExpenseCategory(value) {
  const collapsed = String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!collapsed) return '';
  return collapsed
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

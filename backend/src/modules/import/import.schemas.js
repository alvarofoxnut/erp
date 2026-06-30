import { PERMISSIONS } from '../../shared/constants/index.js';

/**
 * Import field definitions per entity.
 * ref: resolve name → id via lookup table
 */
export const IMPORT_SCHEMAS = {
  'trading-items': {
    label: 'Trading Items',
    permission: PERMISSIONS.TRADING_ITEMS_WRITE,
    autoInvoice: false,
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'sku', label: 'SKU', type: 'text', required: false },
      { key: 'unit', label: 'Unit', type: 'text', required: false, default: 'KG' },
      { key: 'description', label: 'Description', type: 'text', required: false },
    ],
  },
  'trading-parties': {
    label: 'Trading Vendors',
    permission: PERMISSIONS.TRADING_VENDORS_WRITE,
    autoInvoice: false,
    fields: [
      { key: 'name', label: 'Vendor Name', type: 'text', required: true },
      { key: 'suppliedItemNames', label: 'Items Supplied (comma-separated)', type: 'text', required: false },
      { key: 'contactPerson', label: 'Contact Person', type: 'text', required: false },
      { key: 'phone', label: 'Phone', type: 'text', required: false },
      { key: 'email', label: 'Email', type: 'text', required: false },
      { key: 'gstNumber', label: 'GST Number', type: 'text', required: false },
      { key: 'address', label: 'Address', type: 'text', required: false },
    ],
  },
  'trading-purchases': {
    label: 'Trading Purchases',
    permission: PERMISSIONS.TRADING_PURCHASES_WRITE,
    autoInvoice: true,
    invoiceType: 'vendor',
    fields: [
      { key: 'date', label: 'Date', type: 'date', required: true },
      { key: 'item', label: 'Item', type: 'text', required: true, ref: 'item' },
      { key: 'party', label: 'Vendor', type: 'text', required: true, ref: 'party' },
      { key: 'quantity', label: 'Quantity', type: 'number', required: true },
      { key: 'rate', label: 'Rate (per unit)', type: 'number', required: false },
      { key: 'amount', label: 'Total Amount', type: 'number', required: true },
      { key: 'paidAmount', label: 'Paid Amount (for invoice)', type: 'number', required: false },
    ],
  },
  'trading-sales': {
    label: 'Trading Sales',
    permission: PERMISSIONS.TRADING_SALES_WRITE,
    autoInvoice: true,
    invoiceType: 'customer',
    fields: [
      { key: 'date', label: 'Date', type: 'date', required: true },
      { key: 'item', label: 'Item', type: 'text', required: true, ref: 'item' },
      { key: 'customerName', label: 'Customer Name', type: 'text', required: true },
      { key: 'quantity', label: 'Quantity', type: 'number', required: true },
      { key: 'rate', label: 'Rate (per unit)', type: 'number', required: false },
      { key: 'amount', label: 'Total Amount', type: 'number', required: true },
      { key: 'customerPhone', label: 'Customer Phone', type: 'text', required: false },
      { key: 'customerEmail', label: 'Customer Email', type: 'text', required: false },
      { key: 'customerAddress', label: 'Customer Address', type: 'text', required: false },
      { key: 'paidAmount', label: 'Paid Amount (for invoice)', type: 'number', required: false },
    ],
  },
  'trading-damages': {
    label: 'Trading Damages',
    permission: PERMISSIONS.TRADING_DAMAGES_WRITE,
    autoInvoice: false,
    groupBy: ['date', 'referenceNumber'],
    fields: [
      { key: 'date', label: 'Damage Date', type: 'date', required: true },
      { key: 'referenceNumber', label: 'Reference / Group Key', type: 'text', required: false },
      { key: 'item', label: 'Product', type: 'text', required: true, ref: 'item' },
      { key: 'quantity', label: 'Qty Damaged', type: 'number', required: true },
      { key: 'reason', label: 'Reason', type: 'text', required: false },
    ],
  },
  'manufacturing-vendors': {
    label: 'Manufacturing Vendors',
    permission: PERMISSIONS.MFG_VENDORS_WRITE,
    autoInvoice: false,
    fields: [
      { key: 'name', label: 'Vendor Name', type: 'text', required: true },
      { key: 'contactPerson', label: 'Contact Person', type: 'text', required: false },
      { key: 'phone', label: 'Phone', type: 'text', required: false },
      { key: 'email', label: 'Email', type: 'text', required: false },
      { key: 'gstNumber', label: 'GST Number', type: 'text', required: false },
      { key: 'address', label: 'Address', type: 'text', required: false },
    ],
  },
  'raw-purchases': {
    label: 'Raw Purchases',
    permission: PERMISSIONS.MFG_RAW_PURCHASE_WRITE,
    autoInvoice: true,
    invoiceType: 'vendor',
    fields: [
      { key: 'date', label: 'Date', type: 'date', required: true },
      { key: 'vendor', label: 'Vendor', type: 'text', required: true, ref: 'mfgVendor' },
      { key: 'lotNumber', label: 'Lot Number', type: 'text', required: true },
      { key: 'quantity', label: 'Quantity (KG)', type: 'number', required: true },
      { key: 'purchaseRate', label: 'Rate (per KG)', type: 'number', required: true },
      { key: 'paidAmount', label: 'Paid Amount (for invoice)', type: 'number', required: false },
    ],
  },
  'machine-entries': {
    label: 'Machine Entries',
    permission: PERMISSIONS.MFG_WIP_WRITE,
    autoInvoice: false,
    fields: [
      { key: 'lotNumber', label: 'Lot Number', type: 'text', required: true },
      { key: 'quantitySent', label: 'Quantity Sent (KG)', type: 'number', required: true },
      { key: 'date', label: 'Date', type: 'date', required: true },
    ],
  },
  'quality-productions': {
    label: 'Quality Production',
    permission: PERMISSIONS.MFG_QUALITY_WRITE,
    autoInvoice: false,
    fields: [
      { key: 'lotNumber', label: 'Lot Number', type: 'text', required: true },
      { key: 'date', label: 'Date', type: 'date', required: true },
      { key: 'quantity6No', label: '6 No Qty (KG)', type: 'number', required: false, default: 0 },
      { key: 'rate6No', label: '6 No Rate', type: 'number', required: false, default: 0 },
      { key: 'quantity5No', label: '5 No Qty (KG)', type: 'number', required: false, default: 0 },
      { key: 'rate5No', label: '5 No Rate', type: 'number', required: false, default: 0 },
      { key: 'quantity4_5No', label: '4.5 No Qty (KG)', type: 'number', required: false, default: 0 },
      { key: 'rate4_5No', label: '4.5 No Rate', type: 'number', required: false, default: 0 },
      { key: 'quantity4No', label: '4 No Qty (KG)', type: 'number', required: false, default: 0 },
      { key: 'rate4No', label: '4 No Rate', type: 'number', required: false, default: 0 },
      { key: 'quantityOthers', label: 'Others Qty (KG)', type: 'number', required: false, default: 0 },
      { key: 'rateOthers', label: 'Others Rate', type: 'number', required: false, default: 0 },
    ],
  },
  'finished-productions': {
    label: 'Finished Production',
    permission: PERMISSIONS.MFG_FINISHED_WRITE,
    autoInvoice: false,
    fields: [
      { key: 'lotNumber', label: 'Lot Number', type: 'text', required: true },
      { key: 'date', label: 'Date', type: 'date', required: true },
      { key: 'finishedQuantity', label: 'Finished Quantity (KG)', type: 'number', required: true },
      { key: 'productionMode', label: 'Production Mode (proportionate/manual)', type: 'text', required: false, default: 'proportionate' },
      { key: 'consumed6No', label: '6 No Used (manual mode)', type: 'number', required: false },
      { key: 'consumed5No', label: '5 No Used (manual mode)', type: 'number', required: false },
      { key: 'consumed4_5No', label: '4.5 No Used (manual mode)', type: 'number', required: false },
      { key: 'consumed4No', label: '4 No Used (manual mode)', type: 'number', required: false },
    ],
  },
  'manufacturing-sales': {
    label: 'Manufacturing Sales',
    permission: PERMISSIONS.MFG_SALES_WRITE,
    autoInvoice: true,
    invoiceType: 'customer',
    fields: [
      { key: 'date', label: 'Date', type: 'date', required: true },
      { key: 'customerName', label: 'Customer Name', type: 'text', required: true },
      { key: 'quantity', label: 'Quantity (KG)', type: 'number', required: true },
      { key: 'rate', label: 'Rate (per KG)', type: 'number', required: false },
      { key: 'amount', label: 'Total Amount', type: 'number', required: true },
      { key: 'customerPhone', label: 'Customer Phone', type: 'text', required: false },
      { key: 'customerEmail', label: 'Customer Email', type: 'text', required: false },
      { key: 'customerAddress', label: 'Customer Address', type: 'text', required: false },
      { key: 'paidAmount', label: 'Paid Amount (for invoice)', type: 'number', required: false },
    ],
  },
  'manufacturing-damages': {
    label: 'Manufacturing Damages',
    permission: PERMISSIONS.MFG_DAMAGES_WRITE,
    autoInvoice: false,
    groupBy: ['date', 'referenceNumber'],
    fields: [
      { key: 'date', label: 'Damage Date', type: 'date', required: true },
      { key: 'referenceNumber', label: 'Reference / Group Key', type: 'text', required: false },
      { key: 'inventoryType', label: 'Inventory Type', type: 'text', required: true },
      { key: 'lotNumber', label: 'Lot / Batch', type: 'text', required: false },
      { key: 'quantity', label: 'Qty Damaged (KG)', type: 'number', required: true },
      { key: 'reason', label: 'Reason', type: 'text', required: false },
    ],
  },
  'expenses-manufacturing': {
    label: 'Manufacturing Expenses',
    permission: PERMISSIONS.EXPENSES_WRITE,
    autoInvoice: false,
    fields: [
      { key: 'date', label: 'Date', type: 'date', required: true },
      { key: 'type', label: 'Type (direct/indirect/personal)', type: 'text', required: true, default: 'direct' },
      { key: 'category', label: 'Category', type: 'text', required: true },
      { key: 'amount', label: 'Amount', type: 'number', required: true },
      { key: 'paymentMode', label: 'Payment Mode', type: 'text', required: false, default: 'cash' },
      { key: 'description', label: 'Description', type: 'text', required: false },
    ],
  },
  'expenses-trading': {
    label: 'Trading Expenses',
    permission: PERMISSIONS.EXPENSES_WRITE,
    autoInvoice: false,
    fields: [
      { key: 'date', label: 'Date', type: 'date', required: true },
      { key: 'type', label: 'Type (direct/indirect/personal)', type: 'text', required: true, default: 'direct' },
      { key: 'category', label: 'Category', type: 'text', required: true },
      { key: 'amount', label: 'Amount', type: 'number', required: true },
      { key: 'paymentMode', label: 'Payment Mode', type: 'text', required: false, default: 'cash' },
      { key: 'description', label: 'Description', type: 'text', required: false },
    ],
  },
  users: {
    label: 'Users',
    permission: PERMISSIONS.USERS_WRITE,
    autoInvoice: false,
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'email', label: 'Email', type: 'text', required: true },
      { key: 'password', label: 'Password', type: 'text', required: true },
      { key: 'role', label: 'Role (admin/manager/operator)', type: 'text', required: true, default: 'operator' },
    ],
  },
};

export function getImportSchema(entityType) {
  const schema = IMPORT_SCHEMAS[entityType];
  if (!schema) return null;
  return {
    entityType,
    label: schema.label,
    autoInvoice: schema.autoInvoice,
    groupBy: schema.groupBy || null,
    fields: schema.fields.map((f) => ({
      key: f.key,
      label: f.label,
      type: f.type,
      required: !!f.required,
    })),
  };
}

export function listImportSchemas() {
  return Object.entries(IMPORT_SCHEMAS).map(([entityType, schema]) => ({
    entityType,
    label: schema.label,
    autoInvoice: schema.autoInvoice,
  }));
}

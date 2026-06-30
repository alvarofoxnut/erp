/** Column headers for Excel export / blank templates (matches list export maps). */
export const EXPORT_COLUMNS = {
  '/manufacturing/raw-purchases': ['Date', 'Vendor', 'Lot Number', 'Quantity', 'Rate', 'Amount'],
  '/manufacturing/machine-entries': ['Date', 'Lot Number', 'Qty Sent (KG)'],
  '/manufacturing/quality-productions': ['Date', 'Lot Number', '6 No Qty', '6 No Price', '5 No Qty', '5 No Price', '4.5 No Qty', '4.5 No Price', '4 No Qty', '4 No Price', 'Others Qty', 'Others Price', 'Total Output'],
  '/manufacturing/finished-productions': ['Date', 'Batch', 'Lot', 'Finished Qty', 'Mode', '6 No Used', '5 No Used', '4.5 No Used', '4 No Used', 'Rate', 'Value'],
  '/manufacturing/sales': ['S.No', 'Date', 'Customer', 'Qty (KG)', 'Rate/KG', 'Total', 'COGS'],
  '/manufacturing/vendors': ['Name', 'Contact', 'Phone', 'Email', 'GST', 'Address'],
  '/damages/manufacturing': ['Reference', 'Date', 'Total Loss', 'Lines'],
  '/trading/items': ['Name', 'SKU', 'Unit', 'Description'],
  '/trading/parties': ['Name', 'Type', 'Contact', 'Phone', 'Email', 'GST', 'Items Supplied'],
  '/trading/purchases': ['S.No', 'Date', 'Vendor', 'Item', 'Quantity', 'Rate/KG', 'Total'],
  '/trading/sales': ['S.No', 'Date', 'Customer', 'Item', 'Quantity', 'Rate/KG', 'Total'],
  '/damages/trading': ['Reference', 'Date', 'Total Loss', 'Lines'],
  '/accounting/expenses': ['Date', 'Type', 'Category', 'Amount', 'Payment', 'Description'],
  '/accounting/invoices': ['Invoice', 'Date', 'Party', 'Quantity', 'Amount', 'Paid', 'Due', 'Status'],
};

export function getExportColumns(endpoint) {
  const base = endpoint.split('?')[0];
  return EXPORT_COLUMNS[base] || null;
}

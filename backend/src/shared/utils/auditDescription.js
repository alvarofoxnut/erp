export function extractRecordIdentifier(record) {
  if (!record) return null;
  return (
    record.serialNumber
    || record.name
    || record.email
    || record.customerName
    || record.lotNumber
    || record.invoiceNumber
    || record.billNumber
    || record.batchNumber
    || null
  );
}

const SKIP_KEYS = new Set([
  '_id', 'id', 'createdAt', 'updatedAt', 'createdById', 'updatedById',
  'deletedById', 'userId', 'refreshToken', 'password',
]);

const RELATION_KEYS = new Set([
  'createdBy', 'updatedBy', 'deletedBy', 'user', 'item', 'party', 'vendor',
]);

const FIELD_LABELS = {
  name: 'Name',
  email: 'Email',
  role: 'Role',
  isActive: 'Status',
  quantity: 'Quantity',
  qty: 'Quantity',
  rate: 'Rate',
  amount: 'Amount',
  total: 'Total',
  lotNumber: 'Lot number',
  serialNumber: 'Serial number',
  customerName: 'Customer',
  vendorName: 'Vendor',
  partyName: 'Party',
  itemName: 'Item',
  date: 'Date',
  remarks: 'Remarks',
  permissions: 'Permissions',
  phone: 'Phone',
  address: 'Address',
  gstNumber: 'GST number',
  batchNumber: 'Batch number',
  grade: 'Grade',
  status: 'Status',
  invoiceNumber: 'Invoice number',
  billNumber: 'Bill number',
};

const EXPLICIT_DESCRIPTION_ACTIONS = new Set([
  'export', 'password_reset',
  'permission_change', 'stock_adjustment',
]);

function isInternalId(value) {
  return typeof value === 'string' && /^c[a-z0-9]{20,}$/i.test(value);
}

function formatFieldLabel(key) {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  return key
    .replace(/Id$/, '')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

export function formatAuditValue(value, key) {
  if (value === null || value === undefined || value === '') return '—';

  if (typeof value === 'boolean') {
    if (key === 'isActive') return value ? 'Active' : 'Inactive';
    return value ? 'Yes' : 'No';
  }

  if (typeof value === 'number') {
    const lowerKey = (key || '').toLowerCase();
    if (['rate', 'amount', 'total', 'price', 'cost', 'value'].some((k) => lowerKey.includes(k))) {
      return `₹${value.toLocaleString('en-IN')}`;
    }
    if (lowerKey.includes('quantity') || lowerKey === 'qty') {
      return `${value.toLocaleString('en-IN')} kg`;
    }
    return value.toLocaleString('en-IN');
  }

  if (typeof value === 'string') {
    if (isInternalId(value)) return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
      try {
        return new Date(value).toLocaleDateString('en-IN', {
          day: 'numeric', month: 'short', year: 'numeric',
        });
      } catch {
        return value;
      }
    }
    return value;
  }

  if (Array.isArray(value)) {
    if (!value.length) return 'None';
    if (value.every((v) => typeof v === 'string')) return value.join(', ');
    return `${value.length} item(s)`;
  }

  if (typeof value === 'object') {
    const identifier = extractRecordIdentifier(value);
    if (identifier && !isInternalId(identifier)) return String(identifier);
    if (value.name) return value.name;
    if (value.email) return value.email;
    return null;
  }

  const text = String(value);
  return isInternalId(text) ? null : text;
}

function summarizeRecord(record) {
  if (!record || typeof record !== 'object') return null;
  const priorityKeys = [
    'serialNumber', 'lotNumber', 'invoiceNumber', 'billNumber', 'batchNumber',
    'name', 'customerName', 'vendorName', 'partyName', 'itemName', 'email',
    'quantity', 'amount', 'total', 'rate', 'grade',
  ];
  const parts = [];
  for (const key of priorityKeys) {
    if (record[key] == null) continue;
    const formatted = formatAuditValue(record[key], key);
    if (formatted) parts.push(`${formatFieldLabel(key)}: ${formatted}`);
  }
  return parts.length ? parts.slice(0, 3).join(', ') : null;
}

function collectChanges(oldValue, newValue) {
  const changes = [];
  if (!oldValue || !newValue) return changes;

  for (const key of Object.keys(newValue)) {
    if (SKIP_KEYS.has(key) || RELATION_KEYS.has(key)) continue;
    const oldVal = oldValue[key];
    const newVal = newValue[key];
    if (JSON.stringify(oldVal) === JSON.stringify(newVal)) continue;

    const formattedOld = formatAuditValue(oldVal, key);
    const formattedNew = formatAuditValue(newVal, key);
    if (formattedOld == null && formattedNew == null) continue;

    changes.push(`${formatFieldLabel(key)}: ${formattedOld ?? '—'} → ${formattedNew ?? '—'}`);
  }
  return changes;
}

export function buildDescription(action, recordType, oldValue, newValue) {
  const label = recordType || 'Record';
  const actionText = action?.replace(/_/g, ' ') || 'changed';

  if (action === 'delete') {
    const identifier = extractRecordIdentifier(oldValue);
    if (identifier && !isInternalId(identifier)) {
      return `${label} deleted — ${identifier}`;
    }
    return `${label} deleted`;
  }

  if (action === 'create') {
    const summary = summarizeRecord(newValue);
    return summary ? `${label} created — ${summary}` : `${label} created`;
  }

  if (action === 'update' && oldValue && newValue) {
    const changes = collectChanges(oldValue, newValue);
    if (changes.length) {
      return `${label} updated — ${changes.slice(0, 4).join('; ')}`;
    }
  }

  return `${label} ${actionText}`;
}

export function getDisplayDescription(log) {
  if (!log) return '—';

  if (EXPLICIT_DESCRIPTION_ACTIONS.has(log.action) && log.description) {
    return log.description;
  }

  if (log.action === 'delete' && log.description?.includes('deleted')) {
    return log.description;
  }

  const rebuilt = buildDescription(log.action, log.recordType, log.oldValue, log.newValue);

  if (log.description && (log.description.includes('[object Object]') || log.description.includes('_id:'))) {
    return rebuilt;
  }

  if (log.action === 'update' || log.action === 'create') {
    return rebuilt;
  }

  return log.description || rebuilt;
}

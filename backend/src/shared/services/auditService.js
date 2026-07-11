import { prisma } from '../../config/db.js';
import { getFinancialYear } from '../utils/helpers.js';
import {
  AUDIT_MODULE_MAP,
  AUDIT_PRIORITY,
  LARGE_INVENTORY_THRESHOLD,
  REFERENCE_MODULE_MAP,
} from '../constants/audit.js';
import { buildDescription, extractRecordIdentifier } from '../utils/auditDescription.js';

export { extractRecordIdentifier };

const SENSITIVE_KEYS = ['password', 'refreshToken'];

function sanitize(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(sanitize);
  if (typeof value !== 'object') return value;
  const copy = { ...value };
  for (const key of SENSITIVE_KEYS) delete copy[key];
  for (const key of Object.keys(copy)) {
    if (copy[key] && typeof copy[key] === 'object') {
      copy[key] = sanitize(copy[key]);
    }
  }
  return copy;
}

export function getFinancialYearLabel(date = new Date()) {
  const fy = getFinancialYear(date);
  const startYear = fy.start.getFullYear();
  const endYear = fy.end.getFullYear();
  return `${startYear}-${String(endYear).slice(-2)}`;
}

class AuditService {
  async log({
    userId,
    action,
    module,
    resourceId,
    recordType,
    description,
    oldValue,
    newValue,
    priority = AUDIT_PRIORITY.NORMAL,
    details,
    ip,
    createdAt,
  }) {
    const safeOld = sanitize(oldValue);
    const safeNew = sanitize(newValue);
    const meta = AUDIT_MODULE_MAP[module];
    const category = meta?.category || module;
    const resolvedRecordType = recordType || meta?.recordType || null;
    const desc = description || buildDescription(action, resolvedRecordType, safeOld, safeNew);

    return prisma.auditLog.create({
      data: {
        userId: userId || null,
        action,
        module: category,
        resourceId: resourceId ? String(resourceId) : null,
        recordType: resolvedRecordType,
        description: desc,
        oldValue: safeOld ?? undefined,
        newValue: safeNew ?? undefined,
        priority,
        financialYear: getFinancialYearLabel(createdAt || new Date()),
        details: details ? sanitize(details) : undefined,
        ip: ip || null,
        ...(createdAt ? { createdAt } : {}),
      },
    }).catch(() => null);
  }

  async logDelete({
    userId,
    module,
    recordType,
    recordId,
    recordIdentifier,
    snapshot,
    ip,
    priority = AUDIT_PRIORITY.HIGH,
  }) {
    const meta = AUDIT_MODULE_MAP[module];
    const resolvedRecordType = recordType || meta?.recordType || 'Record';
    const safeSnapshot = sanitize(snapshot);
    const identifier = recordIdentifier || extractRecordIdentifier(safeSnapshot);

    await this.log({
      userId,
      action: 'delete',
      module,
      resourceId: recordId,
      recordType: resolvedRecordType,
      description: `${resolvedRecordType} deleted${identifier ? ` — ${identifier}` : ''}`,
      oldValue: safeSnapshot,
      priority,
      ip,
    });
  }

  async logInventory({
    userId,
    sourceModule,
    stockType,
    quantityBefore,
    quantityChanged,
    quantityAfter,
    referenceType,
    referenceId,
    ip,
  }) {
    const module = REFERENCE_MODULE_MAP[referenceType] || sourceModule || 'Inventory';
    const isLarge = Math.abs(quantityChanged) >= LARGE_INVENTORY_THRESHOLD;

    await Promise.all([
      prisma.inventoryAuditLog.create({
        data: {
          userId: userId || null,
          sourceModule: module,
          stockType,
          quantityBefore,
          quantityChanged,
          quantityAfter,
          referenceType: referenceType || null,
          referenceId: referenceId ? String(referenceId) : null,
          ip: ip || null,
        },
      }).catch(() => null),
      this.log({
        userId,
        action: 'stock_adjustment',
        module: 'Inventory',
        resourceId: referenceId,
        recordType: stockType,
        description: `${stockType}: ${quantityBefore} → ${quantityAfter} (${quantityChanged >= 0 ? '+' : ''}${quantityChanged})`,
        oldValue: { quantity: quantityBefore },
        newValue: { quantity: quantityAfter },
        priority: isLarge ? AUDIT_PRIORITY.HIGH : AUDIT_PRIORITY.NORMAL,
        ip,
      }),
    ]);
  }

  async logPermissionChange({
    userId,
    targetUserId,
    targetUserName,
    changes,
    ip,
  }) {
    return this.log({
      userId,
      action: 'permission_change',
      module: 'Users',
      resourceId: targetUserId,
      recordType: 'User Permissions',
      description: `Permissions changed for ${targetUserName || targetUserId}`,
      newValue: changes,
      priority: AUDIT_PRIORITY.HIGH,
      ip,
    });
  }

  async logReportExport({ userId, reportName, exportType, ip }) {
    return this.log({
      userId,
      action: 'export',
      module: 'Reports',
      recordType: reportName,
      description: `${reportName} exported as ${exportType}`,
      details: { reportName, exportType },
      ip,
    });
  }

  async fetchExistingRecord(moduleKey, id) {
    const config = AUDIT_MODULE_MAP[moduleKey];
    if (!config || !id) return null;
    try {
      const query = { where: { id: String(id) } };
      if (config.model === 'user') {
        query.omit = { password: true, refreshToken: true };
      }
      return await prisma[config.model].findUnique(query);
    } catch {
      return null;
    }
  }
}

export default new AuditService();

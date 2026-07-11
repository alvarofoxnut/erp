import AppError from './AppError.js';

/** Default filter — hide soft-deleted records from normal list queries */
export const ACTIVE_ONLY = { isDeleted: false };

/**
 * Build list query filter based on admin trash view options.
 * @param {object} baseWhere
 * @param {{ deletedOnly?: boolean, includeDeleted?: boolean }} options
 */
export function buildListFilter(baseWhere = {}, options = {}) {
  const { deletedOnly = false, includeDeleted = false } = options;
  if (deletedOnly) return { ...baseWhere, isDeleted: true };
  if (includeDeleted) return baseWhere;
  return { ...baseWhere, ...ACTIVE_ONLY };
}

export function softDeletePayload(userId, deleteReason, { deactivate = false } = {}) {
  const payload = {
    isDeleted: true,
    deletedAt: new Date(),
    deletedById: userId || null,
    deleteReason: deleteReason?.trim() || null,
  };
  if (deactivate) payload.isActive = false;
  return payload;
}

export function restorePayload({ activate = false } = {}) {
  const payload = {
    isDeleted: false,
    deletedAt: null,
    deletedById: null,
    deleteReason: null,
  };
  if (activate) payload.isActive = true;
  return payload;
}

export function assertNotDeleted(record, label = 'Record') {
  if (!record) throw new AppError(`${label} not found`, 404);
  if (record.isDeleted) throw new AppError(`${label} has been deleted`, 410);
}

export function assertIsDeleted(record, label = 'Record') {
  if (!record) throw new AppError(`${label} not found`, 404);
  if (!record.isDeleted) throw new AppError(`${label} is not deleted`, 400);
}

export async function softDeleteInvoice(tx, where, userId, deleteReason) {
  const invoice = await tx.invoice.findFirst({ where: { ...where, isDeleted: false } });
  if (!invoice) return null;
  await tx.invoice.update({
    where: { id: invoice.id },
    data: softDeletePayload(userId, deleteReason),
  });
  return invoice;
}

export function getDeleteMeta(req) {
  return {
    userId: req.user?._id || req.user?.id,
    deleteReason: req.body?.deleteReason,
  };
}

import AppError from './AppError.js';

/** Default filter — hide soft-deleted records from normal list queries */
export const ACTIVE_ONLY = { isDeleted: false };

/**
 * Active invoices whose linked sale/purchase (if any) is also not deleted.
 * Hides orphan invoices left behind when a source was deleted without cascading.
 */
export function activeInvoiceWhere(extra = {}) {
  const { AND: extraAnd, ...rest } = extra;
  const sourceGuards = [
    { OR: [{ tradingSaleId: null }, { tradingSale: { isDeleted: false } }] },
    { OR: [{ manufacturingSaleId: null }, { manufacturingSale: { isDeleted: false } }] },
    { OR: [{ tradingPurchaseId: null }, { tradingPurchase: { isDeleted: false } }] },
    { OR: [{ rawPurchaseId: null }, { rawPurchase: { isDeleted: false } }] },
  ];
  const and = [
    ...(Array.isArray(extraAnd) ? extraAnd : extraAnd ? [extraAnd] : []),
    ...sourceGuards,
  ];
  return { ...ACTIVE_ONLY, ...rest, AND: and };
}

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

/**
 * Soft-delete any still-active invoices whose linked sale/purchase is already deleted.
 * Repairs orphans so dashboard/lists stay consistent after past deletes.
 */
export async function softDeleteOrphanInvoices(prismaClient, userId = null, deleteReason = 'Linked record deleted') {
  const orphans = await prismaClient.invoice.findMany({
    where: {
      isDeleted: false,
      OR: [
        { tradingSale: { isDeleted: true } },
        { manufacturingSale: { isDeleted: true } },
        { tradingPurchase: { isDeleted: true } },
        { rawPurchase: { isDeleted: true } },
      ],
    },
    select: { id: true },
  });
  if (!orphans.length) return 0;
  await prismaClient.invoice.updateMany({
    where: { id: { in: orphans.map((o) => o.id) } },
    data: softDeletePayload(userId, deleteReason),
  });
  return orphans.length;
}

export function getDeleteMeta(req) {
  return {
    userId: req.user?._id || req.user?.id,
    deleteReason: req.body?.deleteReason,
  };
}

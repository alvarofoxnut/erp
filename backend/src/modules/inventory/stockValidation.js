import AppError from '../../shared/utils/AppError.js';
import { STOCK_CATEGORIES } from '../../shared/constants/index.js';
import inventoryRepository from './inventory.repository.js';

const round2 = (n) => Math.round((n || 0) * 100) / 100;

export function scopeEffectKey(category, scope = {}) {
  return inventoryRepository.scopeEffectKey(category, scope);
}

export function buildNetEffectsMap(entries) {
  const map = new Map();
  for (const { category, scope = {}, netQuantity } of entries) {
    const key = scopeEffectKey(category, scope);
    map.set(key, round2((map.get(key) || 0) + netQuantity));
  }
  return map;
}

export function netInbound(category, scope, quantity) {
  return { category, scope, netQuantity: round2(quantity) };
}

export function netOutbound(category, scope, quantity) {
  return { category, scope, netQuantity: round2(-quantity) };
}

/**
 * Validates stock after replacing a reference's ledger movements.
 * projected = currentBalance - oldReferenceNet + newReferenceNet
 */
export async function validateEditStockImpact(
  referenceType,
  referenceId,
  newEffectsMap,
  tx,
  context = {}
) {
  return inventoryRepository.validateReplaceReferenceStock(
    referenceType,
    referenceId,
    newEffectsMap,
    tx,
    context
  );
}

/**
 * Validates outbound quantity including stock that will be restored when
 * an existing reference's movements are removed (edit flows).
 */
export async function validateOutboundCapacity(
  category,
  scope,
  requiredQty,
  session,
  { referenceType = null, referenceId = null, label = category } = {}
) {
  if (requiredQty <= 0) return;

  const balance = await inventoryRepository.getCurrentBalance(category, scope, session);
  const previousOut =
    referenceType && referenceId
      ? await inventoryRepository.getReferenceOutboundQuantity(
          referenceType,
          referenceId,
          category,
          scope,
          session
        )
      : 0;
  const available = balance + previousOut;

  if (available < requiredQty) {
    throw new AppError(
      `Insufficient ${label} stock. Available: ${available}, Required: ${requiredQty}`,
      400
    );
  }
}

export async function validateWipOutbound(
  totalOutput,
  session,
  referenceType = null,
  referenceId = null,
  lotNumber = null
) {
  const lot = lotNumber?.trim();
  const scope = lot ? { lotNumber: lot } : {};
  const label = lot ? `WIP for lot ${lot}` : 'WIP';

  return validateOutboundCapacity(
    STOCK_CATEGORIES.WIP,
    scope,
    totalOutput,
    session,
    { referenceType, referenceId, label }
  );
}

export async function validateFinishedProductionStock(
  { consumed6No, consumed5No, consumed4_5No, consumed4No, consumedOthers, lotNumber },
  session,
  referenceType = null,
  referenceId = null
) {
  const lotScope = lotNumber?.trim() ? { lotNumber: lotNumber.trim() } : {};
  const consumptions = [
    { qty: consumed6No, category: STOCK_CATEGORIES.QUALITY_6NO, label: '6 No' },
    { qty: consumed5No, category: STOCK_CATEGORIES.QUALITY_5NO, label: '5 No' },
    { qty: consumed4_5No, category: STOCK_CATEGORIES.QUALITY_4_5NO, label: '4.5 No' },
    { qty: consumed4No, category: STOCK_CATEGORIES.QUALITY_4NO, label: '4 No' },
    { qty: consumedOthers, category: STOCK_CATEGORIES.QUALITY_OTHERS, label: 'Others' },
  ];

  for (const { qty, category, label } of consumptions) {
    if (qty > 0) {
      await validateOutboundCapacity(category, lotScope, qty, session, {
        referenceType,
        referenceId,
        label: lotScope.lotNumber ? `${label} for lot ${lotScope.lotNumber}` : label,
      });
    }
  }
}

export async function validateFinishedGoodsBatchCapacity(
  requiredQty,
  session,
  { referenceType = null, referenceId = null } = {}
) {
  const balance = await inventoryRepository.getFinishedGoodsTotalFromBatches(session);
  let available = balance;

  if (referenceType && referenceId) {
    if (referenceType === 'ManufacturingSale') {
      const previousSale = await session.manufacturingSale.findUnique({
        where: { id: String(referenceId) },
        select: { quantity: true },
      });
      if (previousSale) {
        available += previousSale.quantity;
      }
    }

    if (referenceType === 'ManufacturingDamage') {
      const previousDamage = await session.manufacturingDamage.findUnique({
        where: { id: String(referenceId) },
        include: { lines: { select: { inventoryType: true, quantity: true } } },
      });
      if (previousDamage) {
        const fgQty = previousDamage.lines
          .filter((line) => line.inventoryType === STOCK_CATEGORIES.FINISHED_GOODS)
          .reduce((sum, line) => sum + line.quantity, 0);
        available += fgQty;
      }
    }
  }

  if (available < requiredQty) {
    throw new AppError(
      `Insufficient finished goods stock. Available: ${available}, Required: ${requiredQty}`,
      400
    );
  }
}

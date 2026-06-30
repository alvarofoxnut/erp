import {
  BUSINESS_UNITS,
  MANUFACTURING_REFERENCE_TYPES,
  TRADING_REFERENCE_TYPES,
} from '../../shared/constants/index.js';

export function businessUnitFromReferenceType(referenceType) {
  if (MANUFACTURING_REFERENCE_TYPES.includes(referenceType)) {
    return BUSINESS_UNITS.MANUFACTURING;
  }
  if (TRADING_REFERENCE_TYPES.includes(referenceType)) {
    return BUSINESS_UNITS.TRADING;
  }
  return null;
}

export function parseBusinessUnits(query) {
  const raw = query.units || query.businessUnit;
  if (!raw) return [BUSINESS_UNITS.MANUFACTURING, BUSINESS_UNITS.TRADING];
  const list = String(raw)
    .split(',')
    .map((u) => u.trim())
    .filter((u) => Object.values(BUSINESS_UNITS).includes(u));
  return list.length ? list : [BUSINESS_UNITS.MANUFACTURING, BUSINESS_UNITS.TRADING];
}

export function unitEntryFilter(units) {
  if (!units?.length || units.length >= 2) {
    return {};
  }
  const unit = units[0];
  const refTypes = unit === BUSINESS_UNITS.MANUFACTURING
    ? MANUFACTURING_REFERENCE_TYPES
    : TRADING_REFERENCE_TYPES;
  return {
    $or: [
      { businessUnit: unit },
      { businessUnit: { $exists: false }, referenceType: { $in: refTypes } },
    ],
  };
}

export function unitExpenseFilter(units) {
  if (!units?.length || units.length >= 2) return {};
  return { businessUnit: units[0] };
}

export function unitEntryPrismaWhere(units) {
  if (!units?.length || units.length >= 2) {
    return {};
  }
  const unit = units[0];
  const refTypes = unit === BUSINESS_UNITS.MANUFACTURING
    ? MANUFACTURING_REFERENCE_TYPES
    : TRADING_REFERENCE_TYPES;
  return {
    OR: [
      { businessUnit: unit },
      { businessUnit: null, referenceType: { in: refTypes } },
    ],
  };
}

export function unitExpensePrismaWhere(units) {
  if (!units?.length || units.length >= 2) return {};
  return { businessUnit: units[0] };
}

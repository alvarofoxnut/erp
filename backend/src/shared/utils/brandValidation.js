import AppError from './AppError.js';

const round2 = (n) => Math.round((n || 0) * 100) / 100;

export function qualityPerPacketGrams(brand) {
  const packetSize = Number(brand.packetSizeGrams ?? 0);
  const packingWeight = Number(brand.packingWeightGrams ?? 0);
  return round2(packetSize - packingWeight);
}

/** Legacy brands stored grade split as % of quality (summing to 100). */
export function isLegacyPercentProportions(brand) {
  const p6 = Number(brand.proportion6No ?? 0);
  const p5 = Number(brand.proportion5No ?? 0);
  const p45 = Number(brand.proportion4_5No ?? 0);
  const p4 = Number(brand.proportion4No ?? 0);
  const pOthers = Number(brand.proportionOthers ?? 0);
  const total = round2(p6 + p5 + p45 + p4 + pOthers);
  const quality = qualityPerPacketGrams(brand);
  if (quality <= 0) return Math.abs(total - 100) <= 0.01;
  return (
    Math.abs(total - 100) <= 0.01 &&
    p6 <= 100 &&
    p5 <= 100 &&
    p45 <= 100 &&
    p4 <= 100 &&
    pOthers <= 100 &&
    Math.abs(total - quality) > 0.01
  );
}

/** Grams of each grade per packet (handles legacy % storage). */
export function gradeGramsPerPacket(brand) {
  const quality = qualityPerPacketGrams(brand);
  const p6 = Number(brand.proportion6No ?? 0);
  const p5 = Number(brand.proportion5No ?? 0);
  const p45 = Number(brand.proportion4_5No ?? 0);
  const p4 = Number(brand.proportion4No ?? 0);
  const pOthers = Number(brand.proportionOthers ?? 0);

  if (isLegacyPercentProportions(brand)) {
    return {
      grams6No: round2((quality * p6) / 100),
      grams5No: round2((quality * p5) / 100),
      grams4_5No: round2((quality * p45) / 100),
      grams4No: round2((quality * p4) / 100),
      gramsOthers: round2((quality * pOthers) / 100),
    };
  }

  return {
    grams6No: round2(p6),
    grams5No: round2(p5),
    grams4_5No: round2(p45),
    grams4No: round2(p4),
    gramsOthers: round2(pOthers),
  };
}

export function gradeGramsTotal(brand) {
  const g = gradeGramsPerPacket(brand);
  return round2(g.grams6No + g.grams5No + g.grams4_5No + g.grams4No + g.gramsOthers);
}

export function validateBrandProportions(data) {
  const g6 = Number(data.proportion6No ?? 0);
  const g5 = Number(data.proportion5No ?? 0);
  const g45 = Number(data.proportion4_5No ?? 0);
  const g4 = Number(data.proportion4No ?? 0);
  const gOthers = Number(data.proportionOthers ?? 0);

  const packetSize = Number(data.packetSizeGrams);
  if (!packetSize || packetSize <= 0) {
    throw new AppError('Packet size must be greater than zero', 400);
  }

  const packingWeight = Number(data.packingWeightGrams ?? 0);
  if (packingWeight < 0) {
    throw new AppError('Packing weight cannot be negative', 400);
  }
  if (packingWeight >= packetSize) {
    throw new AppError('Packing weight must be less than packet size', 400);
  }

  const qualityGrams = round2(packetSize - packingWeight);

  for (const [label, val] of [
    ['6 No', g6],
    ['5 No', g5],
    ['4.5 No', g45],
    ['4 No', g4],
    ['Others', gOthers],
  ]) {
    if (val < 0) {
      throw new AppError(`${label} weight cannot be negative`, 400);
    }
    if (val > qualityGrams) {
      throw new AppError(`${label} weight cannot exceed quality per packet (${qualityGrams} gm)`, 400);
    }
  }

  const total = round2(g6 + g5 + g45 + g4 + gOthers);
  if (Math.abs(total - qualityGrams) > 0.01) {
    throw new AppError(
      `Grade weights must total ${qualityGrams} gm (packet size − packing weight). Current total: ${total} gm`,
      400
    );
  }

  const packagingPrice = Number(data.packagingPrice ?? 0);
  if (packagingPrice < 0) {
    throw new AppError('Packaging price cannot be negative', 400);
  }

  return {
    proportion6No: g6,
    proportion5No: g5,
    proportion4_5No: g45,
    proportion4No: g4,
    proportionOthers: gOthers,
    packetSizeGrams: packetSize,
    packingWeightGrams: packingWeight,
    packagingPrice,
  };
}

export function calculateBrandConsumption(brand, quantityPackedKg) {
  const qty = round2(quantityPackedKg);
  if (qty <= 0) throw new AppError('Quantity to pack must be greater than zero', 400);

  const packetSizeGrams = Number(brand.packetSizeGrams ?? 0);
  if (packetSizeGrams <= 0) {
    throw new AppError('Packet size must be greater than zero', 400);
  }

  const qualityGrams = qualityPerPacketGrams(brand);
  if (qualityGrams <= 0) {
    throw new AppError('Quality per packet must be greater than zero (check packet size and packing weight)', 400);
  }

  const packetSizeKg = packetSizeGrams / 1000;
  const packetsCreated = round2(qty / packetSizeKg);
  const grades = gradeGramsPerPacket(brand);

  const consumed6No = round2((packetsCreated * grades.grams6No) / 1000);
  const consumed5No = round2((packetsCreated * grades.grams5No) / 1000);
  const consumed4_5No = round2((packetsCreated * grades.grams4_5No) / 1000);
  const consumed4No = round2((packetsCreated * grades.grams4No) / 1000);
  const consumedOthers = round2((packetsCreated * grades.gramsOthers) / 1000);
  const qualityConsumedKg = round2(
    consumed6No + consumed5No + consumed4_5No + consumed4No + consumedOthers
  );

  return {
    quantityPackedKg: qty,
    packetsCreated,
    qualityConsumedKg,
    consumed6No,
    consumed5No,
    consumed4_5No,
    consumed4No,
    consumedOthers,
  };
}

/** Branded sale: derive packet count from total quality KG sold and brand packet size. */
export function calculateBrandedSalePackets(brand, quantitySoldKg) {
  const { quantityPackedKg, packetsCreated } = calculateBrandConsumption(brand, quantitySoldKg);
  if (packetsCreated <= 0) {
    throw new AppError('Quantity sold is too small for one packet at this brand size', 400);
  }
  return { quantity: quantityPackedKg, packetCount: packetsCreated };
}

const round2 = (n) => Math.round((n || 0) * 100) / 100;

export function qualityPerPacketGrams(brand) {
  if (!brand) return 0;
  const packetSize = Number(brand.packetSizeGrams ?? 0);
  const packingWeight = Number(brand.packingWeightGrams ?? 0);
  return round2(packetSize - packingWeight);
}

export function packetSizeKg(brand) {
  const grams = Number(brand?.packetSizeGrams ?? 0);
  return grams > 0 ? grams / 1000 : 0;
}

/** Packets from gross packed/sold weight (uses full packet size, e.g. 250 gm). */
export function packetsFromGrossKg(brand, grossKg) {
  const perPacket = packetSizeKg(brand);
  if (!perPacket || !grossKg) return 0;
  return round2(parseFloat(grossKg) / perPacket);
}

/** Gross KG from packet count (uses full packet size). */
export function grossKgFromPackets(brand, packetCount) {
  const perPacket = packetSizeKg(brand);
  if (!perPacket || !packetCount) return 0;
  return round2(parseFloat(packetCount) * perPacket);
}

function isLegacyPercentProportions(brand) {
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

export function gradeGramsPerPacket(brand) {
  if (!brand) {
    return { grams6No: 0, grams5No: 0, grams4_5No: 0, grams4No: 0, gramsOthers: 0 };
  }
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

export function gradeGramsToFormValues(brand) {
  const g = gradeGramsPerPacket(brand);
  return {
    proportion6No: g.grams6No,
    proportion5No: g.grams5No,
    proportion4_5No: g.grams4_5No,
    proportion4No: g.grams4No,
    proportionOthers: g.gramsOthers,
  };
}

export function calculatePackagingPreview(brand, quantityPackedKg) {
  if (!brand || !quantityPackedKg) return null;
  const qty = round2(parseFloat(quantityPackedKg));
  if (Number.isNaN(qty) || qty <= 0) return null;

  const packetSizeGrams = Number(brand.packetSizeGrams ?? 0);
  const qualityGrams = qualityPerPacketGrams(brand);
  if (packetSizeGrams <= 0 || qualityGrams <= 0) return null;

  const packetsCreated = packetsFromGrossKg(brand, qty);
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
    packetSizeGrams,
    packingWeightGrams: brand.packingWeightGrams ?? 0,
    qualityPerPacketGrams: qualityGrams,
    packagingPrice: brand.packagingPrice ?? 0,
    gradeGrams: grades,
  };
}

export function proportionTotal(brand) {
  const g = gradeGramsPerPacket(brand);
  return round2(g.grams6No + g.grams5No + g.grams4_5No + g.grams4No + g.gramsOthers);
}

export function formatPacketSize(grams) {
  if (!grams) return '-';
  return `${formatNumber(grams)} gm`;
}

function formatNumber(num) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(num || 0);
}

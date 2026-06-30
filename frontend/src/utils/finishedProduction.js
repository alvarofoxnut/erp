export function calculateProportionateConsumption(finishedQty, stocks) {
  const stock6No = stocks.stock6No || 0;
  const stock5No = stocks.stock5No || 0;
  const stock4_5No = stocks.stock4_5No || 0;
  const stock4No = stocks.stock4No || 0;
  const stockOthers = stocks.stockOthers || 0;
  const totalAvailable = stock6No + stock5No + stock4_5No + stock4No + stockOthers;

  if (totalAvailable === 0) {
    return { consumed6No: 0, consumed5No: 0, consumed4_5No: 0, consumed4No: 0, consumedOthers: 0 };
  }

  const ratio6 = stock6No / totalAvailable;
  const ratio5 = stock5No / totalAvailable;
  const ratio4_5 = stock4_5No / totalAvailable;
  const ratio4 = stock4No / totalAvailable;
  const ratioOthers = stockOthers / totalAvailable;

  let consumed6No = Math.round(finishedQty * ratio6 * 100) / 100;
  let consumed5No = Math.round(finishedQty * ratio5 * 100) / 100;
  let consumed4_5No = Math.round(finishedQty * ratio4_5 * 100) / 100;
  let consumed4No = Math.round(finishedQty * ratio4 * 100) / 100;
  let consumedOthers = Math.round(finishedQty * ratioOthers * 100) / 100;

  const totalConsumed = consumed6No + consumed5No + consumed4_5No + consumed4No + consumedOthers;
  const diff = finishedQty - totalConsumed;
  if (diff !== 0) {
    const buckets = [
      { key: 'consumed6No', stock: stock6No },
      { key: 'consumed5No', stock: stock5No },
      { key: 'consumed4_5No', stock: stock4_5No },
      { key: 'consumed4No', stock: stock4No },
      { key: 'consumedOthers', stock: stockOthers },
    ];
    const values = { consumed6No, consumed5No, consumed4_5No, consumed4No, consumedOthers };
    for (const { key, stock } of buckets) {
      if (stock >= values[key] + diff) {
        values[key] += diff;
        break;
      }
    }
    ({ consumed6No, consumed5No, consumed4_5No, consumed4No, consumedOthers } = values);
  }

  return { consumed6No, consumed5No, consumed4_5No, consumed4No, consumedOthers };
}

export function calculateFinishedGoodsPrice(consumed, rates, finishedQuantity) {
  const finishedValue =
    (consumed.consumed6No || 0) * (rates.rate6No || 0) +
    (consumed.consumed5No || 0) * (rates.rate5No || 0) +
    (consumed.consumed4_5No || 0) * (rates.rate4_5No || 0) +
    (consumed.consumed4No || 0) * (rates.rate4No || 0) +
    (consumed.consumedOthers || 0) * (rates.rateOthers || 0);
  const roundedValue = Math.round(finishedValue * 100) / 100;
  const finishedRate =
    finishedQuantity > 0
      ? Math.round((roundedValue / finishedQuantity) * 100) / 100
      : 0;
  return { finishedRate, finishedValue: roundedValue };
}

export function getEffectiveLotStock(lotStock, editRow) {
  if (!lotStock) return null;
  if (!editRow || editRow.lotNumber !== lotStock.lotNumber) {
    return lotStock;
  }
  return {
    ...lotStock,
    stock6No: (lotStock.stock6No || 0) + (editRow.consumed6No || 0),
    stock5No: (lotStock.stock5No || 0) + (editRow.consumed5No || 0),
    stock4_5No: (lotStock.stock4_5No || 0) + (editRow.consumed4_5No || 0),
    stock4No: (lotStock.stock4No || 0) + (editRow.consumed4No || 0),
    stockOthers: (lotStock.stockOthers || 0) + (editRow.consumedOthers || 0),
    totalStock:
      (lotStock.stock6No || 0) +
      (lotStock.stock5No || 0) +
      (lotStock.stock4_5No || 0) +
      (lotStock.stock4No || 0) +
      (lotStock.stockOthers || 0) +
      (editRow.consumed6No || 0) +
      (editRow.consumed5No || 0) +
      (editRow.consumed4_5No || 0) +
      (editRow.consumed4No || 0) +
      (editRow.consumedOthers || 0),
  };
}

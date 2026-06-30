/**
 * Report stock boundaries (Indian FY aware).
 *
 * Opening = stock after all ledger movements through end of the calendar day
 * immediately before the report start date.
 *
 * Closing = stock after all ledger movements through end of the report end date.
 *
 * Example: period 02-May-2026 .. 30-May-2026
 *   openingAsOf → 01-May-2026 23:59:59.999
 *   closingAsOf → 30-May-2026 23:59:59.999
 *
 * FY 2026-27 (Apr 1 2026 – Mar 31 2027):
 *   openingAsOf → 31-Mar-2026 23:59:59.999 (previous FY closing)
 *   closingAsOf → 31-Mar-2027 23:59:59.999
 */
export function endOfDay(date) {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function startOfDay(date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function getReportStockDates(startDate, endDate) {
  const periodStart = startOfDay(startDate);
  const openingAsOf = new Date(periodStart);
  openingAsOf.setDate(openingAsOf.getDate() - 1);
  openingAsOf.setHours(23, 59, 59, 999);

  const closingAsOf = endOfDay(endDate);

  return {
    periodStart,
    periodEnd: closingAsOf,
    openingAsOf,
    closingAsOf,
  };
}

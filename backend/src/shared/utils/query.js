export function buildSearchFilter(search, fields) {
  if (!search?.trim()) return undefined;
  const term = search.trim();
  return {
    OR: fields.map((field) => ({
      [field]: { contains: term, mode: 'insensitive' },
    })),
  };
}

export function buildDateRange(startDate, endDate) {
  if (!startDate && !endDate) return undefined;
  const range = {};
  if (startDate) range.gte = new Date(startDate);
  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    range.lte = end;
  }
  return range;
}

export function endOfDay(date) {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
}

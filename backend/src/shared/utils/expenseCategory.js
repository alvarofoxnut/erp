const round2 = (n) => Math.round((n || 0) * 100) / 100;

/**
 * Collapse whitespace and lowercase for grouping (Salary / salary / SALARY → same key).
 */
export function categoryGroupKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Canonical category for storage and display (Title Case).
 */
export function normalizeExpenseCategory(value) {
  const collapsed = categoryGroupKey(value);
  if (!collapsed) return '';
  return collapsed
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Group expenses by normalized category; show each category the user entered (unified casing).
 */
export function groupExpensesByCategory(expenses, type) {
  const filtered = expenses.filter((e) => e.type === type);
  const byKey = new Map();

  for (const expense of filtered) {
    const label = normalizeExpenseCategory(expense.category);
    if (!label) continue;
    const key = categoryGroupKey(label);
    const row = byKey.get(key) || { label, amount: 0 };
    row.amount += expense.amount || 0;
    byKey.set(key, row);
  }

  const items = [...byKey.values()]
    .map((row) => ({ label: row.label, amount: round2(row.amount) }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return {
    items,
    total: round2(items.reduce((s, row) => s + row.amount, 0)),
  };
}

/** Merge expense line items from two units (e.g. combined report). */
export function mergeExpenseCategoryItems(aItems = [], bItems = []) {
  const byKey = new Map();

  for (const row of [...aItems, ...bItems]) {
    const label = normalizeExpenseCategory(row.label);
    if (!label) continue;
    const key = categoryGroupKey(label);
    const existing = byKey.get(key) || { label, amount: 0 };
    existing.amount += row.amount || 0;
    byKey.set(key, existing);
  }

  return [...byKey.values()]
    .map((row) => ({ label: row.label, amount: round2(row.amount) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

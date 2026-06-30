export const STOCK_UPDATED_EVENT = 'makhana:stock-updated';

export function notifyStockUpdated() {
  window.dispatchEvent(new CustomEvent(STOCK_UPDATED_EVENT));
}

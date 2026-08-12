import { useEffect } from 'react';
import { STOCK_UPDATED_EVENT } from '../utils/stockEvents';
import { invalidateDataCaches } from '../lib/queryClient';

/**
 * When any stock-affecting write succeeds, revalidate list/option caches
 * so Inventory / sales / production tabs cannot keep pre-write numbers.
 */
export default function QueryCacheSync() {
  useEffect(() => {
    const onStockUpdated = () => {
      invalidateDataCaches().catch(() => {});
    };
    window.addEventListener(STOCK_UPDATED_EVENT, onStockUpdated);
    return () => window.removeEventListener(STOCK_UPDATED_EVENT, onStockUpdated);
  }, []);

  return null;
}

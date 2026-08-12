import { useEffect } from 'react';
import { STOCK_UPDATED_EVENT } from '../utils/stockEvents';
import { invalidateStockRelatedCaches } from '../lib/queryClient';

/**
 * After stock-affecting writes, refresh stock panels, dashboard, and inventory caches.
 * List pages still invalidate their own endpoint in useDataTable.afterWrite.
 */
export default function QueryCacheSync() {
  useEffect(() => {
    const onStockUpdated = () => {
      invalidateStockRelatedCaches().catch(() => {});
    };
    window.addEventListener(STOCK_UPDATED_EVENT, onStockUpdated);
    return () => window.removeEventListener(STOCK_UPDATED_EVENT, onStockUpdated);
  }, []);

  return null;
}

import { useEffect } from 'react';
import { STOCK_UPDATED_EVENT } from '../utils/stockEvents';
import { queryClient } from '../lib/queryClient';

/**
 * After stock-affecting writes, refresh stock summary panels only.
 * List pages invalidate their own endpoint in useDataTable.afterWrite.
 */
export default function QueryCacheSync() {
  useEffect(() => {
    const onStockUpdated = () => {
      queryClient.invalidateQueries({ queryKey: ['resource'] }).catch(() => {});
    };
    window.addEventListener(STOCK_UPDATED_EVENT, onStockUpdated);
    return () => window.removeEventListener(STOCK_UPDATED_EVENT, onStockUpdated);
  }, []);

  return null;
}

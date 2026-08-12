import { QueryClient } from '@tanstack/react-query';

/** List/options cache: revisit tabs without waiting on Render every time. */
export const LIST_STALE_MS = 30_000;
/** Stock panels / dashboard: slightly shorter so numbers stay reasonably fresh. */
export const STOCK_STALE_MS = 20_000;

/**
 * ERP defaults:
 * - Memory only (no localStorage persistence)
 * - staleTime > 0 → tab switches reuse cache; writes invalidate explicitly
 * - refetchOnMount only when stale (not 'always')
 * - no refetch on every window focus (Render TTFB is expensive)
 */
export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: LIST_STALE_MS,
        gcTime: 10 * 60 * 1000,
        refetchOnMount: true,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        retry: 1,
      },
    },
  });
}

export const queryClient = createAppQueryClient();

export const queryKeys = {
  dataTable: (endpoint, params) =>
    (params === undefined ? ['dataTable', endpoint] : ['dataTable', endpoint, params]),
  fetchOptions: (endpoint) => ['fetchOptions', endpoint],
  resource: (endpoint) => ['resource', endpoint],
  dashboard: () => ['dashboard'],
  inventorySummary: () => ['inventory', 'summary'],
  inventoryLedger: (params) => ['inventory', 'ledger', params],
  finishedGoodsBatches: () => ['inventory', 'fgBatches'],
  ledgers: (businessUnit) => ['ledgers', businessUnit],
  ledgerEntries: (ledgerId, businessUnit, params) =>
    ['ledgers', businessUnit, 'entries', ledgerId, params],
};

/** Drop all cached API data (logout / session end). */
export function clearAppQueryCache() {
  queryClient.clear();
}

/** After stock-affecting writes — lists stay invalidated by useDataTable; refresh stock UIs. */
export function invalidateStockRelatedCaches() {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['resource'] }),
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard() }),
    queryClient.invalidateQueries({ queryKey: ['inventory'] }),
    queryClient.invalidateQueries({ queryKey: ['ledgers'] }),
  ]);
}

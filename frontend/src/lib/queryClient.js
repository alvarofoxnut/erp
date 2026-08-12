import { QueryClient } from '@tanstack/react-query';

/**
 * Conservative defaults for a data-critical ERP:
 * - Memory only (no localStorage persistence)
 * - staleTime 0 → always treat data as needing a refresh on mount/focus
 * - Cached rows can still paint instantly while a refetch runs
 * - Mutations must invalidate/refetch (see useDataTable)
 */
export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 0,
        gcTime: 5 * 60 * 1000,
        refetchOnMount: 'always',
        refetchOnWindowFocus: true,
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
};

/** Drop all cached API data (logout / session end). */
export function clearAppQueryCache() {
  queryClient.clear();
}

/** After stock-affecting writes, force lists/options to revalidate. */
export function invalidateDataCaches() {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['dataTable'] }),
    queryClient.invalidateQueries({ queryKey: ['fetchOptions'] }),
  ]);
}

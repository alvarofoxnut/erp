import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../services/api';
import { getErrorMessage } from '../utils/helpers';
import { notifyStockUpdated } from '../utils/stockEvents';
import { invalidateDataCaches, queryKeys } from '../lib/queryClient';

async function fetchDataTable(endpoint, params) {
  const { data: res } = await api.get(endpoint, { params });
  return {
    rows: res.data || [],
    pagination: res.pagination || { page: 1, totalPages: 1, total: 0 },
  };
}

export function useDataTable(endpoint, { initialParams = {}, notifyStock = true } = {}) {
  const queryClient = useQueryClient();
  const [params, setParams] = useState({ page: 1, limit: 10, ...initialParams });
  const [saving, setSaving] = useState(false);
  const writeLockRef = useRef(false);
  const lastErrorToast = useRef(null);

  const queryKey = queryKeys.dataTable(endpoint, params);

  const query = useQuery({
    queryKey,
    queryFn: () => fetchDataTable(endpoint, params),
    placeholderData: (previousData) => previousData,
  });

  useEffect(() => {
    if (!query.isError || !query.error) return;
    const message = getErrorMessage(query.error);
    if (lastErrorToast.current === message) return;
    lastErrorToast.current = message;
    toast.error(message);
  }, [query.isError, query.error]);

  useEffect(() => {
    if (query.isSuccess) lastErrorToast.current = null;
  }, [query.isSuccess]);

  const data = query.data?.rows ?? [];
  const pagination = query.data?.pagination ?? { page: 1, totalPages: 1, total: 0 };
  const loading = query.isLoading && !query.data;

  const updateParams = useCallback((updates) => {
    setParams((p) => ({ ...p, ...updates }));
  }, []);

  const setPage = useCallback((page) => {
    setParams((p) => ({ ...p, page }));
  }, []);

  const setSearch = useCallback((search) => {
    setParams((p) => ({ ...p, search, page: 1 }));
  }, []);

  const fetchData = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.dataTable(endpoint) });
    return query.refetch();
  }, [queryClient, endpoint, query]);

  /**
   * Revalidate caches after a successful write.
   * Runs in the background so the modal can close immediately after the API succeeds.
   */
  const afterWrite = useCallback(() => {
    const run = async () => {
      try {
        if (notifyStock) {
          notifyStockUpdated();
          await invalidateDataCaches();
        } else {
          await queryClient.invalidateQueries({ queryKey: queryKeys.dataTable(endpoint) });
          await queryClient.invalidateQueries({ queryKey: ['fetchOptions'] });
        }
        await query.refetch();
      } catch {
        // List will refresh on next mount/focus; write already succeeded on server
      }
    };
    void run();
  }, [notifyStock, queryClient, endpoint, query]);

  const withWriteLock = async (fn) => {
    if (writeLockRef.current) return false;
    writeLockRef.current = true;
    setSaving(true);
    try {
      return await fn();
    } finally {
      writeLockRef.current = false;
      setSaving(false);
    }
  };

  const createItem = async (payload, createEndpoint = endpoint) =>
    withWriteLock(async () => {
      try {
        await api.post(createEndpoint, payload);
        toast.success('Created successfully');
        afterWrite();
        return true;
      } catch (err) {
        toast.error(getErrorMessage(err));
        return false;
      }
    });

  const updateItem = async (id, payload) =>
    withWriteLock(async () => {
      try {
        await api.put(`${endpoint}/${id}`, payload);
        toast.success('Updated successfully');
        afterWrite();
        return true;
      } catch (err) {
        toast.error(getErrorMessage(err));
        return false;
      }
    });

  const deleteItem = async (id, deleteReason) =>
    withWriteLock(async () => {
      try {
        await api.delete(`${endpoint}/${id}`, { data: { deleteReason } });
        toast.success('Deleted successfully');
        afterWrite();
        return true;
      } catch (err) {
        toast.error(getErrorMessage(err));
        return false;
      }
    });

  return {
    data,
    pagination,
    loading,
    saving,
    params,
    updateParams,
    setPage,
    setSearch,
    fetchData,
    createItem,
    updateItem,
    deleteItem,
  };
}

export function useFetchOptions(endpoint) {
  const { data = [] } = useQuery({
    queryKey: queryKeys.fetchOptions(endpoint),
    queryFn: async () => {
      const { data: res } = await api.get(endpoint, { params: { limit: 100 } });
      return res.data || [];
    },
    staleTime: 60 * 1000,
    placeholderData: (previousData) => previousData,
  });

  return data;
}

/** Cached GET for summary/stock panels (WIP lots, quality stock, etc.). */
export function useResourceQuery(endpoint) {
  const query = useQuery({
    queryKey: queryKeys.resource(endpoint),
    queryFn: async () => {
      const { data: res } = await api.get(endpoint);
      return res.data || [];
    },
    placeholderData: (previousData) => previousData,
  });

  return {
    data: query.data ?? [],
    loading: query.isLoading && !query.data,
    refetch: query.refetch,
  };
}

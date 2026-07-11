import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../services/api';
import { getErrorMessage } from '../utils/helpers';
import { notifyStockUpdated } from '../utils/stockEvents';

export function useDataTable(endpoint, { initialParams = {}, notifyStock = true } = {}) {
  const [data, setData] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [params, setParams] = useState({ page: 1, limit: 10, ...initialParams });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: res } = await api.get(endpoint, { params });
      setData(res.data || []);
      setPagination(res.pagination || { page: 1, totalPages: 1, total: 0 });
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [endpoint, params]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const updateParams = (updates) => setParams((p) => ({ ...p, ...updates }));
  const setPage = (page) => updateParams({ page });
  const setSearch = (search) => updateParams({ search, page: 1 });

  const createItem = async (payload, createEndpoint = endpoint) => {
    try {
      await api.post(createEndpoint, payload);
      toast.success('Created successfully');
      if (notifyStock) notifyStockUpdated();
      fetchData();
      return true;
    } catch (err) {
      toast.error(getErrorMessage(err));
      return false;
    }
  };

  const updateItem = async (id, payload) => {
    try {
      await api.put(`${endpoint}/${id}`, payload);
      toast.success('Updated successfully');
      if (notifyStock) notifyStockUpdated();
      fetchData();
      return true;
    } catch (err) {
      toast.error(getErrorMessage(err));
      return false;
    }
  };

  const deleteItem = async (id, deleteReason) => {
    try {
      await api.delete(`${endpoint}/${id}`, { data: { deleteReason } });
      toast.success('Deleted successfully');
      if (notifyStock) notifyStockUpdated();
      fetchData();
      return true;
    } catch (err) {
      toast.error(getErrorMessage(err));
      return false;
    }
  };

  return { data, pagination, loading, params, updateParams, setPage, setSearch, fetchData, createItem, updateItem, deleteItem };
}

export function useFetchOptions(endpoint) {
  const [options, setOptions] = useState([]);

  useEffect(() => {
    api.get(endpoint, { params: { limit: 100 } })
      .then(({ data }) => setOptions(data.data || []))
      .catch(() => {});
  }, [endpoint]);

  return options;
}

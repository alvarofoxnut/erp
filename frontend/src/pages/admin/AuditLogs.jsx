import { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import LoadingSpinner from '../../components/LoadingSpinner';
import { PageHeader, Pagination, ListPageToolbar, EmptyState } from '../../components/common';
import { formatDateTime } from '../../utils/helpers';

export default function AuditLogs() {
  const [data, setData] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [params, setParams] = useState({ page: 1, limit: 10, search: '', startDate: '', endDate: '', module: '', action: '', financialYear: '' });
  const [filterOptions, setFilterOptions] = useState({ modules: [], actions: [] });

  const fetchLogs = useCallback(() => {
    setLoading(true);
    api.get('/audit/logs', { params })
      .then(({ data: res }) => {
        setData(res.data || []);
        setPagination(res.pagination || { page: 1, totalPages: 1 });
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [params]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);
  useEffect(() => {
    api.get('/audit/filter-options').then(({ data: res }) => setFilterOptions(res.data || {})).catch(() => {});
  }, []);

  const updateParams = (updates) => setParams((p) => ({ ...p, ...updates }));

  const handleExport = async () => {
    const { data: blob } = await api.get('/audit/logs/export', { params, responseType: 'blob' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'audit-logs.xlsx';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader title="Audit Logs" subtitle="Complete trail of all ERP actions" />

      <ListPageToolbar
        search={params.search}
        onSearchChange={(v) => updateParams({ search: v, page: 1 })}
        searchPlaceholder="Search user or description..."
        startDate={params.startDate}
        endDate={params.endDate}
        onStartChange={(v) => updateParams({ startDate: v, page: 1 })}
        onEndChange={(v) => updateParams({ endDate: v, page: 1 })}
        onExport={handleExport}
      />

      <div className="flex flex-wrap gap-3 mb-4">
        <select value={params.module} onChange={(e) => updateParams({ module: e.target.value, page: 1 })} className="input-field w-auto text-sm">
          <option value="">All Modules</option>
          {filterOptions.modules?.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={params.action} onChange={(e) => updateParams({ action: e.target.value, page: 1 })} className="input-field w-auto text-sm">
          <option value="">All Actions</option>
          {filterOptions.actions?.map((a) => <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>)}
        </select>
        <input
          type="text"
          placeholder="Financial Year (e.g. 2025-26)"
          value={params.financialYear}
          onChange={(e) => updateParams({ financialYear: e.target.value, page: 1 })}
          className="input-field w-auto text-sm"
        />
      </div>

      {loading ? <LoadingSpinner className="py-12" /> : (
        <>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>User</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {data.length === 0 ? (
                  <tr><td colSpan={3}><EmptyState message="No audit logs found" /></td></tr>
                ) : data.map((log) => (
                  <tr key={log._id || log.id}>
                    <td className="text-sm whitespace-nowrap">{formatDateTime(log.createdAt)}</td>
                    <td>{log.user?.name || 'System'}</td>
                    <td>{log.description || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={pagination.page} totalPages={pagination.totalPages} onPageChange={(p) => updateParams({ page: p })} />
        </>
      )}
    </div>
  );
}

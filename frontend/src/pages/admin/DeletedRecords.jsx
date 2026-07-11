import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../services/api';
import { PageHeader, Pagination, ListPageToolbar, EmptyState } from '../components/common';
import { formatDateTime } from '../utils/helpers';
import { getErrorMessage } from '../utils/helpers';
import LoadingSpinner from '../components/LoadingSpinner';

export default function DeletedRecords() {
  const [modules, setModules] = useState([]);
  const [module, setModule] = useState('');
  const [data, setData] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [restoringId, setRestoringId] = useState(null);

  useEffect(() => {
    api.get('/deleted/modules')
      .then(({ data: res }) => {
        const list = res.data || [];
        setModules(list);
        if (list.length && !module) setModule(list[0].key);
      })
      .catch(() => toast.error('Failed to load modules'));
  }, [module]);

  const fetchData = useCallback(() => {
    if (!module) return;
    setLoading(true);
    api.get(`/deleted/${module}`, { params: { search, page, limit: 10 } })
      .then(({ data: res }) => {
        setData(res.data || []);
        setPagination(res.pagination || { page: 1, totalPages: 1 });
      })
      .catch((err) => toast.error(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [module, search, page]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRestore = async (item) => {
    if (!window.confirm(`Restore "${item.label}"? Stock and ledger entries will be re-applied.`)) return;
    setRestoringId(item.id);
    try {
      await api.post(`/deleted/${module}/${item.id}/restore`);
      toast.success('Record restored');
      fetchData();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Deleted Records"
        subtitle="Admin-only trash view. Restore records to make them visible again."
      />

      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={module}
          onChange={(e) => { setModule(e.target.value); setPage(1); }}
          className="input-field w-auto min-w-[220px]"
        >
          {modules.map((m) => (
            <option key={m.key} value={m.key}>{m.label}</option>
          ))}
        </select>
      </div>

      <ListPageToolbar
        search={search}
        onSearchChange={(v) => { setSearch(v); setPage(1); }}
        searchPlaceholder="Search deleted records..."
      />

      {loading ? <LoadingSpinner className="py-12" /> : (
        <>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Record</th>
                  <th>Deleted at</th>
                  <th>Deleted by</th>
                  <th>Reason</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.length === 0 ? (
                  <tr>
                    <td colSpan={5}><EmptyState message="No deleted records in this module" /></td>
                  </tr>
                ) : data.map((row) => (
                  <tr key={row.id}>
                    <td className="font-medium">{row.label}</td>
                    <td>{row.deletedAt ? formatDateTime(row.deletedAt) : '—'}</td>
                    <td>{row.deletedBy?.name || '—'}</td>
                    <td className="max-w-xs truncate">{row.deleteReason || '—'}</td>
                    <td>
                      <button
                        type="button"
                        className="text-primary-600 hover:underline text-sm font-medium disabled:opacity-50"
                        disabled={restoringId === row.id}
                        onClick={() => handleRestore(row)}
                      >
                        {restoringId === row.id ? 'Restoring…' : 'Restore'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination pagination={pagination} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}

import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import LoadingSpinner from '../../components/LoadingSpinner';
import { PageHeader, EmptyState, ListPageToolbar } from '../../components/common';
import { formatCurrency, formatDate, getErrorMessage } from '../../utils/helpers';

const UNIT_LABELS = {
  manufacturing: 'Manufacturing',
  trading: 'Trading',
};

export default function Ledgers({ businessUnit = 'manufacturing' }) {
  const unitLabel = UNIT_LABELS[businessUnit] || businessUnit;
  const [ledgers, setLedgers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [params, setParams] = useState({ startDate: '', endDate: '' });

  const loadLedgers = useCallback(() => {
    setLoading(true);
    api.get('/accounting/ledgers', { params: { businessUnit } })
      .then(({ data }) => setLedgers(data.data || []))
      .catch((err) => toast.error(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [businessUnit]);

  useEffect(() => { loadLedgers(); }, [loadLedgers]);

  const loadEntries = (ledger) => {
    setSelected(ledger);
    api.get(`/accounting/ledgers/${ledger._id}/entries`, {
      params: {
        businessUnit,
        startDate: params.startDate || undefined,
        endDate: params.endDate || undefined,
        limit: 200,
      },
    })
      .then(({ data }) => setEntries(data.data || []))
      .catch((err) => toast.error(getErrorMessage(err)));
  };

  const handleExport = async () => {
    try {
      const rows = [];
      for (const ledger of ledgers) {
        const { data: res } = await api.get(`/accounting/ledgers/${ledger._id}/entries`, {
          params: { businessUnit, startDate: params.startDate, endDate: params.endDate, limit: 10000 },
        });
        for (const e of res.data || []) {
          rows.push({
            Ledger: ledger.name,
            Type: ledger.type,
            Date: formatDate(e.date),
            Debit: e.debit || 0,
            Credit: e.credit || 0,
            Balance: e.balanceAfter,
            Narration: e.narration || '',
          });
        }
      }
      if (!rows.length) {
        toast.error('No ledger entries to export');
        return;
      }
      const { exportToExcel } = await import('../../utils/export');
      exportToExcel(rows, `${businessUnit}-ledgers`);
      toast.success('Exported to Excel');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  if (loading) return <LoadingSpinner className="py-20" />;

  return (
    <div>
      <PageHeader
        title={`${unitLabel} Ledgers`}
        subtitle={`Cash, Bank, Sales, Purchases, Expenses — ${unitLabel.toLowerCase()} books only`}
      />

      <ListPageToolbar
        showSearch={false}
        startDate={params.startDate}
        endDate={params.endDate}
        onStartChange={(v) => setParams((p) => ({ ...p, startDate: v }))}
        onEndChange={(v) => setParams((p) => ({ ...p, endDate: v }))}
        onExport={handleExport}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card lg:col-span-1">
          <h3 className="font-semibold mb-4">Ledgers</h3>
          <div className="space-y-2">
            {ledgers.length === 0 ? (
              <p className="text-sm text-gray-500">No ledgers yet. Record a transaction to create ledgers.</p>
            ) : (
              ledgers.map((l) => (
                <button
                  key={l._id}
                  type="button"
                  onClick={() => loadEntries(l)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    selected?._id === l._id
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <p className="font-medium">{l.name}</p>
                  <p className="text-sm text-gray-500 capitalize">
                    {l.type} · {formatCurrency(l.currentBalance)}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>
        <div className="card lg:col-span-2">
          <h3 className="font-semibold mb-4">
            {selected ? `${selected.name} — Entries` : 'Select a ledger'}
          </h3>
          {selected ? (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr><th>Date</th><th>Debit</th><th>Credit</th><th>Balance</th><th>Narration</th></tr>
                </thead>
                <tbody>
                  {entries.length === 0 ? (
                    <tr><td colSpan={5}><EmptyState /></td></tr>
                  ) : (
                    entries.map((e) => (
                      <tr key={e._id}>
                        <td>{formatDate(e.date)}</td>
                        <td>{e.debit ? formatCurrency(e.debit) : '-'}</td>
                        <td>{e.credit ? formatCurrency(e.credit) : '-'}</td>
                        <td className="font-semibold">{formatCurrency(e.balanceAfter)}</td>
                        <td>{e.narration || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState message="Click a ledger to view entries" />
          )}
        </div>
      </div>
    </div>
  );
}

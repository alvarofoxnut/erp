import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import ConfirmDialog from '../components/ConfirmDialog';
import { PageHeader, SearchBar, Pagination, StatCard, EmptyState, DateRangeFilter } from '../components/common';
import { formatDate, formatNumber, formatCurrency, STOCK_LABELS, MOVEMENT_TYPE_LABELS, REFERENCE_TYPE_LABELS, getErrorMessage } from '../utils/helpers';
import { notifyStockUpdated } from '../utils/stockEvents';

const REF_ROUTES = {
  RawPurchase: '/manufacturing/raw-purchase',
  MachineEntry: '/manufacturing/machine-entry',
  QualityProduction: '/manufacturing/quality-production',
  FinishedProduction: '/manufacturing/finished-production',
  Purchase: '/trading/purchases',
  Sale: '/trading/sales',
  ManufacturingSale: '/manufacturing/sales',
  ManufacturingDamage: '/manufacturing/damages',
  TradingDamage: '/trading/damages',
};

const DELETE_ENDPOINTS = {
  RawPurchase: (id) => `/manufacturing/raw-purchases/${id}`,
  MachineEntry: (id) => `/manufacturing/machine-entries/${id}`,
  QualityProduction: (id) => `/manufacturing/quality-productions/${id}`,
  FinishedProduction: (id) => `/manufacturing/finished-productions/${id}`,
  Purchase: (id) => `/trading/purchases/${id}`,
  Sale: (id) => `/trading/sales/${id}`,
  ManufacturingSale: (id) => `/manufacturing/sales/${id}`,
  ManufacturingDamage: (id) => `/damages/manufacturing/${id}`,
  TradingDamage: (id) => `/damages/trading/${id}`,
};

export default function Inventory() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [params, setParams] = useState({
    page: 1,
    category: '',
    direction: '',
    movementType: '',
    search: '',
    startDate: '',
    endDate: '',
  });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [editConfirm, setEditConfirm] = useState(null);
  const [fgBatches, setFgBatches] = useState([]);

  const loadData = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get('/inventory/summary'),
      api.get('/inventory/ledger', { params }),
      api.get('/manufacturing/finished-goods-batches'),
    ])
      .then(([summaryRes, ledgerRes, batchesRes]) => {
        setSummary(summaryRes.data.data);
        setLedger(ledgerRes.data.data);
        setPagination(ledgerRes.data.pagination);
        setFgBatches(batchesRes.data.data || []);
      })
      .catch((err) => toast.error(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [params]);

  useEffect(() => { loadData(); }, [loadData]);

  const seenRefs = new Set();

  const updateParams = (updates) => setParams((p) => ({ ...p, ...updates }));

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const endpoint = DELETE_ENDPOINTS[deleteTarget.referenceType]?.(deleteTarget.referenceId);
    if (!endpoint) {
      toast.error('Cannot delete this entry type');
      return;
    }
    try {
      await api.delete(endpoint);
      toast.success('Entry deleted and stock recalculated');
      notifyStockUpdated();
      setDeleteTarget(null);
      loadData();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const handleEditConfirm = () => {
    if (!editConfirm) return;
    const path = REF_ROUTES[editConfirm.referenceType];
    if (path) {
      navigate(path, { state: { editId: editConfirm.referenceId } });
    } else {
      toast.error('Edit not available for this entry type');
    }
    setEditConfirm(null);
  };

  if (loading && !summary) return <LoadingSpinner className="py-20" />;

  const stockCards = summary
    ? Object.entries(summary).filter(
      ([k, v]) =>
        k !== 'tradingStock'
        && k !== 'brandedStock'
        && k !== 'brandedGoodsTotalPackets'
        && k !== 'brandedGoodsEquivalentKg'
        && k !== 'branded_goods'
        && typeof v === 'number'
    )
    : [];

  return (
    <div>
      <PageHeader title="Inventory" subtitle="Stock ledger — edit or delete entries (with confirmation)" />

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
        {stockCards.map(([key, value]) => (
          <StatCard key={key} title={STOCK_LABELS[key] || key} value={`${formatNumber(value)} KG`} color="primary" />
        ))}
      </div>

      {fgBatches.length > 0 && (
        <div className="card mb-6">
          <h3 className="font-semibold mb-4">Finished Goods Batches</h3>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Batch</th>
                  <th>Source Lot</th>
                  <th>Remaining (KG)</th>
                  <th>Cost (₹/KG)</th>
                  <th>Inventory Value</th>
                </tr>
              </thead>
              <tbody>
                {fgBatches.filter((b) => (b.remainingQuantity ?? 0) > 0).map((b) => (
                  <tr key={b.id}>
                    <td className="font-mono text-xs">{b.batchNumber}</td>
                    <td className="font-mono">{b.lotNumber || '—'}</td>
                    <td>{formatNumber(b.remainingQuantity)}</td>
                    <td>{formatCurrency(b.finishedRate)}</td>
                    <td>{formatCurrency(b.inventoryValue ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {summary?.brandedStock?.length > 0 && (
        <div className="card mb-6">
          <h3 className="font-semibold mb-4">Branded Stock</h3>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Brand</th>
                  <th>Packet Size</th>
                  <th>Available Packets</th>
                  <th>Equivalent Weight (KG)</th>
                </tr>
              </thead>
              <tbody>
                {summary.brandedStock.map((row) => (
                  <tr key={row.brandId}>
                    <td className="font-medium">{row.brandName}</td>
                    <td>{row.packetSizeGrams ? `${row.packetSizeGrams} gm` : '—'}</td>
                    <td className="font-semibold">{formatNumber(row.availablePackets)}</td>
                    <td>{formatNumber(row.equivalentWeightKg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {summary?.tradingStock?.length > 0 && (
        <div className="card mb-6">
          <h3 className="font-semibold mb-4">Trading Item Stock</h3>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Item Name</th>
                  <th>SKU</th>
                  <th>Available Stock (KG)</th>
                </tr>
              </thead>
              <tbody>
                {summary.tradingStock.map(({ item, balance }) => (
                  <tr key={item?._id || item}>
                    <td className="font-medium">{item?.name || 'Unknown'}</td>
                    <td className="text-sm text-gray-500">{item?.sku || '—'}</td>
                    <td className="font-semibold">{formatNumber(balance)} KG</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card">
        <div className="flex flex-col gap-4 mb-4">
          <SearchBar value={params.search} onChange={(v) => updateParams({ search: v, page: 1 })} placeholder="Search lot or source..." />
          <div className="flex flex-col sm:flex-row flex-wrap gap-3">
            <select value={params.category} onChange={(e) => updateParams({ category: e.target.value, page: 1 })} className="input-field w-auto">
              <option value="">All Categories</option>
              {Object.entries(STOCK_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select value={params.direction} onChange={(e) => updateParams({ direction: e.target.value, page: 1 })} className="input-field w-auto">
              <option value="">In / Out (All)</option>
              <option value="in">Stock In</option>
              <option value="out">Stock Out</option>
            </select>
            <select value={params.movementType} onChange={(e) => updateParams({ movementType: e.target.value, page: 1 })} className="input-field w-auto">
              <option value="">All Types</option>
              {Object.entries(MOVEMENT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <DateRangeFilter
              startDate={params.startDate}
              endDate={params.endDate}
              onStartChange={(v) => updateParams({ startDate: v, page: 1 })}
              onEndChange={(v) => updateParams({ endDate: v, page: 1 })}
            />
          </div>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead><tr><th>Date</th><th>Category</th><th>Direction</th><th>Qty</th><th>Balance</th><th>Lot / Brand</th><th>Source</th><th>Actions</th></tr></thead>
            <tbody>
              {ledger.length === 0 ? <tr><td colSpan={8}><EmptyState message="No stock movements" /></td></tr> : ledger.map((e) => {
                const refKey = `${e.referenceType}-${e.referenceId}`;
                const showActions = !seenRefs.has(refKey);
                if (showActions) seenRefs.add(refKey);
                const isBranded = e.category === 'branded_goods';
                const qtyUnit = isBranded ? 'pkts' : 'KG';
                return (
                  <tr key={e._id}>
                    <td>{formatDate(e.date)}</td>
                    <td>{STOCK_LABELS[e.category] || e.category}</td>
                    <td>
                      <span className={`px-2 py-0.5 text-xs rounded ${e.direction === 'in' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {e.direction === 'in' ? 'Stock In' : 'Stock Out'}
                      </span>
                    </td>
                    <td>{formatNumber(e.quantity)} {qtyUnit}</td>
                    <td className="font-semibold">{formatNumber(e.balanceAfter)} {qtyUnit}</td>
                    <td className="font-mono">{isBranded ? (e.brand?.name || '-') : (e.lotNumber || '-')}</td>
                    <td className="text-xs">{REFERENCE_TYPE_LABELS[e.referenceType] || e.referenceType || '-'}</td>
                    <td>
                      {showActions && REF_ROUTES[e.referenceType] && (
                        <div className="flex gap-2">
                          <button onClick={() => setEditConfirm(e)} className="text-blue-600 text-sm font-medium hover:underline">Edit</button>
                          <button onClick={() => setDeleteTarget(e)} className="text-red-600 text-sm font-medium hover:underline">Delete</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination page={pagination.page} totalPages={pagination.totalPages} onPageChange={(p) => updateParams({ page: p })} />
      </div>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete stock entry"
        message={`Delete the entire ${deleteTarget?.referenceType || 'transaction'}? All related ledger movements will be removed and stock recalculated.`}
        confirmLabel="Delete"
        variant="danger"
        doubleConfirm
      />
      <ConfirmDialog
        isOpen={!!editConfirm}
        onClose={() => setEditConfirm(null)}
        onConfirm={handleEditConfirm}
        title="Edit stock entry"
        message={`You will be taken to edit the source ${editConfirm?.referenceType || 'record'}. Stock will be recalculated on save.`}
        confirmLabel="Continue"
        variant="warning"
        doubleConfirm
      />
    </div>
  );
}

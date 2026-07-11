import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Plus } from 'lucide-react';
import api from '../../services/api';
import { useDataTable } from '../../hooks/useDataTable';
import LoadingSpinner from '../../components/LoadingSpinner';
import { EntryActions } from '../../components/ConfirmDialog';
import { PageHeader, Pagination, ListPageToolbar, Modal, EmptyState, FieldLabel } from '../../components/common';
import { formatDate, formatCurrency, formatNumber } from '../../utils/helpers';
import { exportFilteredList } from '../../utils/listExport';
import ExcelImportModal from '../../components/ExcelImportModal';
import { useExcelImport } from '../../hooks/useExcelImport';

function useVendors(active) {
  const [vendors, setVendors] = useState([]);
  const [loadingVendors, setLoadingVendors] = useState(false);

  const loadVendors = useCallback(() => {
    setLoadingVendors(true);
    api.get('/manufacturing/vendors', { params: { limit: 100 } })
      .then(({ data }) => setVendors(data.data || []))
      .catch(() => setVendors([]))
      .finally(() => setLoadingVendors(false));
  }, []);

  useEffect(() => { if (active) loadVendors(); }, [active, loadVendors]);
  return { vendors, loadingVendors, reloadVendors: loadVendors };
}

export default function RawPurchase() {
  const location = useLocation();
  const { data, pagination, loading, params, setPage, setSearch, updateParams, createItem, updateItem, deleteItem, fetchData } =
    useDataTable('/manufacturing/raw-purchases');
  const { onImport, importModalProps } = useExcelImport('raw-purchases', fetchData);
  const [modalOpen, setModalOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const { vendors, loadingVendors, reloadVendors } = useVendors(modalOpen);

  const openCreate = () => { setEditRow(null); setModalOpen(true); reloadVendors(); };
  const openEdit = (row) => { setEditRow(row); setModalOpen(true); reloadVendors(); };

  useEffect(() => {
    if (location.state?.editId && data.length) {
      const row = data.find((d) => d._id === location.state.editId);
      if (row) openEdit(row);
      window.history.replaceState({}, '');
    }
  }, [location.state, data]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      vendor: fd.get('vendor'),
      lotNumber: fd.get('lotNumber'),
      quantity: parseFloat(fd.get('quantity')),
      purchaseRate: parseFloat(fd.get('purchaseRate')),
      date: fd.get('date'),
    };
    const ok = editRow
      ? await updateItem(editRow._id, payload)
      : await createItem(payload, '/manufacturing/raw-purchases');
    if (ok) { setModalOpen(false); setEditRow(null); e.target.reset(); }
  };

  const handleExport = () => exportFilteredList(
    '/manufacturing/raw-purchases',
    params,
    (r) => ({
      Date: formatDate(r.date),
      Vendor: r.vendor?.name,
      'Lot Number': r.lotNumber,
      Quantity: r.quantity,
      Rate: r.purchaseRate,
      Amount: r.totalAmount,
    }),
    'raw-purchases'
  );

  const defaultDate = editRow?.date ? new Date(editRow.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

  return (
    <div>
      <PageHeader title="Raw Material Purchase" subtitle="Record raw makhana purchases from vendors"
        action={<button onClick={openCreate} className="btn-primary flex items-center gap-2"><Plus className="h-4 w-4" /> Add Purchase</button>} />

      <ListPageToolbar
        search={params.search || ''}
        onSearchChange={setSearch}
        searchPlaceholder="Search lot number..."
        startDate={params.startDate || ''}
        endDate={params.endDate || ''}
        onStartChange={(v) => updateParams({ startDate: v, page: 1 })}
        onEndChange={(v) => updateParams({ endDate: v, page: 1 })}
        onExport={handleExport}
        onImport={onImport}
      />

      {loading ? <LoadingSpinner className="py-12" /> : (
        <>
          <div className="table-container">
            <table className="data-table">
              <thead><tr><th>Date</th><th>Vendor</th><th>Lot No.</th><th>Qty (KG)</th><th>Rate</th><th>Amount</th><th>Actions</th></tr></thead>
              <tbody>
                {data.length === 0 ? <tr><td colSpan={7}><EmptyState /></td></tr> : data.map((r) => (
                  <tr key={r._id}>
                    <td>{formatDate(r.date)}</td><td>{r.vendor?.name}</td><td className="font-mono">{r.lotNumber}</td>
                    <td>{formatNumber(r.quantity)}</td><td>{formatCurrency(r.purchaseRate)}/KG</td><td>{formatCurrency(r.totalAmount)}</td>
                    <td><EntryActions onEdit={() => openEdit(r)} onDelete={(reason) => deleteItem(r._id, reason)} deleteTitle="Delete raw purchase" editTitle="Edit raw purchase" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage} />
        </>
      )}

      <Modal isOpen={modalOpen} onClose={() => { setModalOpen(false); setEditRow(null); }} title={editRow ? 'Edit Raw Purchase' : 'Add Raw Purchase'}>
        <form onSubmit={handleSubmit} className="space-y-4" key={editRow?._id || 'new'}>
          <div>
            <FieldLabel required>Vendor</FieldLabel>
            {loadingVendors ? <LoadingSpinner size="sm" className="py-2" /> : vendors.length === 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm">
                <p className="mb-2">No manufacturing vendors found.</p>
                <Link to="/manufacturing/vendors" onClick={() => setModalOpen(false)} className="text-primary-600 font-medium hover:underline">Add vendor first</Link>
              </div>
            ) : (
              <select name="vendor" required className="input-field" defaultValue={editRow?.vendor?._id || editRow?.vendor || ''}>
                <option value="">Select vendor</option>
                {vendors.map((v) => <option key={v._id} value={v._id}>{v.name}</option>)}
              </select>
            )}
          </div>
          <div><FieldLabel required>Lot Number</FieldLabel><input name="lotNumber" required defaultValue={editRow?.lotNumber} className="input-field" /></div>
          <div className="form-grid-2">
            <div><FieldLabel required>Quantity (KG)</FieldLabel><input name="quantity" type="number" step="0.01" min="0.01" required defaultValue={editRow?.quantity} className="input-field" /></div>
            <div><FieldLabel required>Rate (₹ per KG)</FieldLabel><input name="purchaseRate" type="number" step="0.01" min="0" required defaultValue={editRow?.purchaseRate} className="input-field" /></div>
          </div>
          <div><FieldLabel required>Date</FieldLabel><input name="date" type="date" required defaultValue={defaultDate} className="input-field" /></div>
          <button type="submit" disabled={vendors.length === 0} className="btn-primary w-full">{editRow ? 'Update' : 'Save'} Purchase</button>
        </form>
      </Modal>
      <ExcelImportModal {...importModalProps} />
    </div>
  );
}

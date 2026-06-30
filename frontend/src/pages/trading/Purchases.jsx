import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Plus } from 'lucide-react';
import api from '../../services/api';
import { useDataTable, useFetchOptions } from '../../hooks/useDataTable';
import LoadingSpinner from '../../components/LoadingSpinner';
import { EntryActions } from '../../components/ConfirmDialog';
import { AmountQuantityFields } from '../../components/AmountQuantityFields';
import { PageHeader, Pagination, ListPageToolbar, Modal, EmptyState, FieldLabel } from '../../components/common';
import { formatDate, formatCurrency, formatNumber } from '../../utils/helpers';
import { exportFilteredList } from '../../utils/listExport';
import ExcelImportModal from '../../components/ExcelImportModal';
import { useExcelImport } from '../../hooks/useExcelImport';

export default function Purchases() {
  const location = useLocation();
  const {data, pagination, loading, params, setPage, setSearch, updateParams, createItem, updateItem, deleteItem, fetchData } =
    useDataTable('/trading/purchases');
  const { onImport, importModalProps } = useExcelImport('trading-purchases', fetchData);

  const items = useFetchOptions('/trading/items');
  const [modalOpen, setModalOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [selectedItem, setSelectedItem] = useState('');
  const [vendors, setVendors] = useState([]);
  const [loadingVendors, setLoadingVendors] = useState(false);

  const openEdit = (row) => {
    setEditRow(row);
    setSelectedItem(row.item?._id || row.item || '');
    setModalOpen(true);
  };

  useEffect(() => {
    if (location.state?.editId && data.length) {
      const row = data.find((d) => d._id === location.state.editId);
      if (row) openEdit(row);
      window.history.replaceState({}, '');
    }
  }, [location.state, data]);

  useEffect(() => {
    if (!modalOpen || !selectedItem) {
      setVendors([]);
      return;
    }
    setLoadingVendors(true);
    api.get('/trading/parties', { params: { type: 'vendor', item: selectedItem, limit: 100 } })
      .then(({ data: res }) => setVendors(res.data || []))
      .catch(() => setVendors([]))
      .finally(() => setLoadingVendors(false));
  }, [modalOpen, selectedItem]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      date: fd.get('date'),
      party: fd.get('party'),
      item: fd.get('item'),
      quantity: parseFloat(fd.get('quantity')),
      rate: parseFloat(fd.get('rate') || 0),
      amount: parseFloat(fd.get('amount')),
    };
    const ok = editRow ? await updateItem(editRow._id, payload) : await createItem(payload);
    if (ok) { setModalOpen(false); setEditRow(null); }
  };

  const defaultDate = editRow?.date ? new Date(editRow.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
  const unit = items.find((i) => i._id === selectedItem)?.unit || 'KG';

  const handleExport = () => exportFilteredList(
    '/trading/purchases',
    params,
    (r) => ({
      'S.No': r.serialNumber,
      Date: formatDate(r.date),
      Vendor: r.party?.name,
      Item: r.item?.name,
      Quantity: r.quantity,
      'Rate/KG': r.rate,
      Total: r.amount,
    }),
    'trading-purchases'
  );

  return (
    <div>
      <PageHeader title="Trading Purchases" subtitle="Purchase trading items — increases stock"
        action={<button onClick={() => { setEditRow(null); setSelectedItem(''); setModalOpen(true); }} className="btn-primary flex items-center gap-2"><Plus className="h-4 w-4" /> Add Purchase</button>} />
      <ListPageToolbar
        search={params.search || ''}
        onSearchChange={setSearch}
        searchPlaceholder="Search serial no..."
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
              <thead><tr><th>S.No</th><th>Date</th><th>Vendor</th><th>Item</th><th>Qty</th><th>Rate/KG</th><th>Total</th><th>Actions</th></tr></thead>
              <tbody>
                {data.length === 0 ? <tr><td colSpan={8}><EmptyState /></td></tr> : data.map((r) => (
                  <tr key={r._id}>
                    <td className="font-mono">{r.serialNumber}</td><td>{formatDate(r.date)}</td><td>{r.party?.name}</td>
                    <td>{r.item?.name}</td><td>{formatNumber(r.quantity)}</td><td>{formatCurrency(r.rate)}</td><td>{formatCurrency(r.amount)}</td>
                    <td><EntryActions onEdit={() => openEdit(r)} onDelete={() => deleteItem(r._id)} deleteTitle="Delete purchase" editTitle="Edit purchase" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage} />
        </>
      )}

      <Modal isOpen={modalOpen} onClose={() => { setModalOpen(false); setEditRow(null); }} title={editRow ? 'Edit Purchase' : 'Add Purchase'}>
        <form onSubmit={handleSubmit} className="space-y-4" key={editRow?._id || 'new'}>
          <div><FieldLabel required>Date</FieldLabel><input name="date" type="date" required defaultValue={defaultDate} className="input-field" /></div>
          <div>
            <FieldLabel required>Item</FieldLabel>
            <select name="item" required className="input-field" value={selectedItem} onChange={(e) => setSelectedItem(e.target.value)}>
              <option value="">Select item first</option>
              {items.map((i) => <option key={i._id} value={i._id}>{i.name}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel required>Vendor</FieldLabel>
            {!selectedItem ? (
              <p className="text-xs text-gray-500">Select an item to see vendors who supply it.</p>
            ) : loadingVendors ? (
              <LoadingSpinner size="sm" className="py-2" />
            ) : vendors.length === 0 ? (
              <p className="text-xs text-amber-600">No vendors supply this item. Add the item under Trading → Vendors.</p>
            ) : (
              <select name="party" required className="input-field" defaultValue={editRow?.party?._id || editRow?.party || ''}>
                <option value="">Select vendor</option>
                {vendors.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
              </select>
            )}
          </div>
          <AmountQuantityFields
            defaultQuantity={editRow?.quantity}
            defaultRate={editRow?.rate}
            defaultAmount={editRow?.amount}
            unit={unit}
          />
          <button type="submit" disabled={!selectedItem || vendors.length === 0} className="btn-primary w-full">{editRow ? 'Update' : 'Save'} Purchase</button>
        </form>
      </Modal>
      <ExcelImportModal {...importModalProps} />
    </div>
  );
}

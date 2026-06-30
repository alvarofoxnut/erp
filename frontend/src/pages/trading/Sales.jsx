import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { useDataTable, useFetchOptions } from '../../hooks/useDataTable';
import LoadingSpinner from '../../components/LoadingSpinner';
import { EntryActions } from '../../components/ConfirmDialog';
import { AmountQuantityFields, CustomerDetailsFields, parseCustomerDetails } from '../../components/AmountQuantityFields';
import { PageHeader, Pagination, ListPageToolbar, Modal, EmptyState, FieldLabel } from '../../components/common';
import { formatDate, formatCurrency, formatNumber } from '../../utils/helpers';
import { exportFilteredList } from '../../utils/listExport';
import ExcelImportModal from '../../components/ExcelImportModal';
import { useExcelImport } from '../../hooks/useExcelImport';
import api from '../../services/api';

export default function Sales() {
  const location = useLocation();
  const {data, pagination, loading, params, setPage, setSearch, updateParams, createItem, updateItem, deleteItem, fetchData } =
    useDataTable('/trading/sales');
  const { onImport, importModalProps } = useExcelImport('trading-sales', fetchData);

  const items = useFetchOptions('/trading/items');
  const [modalOpen, setModalOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [selectedItem, setSelectedItem] = useState('');
  const [availableStock, setAvailableStock] = useState(null);

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
      setAvailableStock(null);
      return;
    }
    api.get('/inventory/summary')
      .then(({ data: res }) => {
        const tradingStock = res.data?.tradingStock || [];
        const row = tradingStock.find((t) => (t.item?._id || t.item)?.toString() === selectedItem);
        setAvailableStock(row?.balance ?? 0);
      })
      .catch(() => setAvailableStock(null));
  }, [modalOpen, selectedItem]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const quantity = parseFloat(fd.get('quantity'));
    if (availableStock !== null && quantity > availableStock) {
      toast.error(`Insufficient trading stock. Available: ${formatNumber(availableStock)}`);
      return;
    }
    const payload = {
      date: fd.get('date'),
      item: fd.get('item'),
      ...parseCustomerDetails(fd),
      quantity,
      rate: parseFloat(fd.get('rate') || 0),
      amount: parseFloat(fd.get('amount')),
    };
    const ok = editRow ? await updateItem(editRow._id, payload) : await createItem(payload);
    if (ok) { setModalOpen(false); setEditRow(null); }
  };

  const defaultDate = editRow?.date ? new Date(editRow.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
  const handleExport = () => exportFilteredList(
    '/trading/sales',
    params,
    (r) => ({
      'S.No': r.serialNumber,
      Date: formatDate(r.date),
      Customer: r.customerName,
      Item: r.item?.name,
      Quantity: r.quantity,
      'Rate/KG': r.rate,
      Total: r.amount,
    }),
    'trading-sales'
  );

  const customerDefaults = editRow ? {
    name: editRow.customerName,
    phone: editRow.customerPhone,
    email: editRow.customerEmail,
    address: editRow.customerAddress,
  } : {};

  return (
    <div>
      <PageHeader title="Trading Sales" subtitle="Sell trading items — decreases trading stock"
        action={<button onClick={() => { setEditRow(null); setSelectedItem(''); setModalOpen(true); }} className="btn-primary flex items-center gap-2"><Plus className="h-4 w-4" /> Add Sale</button>} />
      <ListPageToolbar
        search={params.search || ''}
        onSearchChange={setSearch}
        searchPlaceholder="Search serial no. or customer..."
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
              <thead><tr><th>S.No</th><th>Date</th><th>Customer</th><th>Item</th><th>Qty</th><th>Rate/KG</th><th>Total</th><th>Actions</th></tr></thead>
              <tbody>
                {data.length === 0 ? <tr><td colSpan={8}><EmptyState /></td></tr> : data.map((r) => (
                  <tr key={r._id}>
                    <td className="font-mono">{r.serialNumber}</td><td>{formatDate(r.date)}</td>
                    <td>{r.customerName}</td><td>{r.item?.name}</td>
                    <td>{formatNumber(r.quantity)}</td><td>{formatCurrency(r.rate)}</td><td>{formatCurrency(r.amount)}</td>
                    <td><EntryActions onEdit={() => openEdit(r)} onDelete={() => deleteItem(r._id)} deleteTitle="Delete sale" editTitle="Edit sale" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage} />
        </>
      )}

      <Modal isOpen={modalOpen} onClose={() => { setModalOpen(false); setEditRow(null); }} title={editRow ? 'Edit Sale' : 'Add Sale'}>
        <form onSubmit={handleSubmit} className="space-y-4" key={editRow?._id || 'new'}>
          <div><FieldLabel required>Date</FieldLabel><input name="date" type="date" required defaultValue={defaultDate} className="input-field" /></div>
          <div>
            <FieldLabel required>Item</FieldLabel>
            <select name="item" required className="input-field" value={selectedItem} onChange={(e) => setSelectedItem(e.target.value)}>
              <option value="">Select item</option>
              {items.map((i) => <option key={i._id} value={i._id}>{i.name}</option>)}
            </select>
            {availableStock !== null && selectedItem && (
              <p className="text-xs text-gray-500 mt-1">Available stock: {formatNumber(availableStock)}</p>
            )}
          </div>
          <CustomerDetailsFields defaults={customerDefaults} />
          <AmountQuantityFields
            defaultQuantity={editRow?.quantity}
            defaultRate={editRow?.rate}
            defaultAmount={editRow?.amount}
            unit={items.find((i) => i._id === selectedItem)?.unit || 'KG'}
          />
          <button type="submit" className="btn-primary w-full">{editRow ? 'Update' : 'Save'} Sale</button>
        </form>
      </Modal>
      <ExcelImportModal {...importModalProps} />
    </div>
  );
}

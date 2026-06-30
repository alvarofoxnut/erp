import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { useDataTable } from '../../hooks/useDataTable';
import LoadingSpinner from '../../components/LoadingSpinner';
import { EntryActions } from '../../components/ConfirmDialog';
import { AmountQuantityFields, CustomerDetailsFields, parseCustomerDetails } from '../../components/AmountQuantityFields';
import { PageHeader, Pagination, ListPageToolbar, Modal, EmptyState, FieldLabel } from '../../components/common';
import { formatDate, formatCurrency, formatNumber } from '../../utils/helpers';
import { exportFilteredList } from '../../utils/listExport';
import ExcelImportModal from '../../components/ExcelImportModal';
import { useExcelImport } from '../../hooks/useExcelImport';
import api from '../../services/api';
import {
  packetsFromGrossKg,
  grossKgFromPackets,
  qualityPerPacketGrams,
} from '../../utils/brandedPackaging';

export default function ManufacturingSales() {
  const location = useLocation();
  const { data, pagination, loading, params, setPage, setSearch, updateParams, createItem, updateItem, deleteItem, fetchData } =
    useDataTable('/manufacturing/sales');
  const { onImport, importModalProps } = useExcelImport('manufacturing-sales', fetchData);

  const [modalOpen, setModalOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [saleType, setSaleType] = useState('loose');
  const [availableStock, setAvailableStock] = useState(null);
  const [saleAllocations, setSaleAllocations] = useState([]);
  const [brands, setBrands] = useState([]);
  const [selectedBrandId, setSelectedBrandId] = useState('');
  const [brandedQuantity, setBrandedQuantity] = useState('');
  const [brandedRate, setBrandedRate] = useState('');
  const [brandedAmount, setBrandedAmount] = useState('');

  const isBranded = saleType === 'branded';
  const selectedBrand = brands.find((b) => (b._id || b.id) === selectedBrandId);
  const calculatedPackets = isBranded && selectedBrand
    ? packetsFromGrossKg(selectedBrand, parseFloat(brandedQuantity))
    : 0;

  const openCreate = () => {
    setEditRow(null);
    setSaleType('loose');
    setSelectedBrandId('');
    setBrandedQuantity('');
    setBrandedRate('');
    setBrandedAmount('');
    setModalOpen(true);
  };

  const openEdit = (row) => {
    const type = row.saleType || 'loose';
    setEditRow(row);
    setSaleType(type);
    setSelectedBrandId(row.brandId || row.brand?._id || row.brand?.id || '');
    const brand = row.brand;
    const qty = row.quantity > 0
      ? row.quantity
      : grossKgFromPackets(brand, row.packetCount ?? 0);
    setBrandedQuantity(qty != null && qty > 0 ? String(qty) : '');
    setBrandedRate(row.rate != null ? String(row.rate) : '');
    setBrandedAmount(row.amount != null ? String(row.amount) : '');
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
    if (!modalOpen) return;
    if (isBranded) {
      api.get('/manufacturing/brands/options')
        .then(({ data: res }) => setBrands(res.data || []))
        .catch(() => setBrands([]));
      if (selectedBrandId) {
        api.get(`/manufacturing/brands/${selectedBrandId}/stock`)
          .then(({ data: res }) => setAvailableStock(res.data?.balance ?? 0))
          .catch(() => setAvailableStock(null));
      } else {
        setAvailableStock(null);
      }
      setSaleAllocations([]);
    } else {
      api.get('/manufacturing/finished-goods-stock')
        .then(({ data: res }) => setAvailableStock(res.data?.balance ?? 0))
        .catch(() => setAvailableStock(null));
      if (editRow?._id) {
        api.get(`/manufacturing/sales/${editRow._id}/allocations`)
          .then(({ data: res }) => setSaleAllocations(res.data || []))
          .catch(() => setSaleAllocations([]));
      } else {
        setSaleAllocations([]);
      }
    }
  }, [modalOpen, editRow, isBranded, selectedBrandId]);

  useEffect(() => {
    const packets = calculatedPackets;
    const rate = parseFloat(brandedRate);
    if (!Number.isNaN(packets) && !Number.isNaN(rate) && packets > 0 && rate >= 0) {
      setBrandedAmount(String(Math.round(packets * rate * 100) / 100));
    }
  }, [calculatedPackets, brandedRate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);

    if (isBranded) {
      const quantity = parseFloat(brandedQuantity);
      const packets = calculatedPackets;
      if (!quantity || quantity <= 0) {
        toast.error('Enter total quantity sold (KG)');
        return;
      }
      if (!packets || packets <= 0) {
        toast.error('Quantity is too small for one packet at this brand size');
        return;
      }
      if (availableStock !== null && packets > availableStock) {
        toast.error(`Insufficient branded stock. Available: ${formatNumber(availableStock)} packets`);
        return;
      }
      const payload = {
        saleType: 'branded',
        date: fd.get('date'),
        ...parseCustomerDetails(fd),
        brandId: selectedBrandId,
        quantity,
        rate: parseFloat(brandedRate || 0),
        amount: parseFloat(brandedAmount || 0),
      };
      const ok = editRow ? await updateItem(editRow._id, payload) : await createItem(payload);
      if (ok) { setModalOpen(false); setEditRow(null); }
      return;
    }

    const quantity = parseFloat(fd.get('quantity'));
    if (availableStock !== null && quantity > availableStock) {
      toast.error(`Insufficient finished goods stock. Available: ${formatNumber(availableStock)} KG`);
      return;
    }
    const payload = {
      saleType: 'loose',
      date: fd.get('date'),
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
    '/manufacturing/sales',
    params,
    (r) => ({
      'S.No': r.serialNumber,
      Type: r.saleType === 'branded' ? 'Branded' : 'Loose',
      Date: formatDate(r.date),
      Customer: r.customerName,
      Brand: r.brand?.name || '',
      'Packet Size': r.brand?.packetSizeGrams ? `${r.brand.packetSizeGrams} gm` : '',
      'Qty (KG)': r.quantity,
      Packets: r.packetCount ?? '',
      Rate: r.rate,
      Total: r.amount,
    }),
    'manufacturing-sales'
  );

  const customerDefaults = editRow ? {
    name: editRow.customerName,
    phone: editRow.customerPhone,
    email: editRow.customerEmail,
    address: editRow.customerAddress,
  } : {};

  return (
    <div>
      <PageHeader
        title="Manufacturing Sales"
        subtitle="Sell loose finished goods (KG) or branded packets"
        action={
          <button onClick={openCreate} className="btn-primary flex items-center gap-2">
            <Plus className="h-4 w-4" /> Add Sale
          </button>
        }
      />
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
              <thead>
                <tr>
                  <th>S.No</th>
                  <th>Type</th>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Product</th>
                  <th>Qty</th>
                  <th>Rate</th>
                  <th>Total</th>
                  <th>COGS</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.length === 0 ? (
                  <tr><td colSpan={10}><EmptyState message="No manufacturing sales yet." /></td></tr>
                ) : data.map((r) => {
                  const branded = r.saleType === 'branded';
                  return (
                    <tr key={r._id}>
                      <td className="font-mono">{r.serialNumber}</td>
                      <td className="capitalize">{branded ? 'Branded' : 'Loose'}</td>
                      <td>{formatDate(r.date)}</td>
                      <td>{r.customerName}</td>
                      <td>
                        {branded
                          ? `${r.brand?.name || '—'} (${r.brand?.packetSizeGrams || '—'} gm)`
                          : 'Finished Goods'}
                      </td>
                      <td>
                        {branded
                          ? `${formatNumber(r.quantity)} KG (${formatNumber(r.packetCount)} pkt)`
                          : `${formatNumber(r.quantity)} KG`}
                      </td>
                      <td>{formatCurrency(r.rate)}{branded ? '/pkt' : '/KG'}</td>
                      <td>{formatCurrency(r.amount)}</td>
                      <td>{formatCurrency(r.costOfGoodsSold ?? 0)}</td>
                      <td>
                        <EntryActions
                          onEdit={() => openEdit(r)}
                          onDelete={() => deleteItem(r._id)}
                          deleteTitle="Delete manufacturing sale"
                          editTitle="Edit manufacturing sale"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage} />
        </>
      )}

      <Modal isOpen={modalOpen} onClose={() => { setModalOpen(false); setEditRow(null); }} title={editRow ? 'Edit Manufacturing Sale' : 'Add Manufacturing Sale'}>
        <form onSubmit={handleSubmit} className="space-y-4" key={`${editRow?._id || 'new'}-${saleType}`}>
          <div>
            <FieldLabel required>Sale Type</FieldLabel>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="saleType"
                  value="loose"
                  checked={!isBranded}
                  onChange={() => setSaleType('loose')}
                  disabled={!!editRow}
                />
                Loose Sale
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="saleType"
                  value="branded"
                  checked={isBranded}
                  onChange={() => setSaleType('branded')}
                  disabled={!!editRow}
                />
                Branded Sale
              </label>
            </div>
          </div>

          <div><FieldLabel required>Date</FieldLabel><input name="date" type="date" required defaultValue={defaultDate} className="input-field" /></div>

          {isBranded ? (
            <>
              <div>
                <FieldLabel required>Brand</FieldLabel>
                <select
                  className="input-field"
                  value={selectedBrandId}
                  onChange={(e) => setSelectedBrandId(e.target.value)}
                  required
                >
                  <option value="">Select brand</option>
                  {brands.map((b) => (
                    <option key={b._id || b.id} value={b._id || b.id}>
                      {b.name} — {b.packetSizeGrams} gm
                    </option>
                  ))}
                </select>
              </div>
              {selectedBrand && (
                <p className="text-sm text-gray-500">
                  Packet size: <strong>{selectedBrand.packetSizeGrams} gm</strong>
                  {selectedBrand.packingWeightGrams ? (
                    <> (packing {selectedBrand.packingWeightGrams} gm + foxnut {qualityPerPacketGrams(selectedBrand)} gm)</>
                  ) : null}
                </p>
              )}
              {availableStock !== null && (
                <p className="text-sm text-gray-500">Available packets: <strong>{formatNumber(availableStock)}</strong></p>
              )}
              <div>
                <FieldLabel required>Total Gross Weight Sold (KG)</FieldLabel>
                <input
                  type="number"
                  step="any"
                  min="0.01"
                  className="input-field"
                  value={brandedQuantity}
                  onChange={(e) => setBrandedQuantity(e.target.value)}
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Gross packed weight (full packet size). E.g. 50 KG ÷ 0.25 KG/packet = 200 packets for a 250 gm brand.
                </p>
              </div>
              {calculatedPackets > 0 && (
                <p className="text-sm text-primary-700 dark:text-primary-300 font-medium">
                  Packets to sell: <strong>{formatNumber(calculatedPackets)}</strong>
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel required>Rate per Packet (₹)</FieldLabel>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    className="input-field"
                    value={brandedRate}
                    onChange={(e) => setBrandedRate(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <FieldLabel required>Total Amount (₹)</FieldLabel>
                  <input type="number" step="any" className="input-field" value={brandedAmount} readOnly required />
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3 text-sm">
                <span className="text-gray-500">Product:</span> <strong>Finished Goods (Makhana)</strong>
                {availableStock !== null && (
                  <p className="text-xs text-gray-500 mt-1">Available stock: {formatNumber(availableStock)} KG</p>
                )}
              </div>
              {editRow && saleAllocations.length > 0 && (
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 text-sm">
                  <p className="font-medium mb-2">FIFO batch allocation</p>
                  <ul className="space-y-1 text-gray-600 dark:text-gray-400">
                    {saleAllocations.map((a) => (
                      <li key={a.id}>
                        {a.batch?.batchNumber || a.batchId}: {formatNumber(a.quantity)} KG @ {formatCurrency(a.costPerKg)}/KG
                        {' '}(cost {formatCurrency(a.totalCost)})
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <AmountQuantityFields
                defaultQuantity={editRow?.saleType === 'branded' ? '' : editRow?.quantity}
                defaultRate={editRow?.saleType === 'branded' ? '' : editRow?.rate}
                defaultAmount={editRow?.saleType === 'branded' ? '' : editRow?.amount}
              />
            </>
          )}

          <CustomerDetailsFields defaults={customerDefaults} />
          <button type="submit" className="btn-primary w-full">{editRow ? 'Update' : 'Save'} Sale</button>
        </form>
      </Modal>
      <ExcelImportModal {...importModalProps} />
    </div>
  );
}

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { useDataTable } from '../../hooks/useDataTable';
import LoadingSpinner from '../../components/LoadingSpinner';
import { EntryActions } from '../../components/ConfirmDialog';
import { Pagination, ListPageToolbar, Modal, EmptyState, FieldLabel } from '../../components/common';
import { formatDate, formatNumber } from '../../utils/helpers';
import { calculatePackagingPreview, gradeGramsPerPacket } from '../../utils/brandedPackaging';
import { exportFilteredList } from '../../utils/listExport';
import { getErrorMessage } from '../../utils/helpers';

function getEffectiveLotStock(lotStock, editRow, selectedLot) {
  if (!lotStock) return null;
  if (!editRow || editRow.lotNumber !== selectedLot) return lotStock;
  return {
    ...lotStock,
    stock6No: (lotStock.stock6No || 0) + (editRow.consumed6No || 0),
    stock5No: (lotStock.stock5No || 0) + (editRow.consumed5No || 0),
    stock4_5No: (lotStock.stock4_5No || 0) + (editRow.consumed4_5No || 0),
    stock4No: (lotStock.stock4No || 0) + (editRow.consumed4No || 0),
    stockOthers: (lotStock.stockOthers || 0) + (editRow.consumedOthers || 0),
    totalStock:
      (lotStock.totalStock || 0) +
      (editRow.consumed6No || 0) +
      (editRow.consumed5No || 0) +
      (editRow.consumed4_5No || 0) +
      (editRow.consumed4No || 0) +
      (editRow.consumedOthers || 0),
  };
}

export default function BrandedPackagingTab({ lotsQualityStock = [], onRefreshLots }) {
  const {
    data, pagination, loading, params, setPage, updateParams, fetchData,
  } = useDataTable('/manufacturing/packaging', { notifyStock: true });

  const [modalOpen, setModalOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [brands, setBrands] = useState([]);
  const [selectedLot, setSelectedLot] = useState('');
  const [selectedBrandId, setSelectedBrandId] = useState('');
  const [quantityPackedKg, setQuantityPackedKg] = useState('');
  const [remarks, setRemarks] = useState('');
  const [editDate, setEditDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadBrands = useCallback(() => {
    api.get('/manufacturing/brands/options')
      .then(({ data: res }) => setBrands(res.data || []))
      .catch(() => setBrands([]));
  }, []);

  useEffect(() => { loadBrands(); }, [loadBrands]);
  useEffect(() => { if (modalOpen) { loadBrands(); onRefreshLots?.(); } }, [modalOpen, loadBrands, onRefreshLots]);

  const lotOptions = useMemo(() => {
    const lots = [...lotsQualityStock];
    if (editRow?.lotNumber && !lots.some((l) => l.lotNumber === editRow.lotNumber)) {
      lots.unshift({
        lotNumber: editRow.lotNumber,
        stock6No: editRow.consumed6No || 0,
        stock5No: editRow.consumed5No || 0,
        stock4_5No: editRow.consumed4_5No || 0,
        stock4No: editRow.consumed4No || 0,
        stockOthers: editRow.consumedOthers || 0,
        totalStock:
          (editRow.consumed6No || 0) +
          (editRow.consumed5No || 0) +
          (editRow.consumed4_5No || 0) +
          (editRow.consumed4No || 0) +
          (editRow.consumedOthers || 0),
      });
    }
    return lots;
  }, [lotsQualityStock, editRow]);

  const openCreate = () => {
    setEditRow(null);
    setSelectedLot('');
    setSelectedBrandId('');
    setQuantityPackedKg('');
    setRemarks('');
    setEditDate(new Date().toISOString().split('T')[0]);
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setEditRow(row);
    setSelectedLot(row.lotNumber || '');
    setSelectedBrandId(row.brandId || row.brand?._id || row.brand?.id || '');
    setQuantityPackedKg(String(row.quantityPackedKg ?? ''));
    setRemarks(row.remarks || '');
    setEditDate(row.date ? new Date(row.date).toISOString().split('T')[0] : '');
    setModalOpen(true);
  };

  const selectedBrand = brands.find((b) => (b._id || b.id) === selectedBrandId);
  const preview = useMemo(
    () => calculatePackagingPreview(selectedBrand, quantityPackedKg),
    [selectedBrand, quantityPackedKg]
  );

  const baseLotStock = lotOptions.find((l) => l.lotNumber === selectedLot);
  const effectiveLotStock = getEffectiveLotStock(baseLotStock, editRow, selectedLot);

  const stockWarnings = useMemo(() => {
    if (!preview || !effectiveLotStock) return [];
    const checks = [
      { label: '6 No', required: preview.consumed6No, available: effectiveLotStock.stock6No },
      { label: '5 No', required: preview.consumed5No, available: effectiveLotStock.stock5No },
      { label: '4.5 No', required: preview.consumed4_5No, available: effectiveLotStock.stock4_5No },
      { label: '4 No', required: preview.consumed4No, available: effectiveLotStock.stock4No },
      { label: 'Others', required: preview.consumedOthers, available: effectiveLotStock.stockOthers },
    ];
    return checks.filter((c) => c.required > 0 && c.available < c.required);
  }, [preview, effectiveLotStock]);

  const closeModal = () => {
    setModalOpen(false);
    setEditRow(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (stockWarnings.length) {
      toast.error(`Insufficient ${stockWarnings[0].label} stock.`);
      return;
    }
    const fd = new FormData(e.target);
    const payload = {
      date: fd.get('date'),
      lotNumber: selectedLot,
      brandId: selectedBrandId,
      quantityPackedKg: parseFloat(quantityPackedKg),
      remarks: remarks || undefined,
    };
    setSubmitting(true);
    try {
      const id = editRow?._id || editRow?.id;
      if (id) {
        await api.put(`/manufacturing/packaging/${id}`, payload);
        toast.success('Packaging transaction updated');
      } else {
        await api.post('/manufacturing/packaging', payload);
        toast.success('Branded packaging recorded');
      }
      closeModal();
      fetchData();
      onRefreshLots?.();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/manufacturing/packaging/${id}`);
      toast.success('Packaging transaction deleted');
      fetchData();
      onRefreshLots?.();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const handleExport = () => exportFilteredList(
    '/manufacturing/packaging',
    params,
    (r) => ({
      Date: formatDate(r.date),
      'Serial No': r.serialNumber,
      Lot: r.lotNumber,
      Brand: r.brand?.name || '',
      'Packet Size (gm)': r.brand?.packetSizeGrams || '',
      'Qty Packed (KG)': r.quantityPackedKg,
      Packets: r.packetsCreated,
      '6 No Consumed': r.consumed6No,
      '5 No Consumed': r.consumed5No,
      '4.5 No Consumed': r.consumed4_5No,
      '4 No Consumed': r.consumed4No,
      'Others Consumed': r.consumedOthers,
      'Cost/Packet': r.costPerPacket,
      Remarks: r.remarks || '',
    }),
    'branded-packaging'
  );

  const defaultDate = editDate || new Date().toISOString().split('T')[0];

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus className="h-4 w-4" /> Pack Branded FG
        </button>
      </div>

      <ListPageToolbar
        showSearch={false}
        startDate={params.startDate || ''}
        endDate={params.endDate || ''}
        onStartChange={(v) => updateParams({ startDate: v, page: 1 })}
        onEndChange={(v) => updateParams({ endDate: v, page: 1 })}
        onExport={handleExport}
      />

      {loading ? <LoadingSpinner className="py-12" /> : (
        <>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Serial</th>
                  <th>Lot</th>
                  <th>Brand</th>
                  <th>Packet Size</th>
                  <th>Qty Packed (KG)</th>
                  <th>Packets</th>
                  <th>6 No</th>
                  <th>5 No</th>
                  <th>4.5 No</th>
                  <th>4 No</th>
                  <th>Others</th>
                  <th>Cost/Pkt</th>
                  <th>User</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.length === 0 ? (
                  <tr><td colSpan={15}><EmptyState message="No branded packaging records" /></td></tr>
                ) : data.map((r) => (
                  <tr key={r._id || r.id}>
                    <td>{formatDate(r.date)}</td>
                    <td className="font-mono text-xs">{r.serialNumber}</td>
                    <td className="font-mono">{r.lotNumber}</td>
                    <td>{r.brand?.name || '—'}</td>
                    <td>{r.brand?.packetSizeGrams ? `${r.brand.packetSizeGrams} gm` : '—'}</td>
                    <td>{formatNumber(r.quantityPackedKg)}</td>
                    <td>{formatNumber(r.packetsCreated)}</td>
                    <td>{formatNumber(r.consumed6No)}</td>
                    <td>{formatNumber(r.consumed5No)}</td>
                    <td>{formatNumber(r.consumed4_5No)}</td>
                    <td>{formatNumber(r.consumed4No)}</td>
                    <td>{formatNumber(r.consumedOthers)}</td>
                    <td>{formatNumber(r.costPerPacket)}</td>
                    <td>{r.createdBy?.name || '—'}</td>
                    <td>
                      <EntryActions
                        onEdit={() => openEdit(r)}
                        onDelete={() => handleDelete(r._id || r.id)}
                        editTitle="Edit packaging transaction"
                        deleteTitle="Delete packaging transaction"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage} />
        </>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editRow ? 'Edit Branded Packaging' : 'Branded Packaging'}
      >
        <form onSubmit={handleSubmit} className="space-y-4" key={editRow?._id || editRow?.id || 'new'}>
          {editRow?.serialNumber && (
            <p className="text-sm text-gray-500">
              Serial: <span className="font-mono">{editRow.serialNumber}</span>
            </p>
          )}
          <div>
            <FieldLabel required>Date</FieldLabel>
            <input
              type="date"
              name="date"
              className="input-field"
              value={defaultDate}
              onChange={(e) => setEditDate(e.target.value)}
              required
            />
          </div>
          <div>
            <FieldLabel required>Lot</FieldLabel>
            <select
              className="input-field"
              value={selectedLot}
              onChange={(e) => setSelectedLot(e.target.value)}
              required
            >
              <option value="">Select lot</option>
              {lotOptions.map((lot) => (
                <option key={lot.lotNumber} value={lot.lotNumber}>
                  {lot.lotNumber} — {formatNumber(lot.totalStock)} KG quality stock
                </option>
              ))}
            </select>
          </div>
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
          {selectedBrand && (() => {
            const g = gradeGramsPerPacket(selectedBrand);
            return (
            <p className="text-sm text-gray-500">
              Packet: <strong>{selectedBrand.packetSizeGrams} gm</strong>
              {' '}(packing {selectedBrand.packingWeightGrams ?? 0} gm + quality{' '}
              {(selectedBrand.packetSizeGrams - (selectedBrand.packingWeightGrams ?? 0))} gm)
              <br />
              Mix per packet: {g.grams6No}g / {g.grams5No}g / {g.grams4_5No}g / {g.grams4No}g / {g.gramsOthers}g Others
              {selectedBrand.packagingPrice > 0 && (
                <> · Packaging price: ₹{selectedBrand.packagingPrice}/packet</>
              )}
            </p>
            );
          })()}
          <div>
            <FieldLabel required>Quantity To Pack (KG)</FieldLabel>
            <input
              type="number"
              step="any"
              min="0.01"
              className="input-field"
              value={quantityPackedKg}
              onChange={(e) => setQuantityPackedKg(e.target.value)}
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Gross packed output (packets × packet size). E.g. 100 KG ÷ 0.25 KG/packet = 400 packets for 250 gm brand.
            </p>
          </div>
          <div>
            <FieldLabel>Remarks</FieldLabel>
            <textarea className="input-field" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </div>

          {preview && (
            <div className="rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 p-3 text-sm space-y-2">
              <p className="font-medium">Packaging preview</p>
              <p>Packets created: <strong>{formatNumber(preview.packetsCreated)}</strong></p>
              <p className="text-xs text-gray-600">
                Foxnut consumed from lot: <strong>{formatNumber(preview.qualityConsumedKg)} KG</strong>
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>6 No: {formatNumber(preview.consumed6No)} KG</div>
                <div>5 No: {formatNumber(preview.consumed5No)} KG</div>
                <div>4.5 No: {formatNumber(preview.consumed4_5No)} KG</div>
                <div>4 No: {formatNumber(preview.consumed4No)} KG</div>
                <div>Others: {formatNumber(preview.consumedOthers)} KG</div>
                <div>Quality/pkt: {formatNumber(preview.qualityPerPacketGrams)} gm</div>
              </div>
              {preview.packagingPrice > 0 && (
                <p className="text-xs">Packaging cost: ₹{formatNumber(preview.packagingPrice)} per packet</p>
              )}
              {stockWarnings.map((w) => (
                <p key={w.label} className="text-red-600 text-xs">
                  Insufficient {w.label} stock. Required: {formatNumber(w.required)} KG, Available: {formatNumber(w.available)} KG
                </p>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={closeModal} className="btn-secondary">Cancel</button>
            <button
              type="submit"
              className="btn-primary"
              disabled={submitting || stockWarnings.length > 0 || !preview}
            >
              {submitting ? 'Saving...' : editRow ? 'Update Packaging' : 'Save Packaging'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

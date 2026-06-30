import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { Plus } from 'lucide-react';
import api from '../../services/api';
import { useDataTable } from '../../hooks/useDataTable';
import LoadingSpinner from '../../components/LoadingSpinner';
import { EntryActions } from '../../components/ConfirmDialog';
import { PageHeader, Pagination, ListPageToolbar, Modal, EmptyState, FieldLabel } from '../../components/common';
import { formatDate, formatNumber } from '../../utils/helpers';
import { exportFilteredList } from '../../utils/listExport';
import ExcelImportModal from '../../components/ExcelImportModal';
import { useExcelImport } from '../../hooks/useExcelImport';

export default function MachineEntry() {
  const location = useLocation();
  const {data, pagination, loading, params, setPage, setSearch, updateParams, createItem, updateItem, deleteItem, fetchData } =
    useDataTable('/manufacturing/machine-entries');
  const { onImport, importModalProps } = useExcelImport('machine-entries', fetchData);

  const [modalOpen, setModalOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [lots, setLots] = useState([]);
  const [loadingLots, setLoadingLots] = useState(false);
  const [selectedLot, setSelectedLot] = useState('');

  const loadLots = useCallback(() => {
    setLoadingLots(true);
    api.get('/manufacturing/available-lots')
      .then(({ data }) => setLots(data.data || []))
      .catch(() => setLots([]))
      .finally(() => setLoadingLots(false));
  }, []);

  useEffect(() => { if (modalOpen) loadLots(); }, [modalOpen, loadLots]);

  const openCreate = () => { setEditRow(null); setSelectedLot(''); setModalOpen(true); };
  const openEdit = (row) => { setEditRow(row); setSelectedLot(row.lotNumber); setModalOpen(true); };

  useEffect(() => {
    if (location.state?.editId && data.length) {
      const row = data.find((d) => d._id === location.state.editId);
      if (row) openEdit(row);
      window.history.replaceState({}, '');
    }
  }, [location.state, data]);

  const availableQty = lots.find((l) => l.lotNumber === selectedLot)?.availableQty;
  const editLotQty = editRow && editRow.lotNumber === selectedLot
    ? (availableQty ?? 0) + editRow.quantitySent
    : availableQty;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      lotNumber: fd.get('lotNumber'),
      quantitySent: parseFloat(fd.get('quantitySent')),
      date: fd.get('date'),
    };
    const ok = editRow
      ? await updateItem(editRow._id, payload)
      : await createItem(payload, '/manufacturing/machine-entries');
    if (ok) { setModalOpen(false); setEditRow(null); }
  };

  const defaultDate = editRow?.date ? new Date(editRow.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

  const handleExport = () => exportFilteredList(
    '/manufacturing/machine-entries',
    params,
    (r) => ({
      Date: formatDate(r.date),
      'Lot Number': r.lotNumber,
      'Qty Sent (KG)': r.quantitySent,
    }),
    'machine-entries'
  );

  return (
    <div>
      <PageHeader title="Material Sent to Machine (WIP)" subtitle="Transfer raw material to work-in-progress"
        action={<button onClick={openCreate} className="btn-primary flex items-center gap-2"><Plus className="h-4 w-4" /> Add Entry</button>} />

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
              <thead><tr><th>Date</th><th>Lot No.</th><th>Qty Sent (KG)</th><th>Actions</th></tr></thead>
              <tbody>
                {data.length === 0 ? <tr><td colSpan={4}><EmptyState /></td></tr> : data.map((r) => (
                  <tr key={r._id}>
                    <td>{formatDate(r.date)}</td><td className="font-mono">{r.lotNumber}</td>
                    <td>{formatNumber(r.quantitySent)}</td>
                    <td><EntryActions onEdit={() => openEdit(r)} onDelete={() => deleteItem(r._id)} deleteTitle="Delete machine entry" editTitle="Edit machine entry" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage} />
        </>
      )}

      <Modal isOpen={modalOpen} onClose={() => { setModalOpen(false); setEditRow(null); }} title={editRow ? 'Edit Machine Entry' : 'Send Material to Machine'}>
        <form onSubmit={handleSubmit} className="space-y-4" key={editRow?._id || 'new'}>
          <div>
            <FieldLabel required>Lot Number</FieldLabel>
            {loadingLots ? <LoadingSpinner size="sm" className="py-2" /> : lots.length === 0 && !editRow ? (
              <p className="text-sm text-amber-600">No lots with available raw material. Add a raw purchase first.</p>
            ) : (
              <select name="lotNumber" required className="input-field" value={selectedLot}
                onChange={(e) => setSelectedLot(e.target.value)}>
                <option value="">Select lot number</option>
                {lots.map((l) => (
                  <option key={l.lotNumber} value={l.lotNumber}>
                    {l.lotNumber} — {formatNumber(l.availableQty)} KG available
                  </option>
                ))}
                {editRow && !lots.find((l) => l.lotNumber === editRow.lotNumber) && (
                  <option value={editRow.lotNumber}>{editRow.lotNumber} (current)</option>
                )}
              </select>
            )}
            {selectedLot && editLotQty != null && (
              <p className="text-xs text-gray-500 mt-1">Available for this lot: {formatNumber(editLotQty)} KG</p>
            )}
          </div>
          <div><FieldLabel required>Quantity Sent (KG)</FieldLabel><input name="quantitySent" type="number" step="0.01" min="0.01" required defaultValue={editRow?.quantitySent} className="input-field" /></div>
          <div><FieldLabel required>Date</FieldLabel><input name="date" type="date" required defaultValue={defaultDate} className="input-field" /></div>
          <button type="submit" disabled={!editRow && lots.length === 0} className="btn-primary w-full">{editRow ? 'Update' : 'Save'} Entry</button>
        </form>
      </Modal>
      <ExcelImportModal {...importModalProps} />
    </div>
  );
}

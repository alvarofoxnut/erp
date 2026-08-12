import { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useDataTable, useResourceQuery } from '../../hooks/useDataTable';
import LoadingSpinner from '../../components/LoadingSpinner';
import { EntryActions } from '../../components/ConfirmDialog';
import { PageHeader, Pagination, ListPageToolbar, Modal, EmptyState, FieldLabel } from '../../components/common';
import { formatDate, formatNumber } from '../../utils/helpers';
import { exportFilteredList } from '../../utils/listExport';
import ExcelImportModal from '../../components/ExcelImportModal';
import { useExcelImport } from '../../hooks/useExcelImport';

export default function MachineEntry() {
  const location = useLocation();
  const {data, pagination, loading, params, setPage, setSearch, updateParams, saving, createItem, updateItem, deleteItem, fetchData } =
    useDataTable('/manufacturing/machine-entries');
  const { onImport, importModalProps } = useExcelImport('machine-entries', fetchData);

  const [modalOpen, setModalOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [selectedLot, setSelectedLot] = useState('');

  // Prefetch on page load (same pattern as Quality WIP lots) so the modal opens with lots ready
  const { data: lots, loading: loadingLots } = useResourceQuery('/manufacturing/available-lots');

  const lotOptions = useMemo(() => {
    const rows = Array.isArray(lots) ? lots : [];
    if (editRow?.lotNumber && !rows.some((l) => l.lotNumber === editRow.lotNumber)) {
      return [{ lotNumber: editRow.lotNumber, availableQty: 0 }, ...rows];
    }
    return rows;
  }, [lots, editRow]);

  const openCreate = () => { setEditRow(null); setSelectedLot(''); setModalOpen(true); };
  const openEdit = (row) => { setEditRow(row); setSelectedLot(row.lotNumber); setModalOpen(true); };

  useEffect(() => {
    if (location.state?.editId && data.length) {
      const row = data.find((d) => d._id === location.state.editId);
      if (row) openEdit(row);
      window.history.replaceState({}, '');
    }
  }, [location.state, data]);

  const availableQty = lotOptions.find((l) => l.lotNumber === selectedLot)?.availableQty;
  const editLotQty = editRow && editRow.lotNumber === selectedLot
    ? (availableQty ?? 0) + editRow.quantitySent
    : availableQty;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
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

  const showEmptyLots = !loadingLots && lotOptions.length === 0 && !editRow;
  const showLotSelect = lotOptions.length > 0 || editRow;

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
                    <td>
                      <EntryActions
                        onEdit={() => openEdit(r)}
                        onDelete={(reason) => deleteItem(r._id, reason)}
                        deleteTitle="Delete machine entry"
                        editTitle="Edit machine entry"
                        itemLabel={`Lot ${r.lotNumber} · ${formatNumber(r.quantitySent)} KG · ${formatDate(r.date)}`}
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

      <Modal isOpen={modalOpen} onClose={() => { setModalOpen(false); setEditRow(null); }} title={editRow ? 'Edit Machine Entry' : 'Send Material to Machine'}>
        <form onSubmit={handleSubmit} className="space-y-4" key={editRow?._id || 'new'}>
          <div>
            <FieldLabel required>Lot Number</FieldLabel>
            {showEmptyLots ? (
              <p className="text-sm text-amber-600">No lots with available raw material. Add a raw purchase first.</p>
            ) : showLotSelect ? (
              <select name="lotNumber" required className="input-field" value={selectedLot}
                onChange={(e) => setSelectedLot(e.target.value)}>
                <option value="">{loadingLots && lotOptions.length === 0 ? 'Loading lots…' : 'Select lot number'}</option>
                {lotOptions.map((l) => (
                  <option key={l.lotNumber} value={l.lotNumber}>
                    {l.lotNumber} — {formatNumber(l.availableQty)} KG available
                  </option>
                ))}
              </select>
            ) : (
              <LoadingSpinner size="sm" className="py-2" />
            )}
            {selectedLot && editLotQty != null && (
              <p className="text-xs text-gray-500 mt-1">Available for this lot: {formatNumber(editLotQty)} KG</p>
            )}
          </div>
          <div><FieldLabel required>Quantity Sent (KG)</FieldLabel><input name="quantitySent" type="number" step="0.01" min="0.01" required defaultValue={editRow?.quantitySent} className="input-field" /></div>
          <div><FieldLabel required>Date</FieldLabel><input name="date" type="date" required defaultValue={defaultDate} className="input-field" /></div>
          <button type="submit" disabled={saving || (!editRow && lotOptions.length === 0)} className="btn-primary w-full">{saving ? 'Saving...' : `${editRow ? 'Update' : 'Save'} Entry`}</button>
        </form>
      </Modal>
      <ExcelImportModal {...importModalProps} />
    </div>
  );
}

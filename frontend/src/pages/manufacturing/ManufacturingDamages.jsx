import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useDataTable } from '../../hooks/useDataTable';
import { usePermissions } from '../../hooks/usePermissions';
import LoadingSpinner from '../../components/LoadingSpinner';
import { EntryActions } from '../../components/ConfirmDialog';
import { PageHeader, Pagination, ListPageToolbar, Modal, EmptyState, FieldLabel } from '../../components/common';
import { formatDate, formatCurrency, formatNumber, STOCK_LABELS } from '../../utils/helpers';
import { exportFilteredList } from '../../utils/listExport';
import ExcelImportModal from '../../components/ExcelImportModal';
import { useExcelImport } from '../../hooks/useExcelImport';
import { PERMISSIONS } from '../../utils/permissions';
import api from '../../services/api';

const MFG_DAMAGE_TYPES = [
  'raw_material',
  'quality_6no',
  'quality_5no',
  'quality_4_5no',
  'quality_4no',
  'quality_others',
  'finished_goods',
];

const emptyLine = () => ({
  inventoryType: '',
  scopeKey: '',
  lotNumber: '',
  batchId: '',
  quantity: '',
  reason: '',
  options: [],
  loadingOptions: false,
});

function lineDamageValue(line) {
  const qty = parseFloat(line.quantity);
  const opt = line.options.find((o) => o.key === line.scopeKey);
  const cost = opt?.costPerKg ?? 0;
  if (!qty || qty <= 0 || !cost) return 0;
  return Math.round(qty * cost * 100) / 100;
}

function formatLineSummary(line) {
  const itemLabel = STOCK_LABELS[line.inventoryType] || line.inventoryType;
  const lotLabel =
    line.inventoryType === 'finished_goods'
      ? line.batchNumber || line.lotNumber || '—'
      : line.lotNumber || '—';
  return `${itemLabel}, Lot ${lotLabel}, ${formatNumber(line.quantity)} KG`;
}

export default function ManufacturingDamages() {
  const location = useLocation();
  const { can } = usePermissions();
  const canWrite = can(PERMISSIONS.MFG_DAMAGES_WRITE);
  const {data, pagination, loading, params, setPage, setSearch, updateParams, createItem, updateItem, deleteItem, fetchData } =
    useDataTable('/damages/manufacturing');
  const { onImport, importModalProps } = useExcelImport('manufacturing-damages', fetchData);

  const [modalOpen, setModalOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [lines, setLines] = useState([emptyLine()]);

  const mergeSavedOption = (options, inventoryType, savedLine) => {
    if (!savedLine) return options;
    const key =
      inventoryType === 'finished_goods'
        ? savedLine.batchId
        : savedLine.lotNumber;
    if (!key || options.some((o) => o.key === key)) return options;

    const label =
      savedLine.batchNumber ||
      (savedLine.lotNumber
        ? `${savedLine.lotNumber} (${STOCK_LABELS[inventoryType] || inventoryType})`
        : 'Saved selection');

    return [
      {
        key,
        batchId: savedLine.batchId || undefined,
        batchNumber: savedLine.batchNumber || undefined,
        lotNumber: savedLine.lotNumber || undefined,
        label,
        availableQty: savedLine.quantity || 0,
        costPerKg: savedLine.costPerKg || 0,
        isSavedSelection: true,
      },
      ...options,
    ];
  };

  const fetchOptionsForLine = async (index, inventoryType, preserveScope = null, savedLine = null) => {
    if (!inventoryType) return;
    setLines((prev) =>
      prev.map((l, i) => (i === index ? { ...l, loadingOptions: true } : l))
    );
    try {
      const { data: res } = await api.get('/damages/manufacturing/stock-options', {
        params: { inventoryType },
      });
      let options = mergeSavedOption(res.data || [], inventoryType, savedLine);
      let scopeKey = '';
      let lotNumber = '';
      let batchId = '';
      if (preserveScope) {
        if (inventoryType === 'finished_goods' && preserveScope.batchId) {
          scopeKey = preserveScope.batchId;
          batchId = preserveScope.batchId;
          lotNumber = preserveScope.lotNumber || '';
          const match = options.find((o) => o.key === preserveScope.batchId);
          if (match && savedLine?.quantity) {
            options = options.map((o) =>
              o.key === preserveScope.batchId
                ? { ...o, availableQty: (o.availableQty || 0) + savedLine.quantity }
                : o
            );
          }
        } else if (preserveScope.lotNumber) {
          const match = options.find((o) => o.lotNumber === preserveScope.lotNumber);
          scopeKey = match?.key || preserveScope.lotNumber;
          lotNumber = preserveScope.lotNumber;
          if (match && savedLine?.quantity) {
            options = options.map((o) =>
              o.lotNumber === preserveScope.lotNumber
                ? { ...o, availableQty: (o.availableQty || 0) + savedLine.quantity }
                : o
            );
          }
        }
      }
      setLines((prev) =>
        prev.map((l, i) =>
          i === index
            ? { ...l, options, scopeKey, lotNumber, batchId, loadingOptions: false }
            : l
        )
      );
    } catch {
      setLines((prev) =>
        prev.map((l, i) =>
          i === index ? { ...l, options: [], loadingOptions: false } : l
        )
      );
    }
  };

  const openEdit = (row) => {
    setEditRow(row);
    const mapped = row.lines?.length
      ? row.lines.map((l) => ({
          ...emptyLine(),
          inventoryType: l.inventoryType,
          lotNumber: l.lotNumber || '',
          batchId: l.batchId || '',
          scopeKey: l.batchId || l.lotNumber || '',
          quantity: String(l.quantity ?? ''),
          reason: l.reason || '',
        }))
      : [emptyLine()];
    setLines(mapped);
    setModalOpen(true);
    mapped.forEach((line, index) => {
      if (line.inventoryType) {
        const saved = row.lines?.[index];
        fetchOptionsForLine(
          index,
          line.inventoryType,
          { lotNumber: line.lotNumber, batchId: line.batchId },
          saved
        );
      }
    });
  };

  useEffect(() => {
    if (location.state?.editId && data.length) {
      const row = data.find((d) => d._id === location.state.editId);
      if (row) openEdit(row);
      window.history.replaceState({}, '');
    }
  }, [location.state, data]);

  const totalLoss = lines.reduce((sum, l) => sum + lineDamageValue(l), 0);

  const addLine = () => setLines([...lines, emptyLine()]);
  const removeLine = (index) => {
    if (lines.length <= 1) return toast.error('At least one row is required');
    setLines(lines.filter((_, i) => i !== index));
  };

  const updateLine = (index, patch) => {
    setLines(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  const onInventoryTypeChange = (index, inventoryType) => {
    updateLine(index, {
      inventoryType,
      scopeKey: '',
      lotNumber: '',
      batchId: '',
      options: [],
    });
    if (inventoryType) fetchOptionsForLine(index, inventoryType);
  };

  const onScopeChange = (index, scopeKey) => {
    const line = lines[index];
    const opt = line.options.find((o) => o.key === scopeKey);
    updateLine(index, {
      scopeKey,
      lotNumber: opt?.lotNumber || (line.inventoryType !== 'finished_goods' ? scopeKey.split('|')[0] : opt?.lotNumber) || '',
      batchId: opt?.batchId || '',
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payloadLines = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.inventoryType || !line.scopeKey) continue;
      const qty = parseFloat(line.quantity);
      if (!qty || qty <= 0) continue;

      const opt = line.options.find((o) => o.key === line.scopeKey);
      if (!opt) {
        toast.error(`Line ${i + 1}: select a valid lot or batch`);
        return;
      }
      if (qty > opt.availableQty) {
        toast.error(
          `Line ${i + 1}: insufficient stock. Available: ${formatNumber(opt.availableQty)} KG`
        );
        return;
      }

      const payload = {
        inventoryType: line.inventoryType,
        quantity: qty,
        reason: line.reason || undefined,
      };
      if (line.inventoryType === 'finished_goods') {
        payload.batchId = opt.batchId;
      } else {
        payload.lotNumber = opt.lotNumber;
      }
      payloadLines.push(payload);
    }

    if (!payloadLines.length) {
      toast.error('Add at least one valid damage line with lot/batch selected');
      return;
    }

    const payload = {
      date: fd.get('date'),
      lines: payloadLines,
    };

    const ok = editRow ? await updateItem(editRow._id, payload) : await createItem(payload);
    if (ok) {
      setModalOpen(false);
      setEditRow(null);
      setLines([emptyLine()]);
    }
  };

  const defaultDate = editRow?.date
    ? new Date(editRow.date).toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0];

  const handleExport = () =>
    exportFilteredList(
      '/damages/manufacturing',
      params,
      (r) => ({
        Reference: r.serialNumber,
        Date: formatDate(r.date),
        'Total Loss': r.totalLoss,
        Lines: (r.lines || []).map(formatLineSummary).join('; '),
      }),
      'manufacturing-damages'
    );

  const formatLinesSummary = (row) =>
    (row.lines || []).map(formatLineSummary).join(', ');

  return (
    <div>
      <PageHeader
        title="Manufacturing Damages"
        subtitle="Record damaged inventory with lot/batch traceability and auto cost calculation"
        action={
          canWrite ? (
            <button
              onClick={() => {
                setEditRow(null);
                setLines([emptyLine()]);
                setModalOpen(true);
              }}
              className="btn-primary flex items-center gap-2"
            >
              <Plus className="h-4 w-4" /> Add Damage Entry
            </button>
          ) : null
        }
      />
      <ListPageToolbar
        search={params.search || ''}
        onSearchChange={setSearch}
        searchPlaceholder="Search reference..."
        startDate={params.startDate || ''}
        endDate={params.endDate || ''}
        onStartChange={(v) => updateParams({ startDate: v, page: 1 })}
        onEndChange={(v) => updateParams({ endDate: v, page: 1 })}
        onExport={handleExport}
        onImport={onImport}
      />

      {loading ? (
        <LoadingSpinner className="py-12" />
      ) : (
        <>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Date</th>
                  <th>Items</th>
                  <th>Total Loss</th>
                  <th>Created By</th>
                  {canWrite && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {data.length === 0 ? (
                  <tr>
                    <td colSpan={canWrite ? 6 : 5}>
                      <EmptyState />
                    </td>
                  </tr>
                ) : (
                  data.map((r) => (
                    <tr key={r._id}>
                      <td className="font-mono">{r.serialNumber}</td>
                      <td>{formatDate(r.date)}</td>
                      <td className="text-sm max-w-md">{formatLinesSummary(r)}</td>
                      <td>{formatCurrency(r.totalLoss)}</td>
                      <td>{r.createdBy?.name || '-'}</td>
                      {canWrite && (
                        <td>
                          <EntryActions
                            onEdit={() => openEdit(r)}
                            onDelete={(reason) => deleteItem(r._id, reason)}
                            deleteTitle="Delete damage entry"
                            editTitle="Edit damage entry"
                          />
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage} />
        </>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditRow(null);
        }}
        title={editRow ? 'Edit Manufacturing Damage' : 'Manufacturing Damage Entry'}
      >
        <form onSubmit={handleSubmit} className="space-y-4" key={editRow?._id || 'new'}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <FieldLabel required>Damage Date</FieldLabel>
              <input name="date" type="date" required defaultValue={defaultDate} className="input-field" />
            </div>
            {editRow?.serialNumber && (
              <div>
                <label className="block text-sm mb-1">Reference Number</label>
                <input type="text" readOnly value={editRow.serialNumber} className="input-field bg-gray-50" />
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h4 className="text-sm font-semibold">Damage Items</h4>
              <button type="button" onClick={addLine} className="btn-secondary text-sm flex items-center justify-center gap-1 w-full sm:w-auto">
                <Plus className="h-3 w-3" /> Add Row
              </button>
            </div>
            {lines.map((line, index) => {
              const selected = line.options.find((o) => o.key === line.scopeKey);
              const damageValue = lineDamageValue(line);
              return (
                <div key={index} className="border border-gray-100 dark:border-gray-700 rounded-lg p-3 space-y-3">
                  <div className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-12 sm:col-span-4">
                      <FieldLabel required className="block text-xs mb-1">Inventory Type</FieldLabel>
                      <select
                        required
                        className="input-field"
                        value={line.inventoryType}
                        onChange={(e) => onInventoryTypeChange(index, e.target.value)}
                      >
                        <option value="">Select type</option>
                        {MFG_DAMAGE_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {STOCK_LABELS[t] || t}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-12 sm:col-span-4">
                      <FieldLabel required className="block text-xs mb-1">Lot / Batch</FieldLabel>
                      <select
                        required
                        className="input-field"
                        value={line.scopeKey}
                        disabled={!line.inventoryType || line.loadingOptions}
                        onChange={(e) => onScopeChange(index, e.target.value)}
                      >
                        <option value="">
                          {line.loadingOptions ? 'Loading...' : 'Select lot or batch'}
                        </option>
                        {line.options.map((opt) => (
                          <option key={opt.key} value={opt.key}>
                            {opt.label} ({formatNumber(opt.availableQty)} KG)
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-12 sm:col-span-4 flex justify-end">
                      <button
                        type="button"
                        onClick={() => removeLine(index)}
                        className="btn-secondary text-red-600 flex items-center gap-1 text-sm"
                        title="Remove row"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {selected && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-gray-50 dark:bg-gray-800 rounded p-2">
                      {selected.lotNumber && (
                        <div>
                          <span className="text-gray-500">Lot:</span>{' '}
                          <strong>{selected.lotNumber}</strong>
                        </div>
                      )}
                      <div>
                        <span className="text-gray-500">Available:</span>{' '}
                        <strong>{formatNumber(selected.availableQty)} KG</strong>
                      </div>
                      <div>
                        <span className="text-gray-500">Cost Price:</span>{' '}
                        <strong>{formatCurrency(selected.costPerKg)}/KG</strong>
                      </div>
                      <div>
                        <span className="text-gray-500">Damage Value:</span>{' '}
                        <strong>{formatCurrency(damageValue)}</strong>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <FieldLabel required className="block text-xs mb-1">Qty Damaged (KG)</FieldLabel>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        required
                        className="input-field"
                        value={line.quantity}
                        onChange={(e) => updateLine(index, { quantity: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs mb-1">Reason</label>
                      <input
                        type="text"
                        className="input-field"
                        value={line.reason}
                        onChange={(e) => updateLine(index, { reason: e.target.value })}
                        placeholder="Optional reason for this line"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="modal-footer">
            <p className="text-sm font-semibold sm:mr-auto text-center sm:text-left">
              Total Loss: {formatCurrency(totalLoss)}
            </p>
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary w-full sm:w-auto">
              Cancel
            </button>
            <button type="submit" className="btn-primary w-full sm:w-auto">
              {editRow ? 'Update' : 'Save'} Damage Entry
            </button>
          </div>
        </form>
      </Modal>
      <ExcelImportModal {...importModalProps} />
    </div>
  );
}

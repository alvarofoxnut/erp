import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useDataTable, useFetchOptions } from '../../hooks/useDataTable';
import { usePermissions } from '../../hooks/usePermissions';
import LoadingSpinner from '../../components/LoadingSpinner';
import { EntryActions } from '../../components/ConfirmDialog';
import { PageHeader, Pagination, ListPageToolbar, Modal, EmptyState, FieldLabel } from '../../components/common';
import { formatDate, formatCurrency, formatNumber } from '../../utils/helpers';
import { exportFilteredList } from '../../utils/listExport';
import ExcelImportModal from '../../components/ExcelImportModal';
import { useExcelImport } from '../../hooks/useExcelImport';
import { PERMISSIONS } from '../../utils/permissions';
import api from '../../services/api';

const emptyLine = () => ({
  itemId: '',
  quantity: '',
  reason: '',
  stockInfo: null,
  loadingStock: false,
});

function lineDamageValue(line) {
  const qty = parseFloat(line.quantity);
  const cost = line.stockInfo?.costPerUnit ?? 0;
  if (!qty || qty <= 0 || !cost) return 0;
  return Math.round(qty * cost * 100) / 100;
}

function formatLineSummary(line) {
  const name = line.item?.name || 'Item';
  const cost = line.costPerUnit ? ` @ ${formatCurrency(line.costPerUnit)}` : '';
  return `${name}: ${formatNumber(line.quantity)} KG${cost} = ${formatCurrency(line.lossAmount)}`;
}

export default function TradingDamages() {
  const location = useLocation();
  const { can } = usePermissions();
  const canWrite = can(PERMISSIONS.TRADING_DAMAGES_WRITE);
  const {data, pagination, loading, params, setPage, setSearch, updateParams, createItem, updateItem, deleteItem, fetchData } =
    useDataTable('/damages/trading');
  const { onImport, importModalProps } = useExcelImport('trading-damages', fetchData);

  const items = useFetchOptions('/trading/items');
  const [modalOpen, setModalOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [lines, setLines] = useState([emptyLine()]);

  const fetchStockForLine = async (index, itemId, restoreQty = 0) => {
    if (!itemId) return;
    setLines((prev) =>
      prev.map((l, i) => (i === index ? { ...l, loadingStock: true } : l))
    );
    try {
      const { data: res } = await api.get('/damages/trading/stock-options', {
        params: { itemId },
      });
      const stockInfo = {
        ...res.data,
        availableQty: (res.data?.availableQty || 0) + (restoreQty || 0),
      };
      setLines((prev) =>
        prev.map((l, i) =>
          i === index ? { ...l, stockInfo, loadingStock: false } : l
        )
      );
    } catch {
      setLines((prev) =>
        prev.map((l, i) =>
          i === index ? { ...l, stockInfo: null, loadingStock: false } : l
        )
      );
    }
  };

  const openEdit = (row) => {
    setEditRow(row);
    const mapped = row.lines?.length
      ? row.lines.map((l) => ({
          ...emptyLine(),
          itemId: l.itemId || l.item?._id || l.item?.id,
          quantity: String(l.quantity ?? ''),
          reason: l.reason || '',
          savedQty: l.quantity || 0,
        }))
      : [emptyLine()];
    setLines(mapped);
    setModalOpen(true);
    mapped.forEach((line, index) => {
      if (line.itemId) fetchStockForLine(index, line.itemId, line.savedQty);
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

  const onItemChange = (index, itemId) => {
    updateLine(index, { itemId, stockInfo: null });
    if (itemId) fetchStockForLine(index, itemId);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payloadLines = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.itemId) continue;
      const qty = parseFloat(line.quantity);
      if (!qty || qty <= 0) continue;

      if (!line.stockInfo) {
        toast.error(`Line ${i + 1}: could not load stock info for product`);
        return;
      }
      if (qty > line.stockInfo.availableQty) {
        toast.error(
          `Line ${i + 1}: insufficient stock. Available: ${formatNumber(line.stockInfo.availableQty)}`
        );
        return;
      }

      payloadLines.push({
        itemId: line.itemId,
        quantity: qty,
        reason: line.reason || undefined,
      });
    }

    if (!payloadLines.length) {
      toast.error('Add at least one valid damage line');
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
      '/damages/trading',
      params,
      (r) => ({
        Reference: r.serialNumber,
        Date: formatDate(r.date),
        'Total Loss': r.totalLoss,
        Lines: (r.lines || []).map(formatLineSummary).join('; '),
      }),
      'trading-damages'
    );

  const formatLinesSummary = (row) =>
    (row.lines || []).map(formatLineSummary).join(', ');

  return (
    <div>
      <PageHeader
        title="Trading Damages"
        subtitle="Record damaged trading inventory with auto cost calculation"
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
                            onDelete={() => deleteItem(r._id)}
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
        title={editRow ? 'Edit Trading Damage' : 'Trading Damage Entry'}
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
              const damageValue = lineDamageValue(line);
              const unit = line.stockInfo?.unit || 'KG';
              return (
                <div key={index} className="border border-gray-100 dark:border-gray-700 rounded-lg p-3 space-y-3">
                  <div className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-12 sm:col-span-5">
                      <FieldLabel required className="block text-xs mb-1">Product</FieldLabel>
                      <select
                        required
                        className="input-field"
                        value={line.itemId}
                        onChange={(e) => onItemChange(index, e.target.value)}
                      >
                        <option value="">Select product</option>
                        {items.map((i) => (
                          <option key={i._id} value={i._id}>
                            {i.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-12 sm:col-span-5">
                      <FieldLabel required className="block text-xs mb-1">Qty Damaged ({unit})</FieldLabel>
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
                    <div className="col-span-12 sm:col-span-2 flex justify-end">
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

                  {line.loadingStock && (
                    <p className="text-xs text-gray-500">Loading stock info...</p>
                  )}
                  {line.stockInfo && !line.loadingStock && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs bg-gray-50 dark:bg-gray-800 rounded p-2">
                      <div>
                        <span className="text-gray-500">Available:</span>{' '}
                        <strong>{formatNumber(line.stockInfo.availableQty)} {unit}</strong>
                      </div>
                      <div>
                        <span className="text-gray-500">Cost Price:</span>{' '}
                        <strong>{formatCurrency(line.stockInfo.costPerUnit)}/{unit}</strong>
                      </div>
                      <div>
                        <span className="text-gray-500">Damage Value:</span>{' '}
                        <strong>{formatCurrency(damageValue)}</strong>
                      </div>
                    </div>
                  )}

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

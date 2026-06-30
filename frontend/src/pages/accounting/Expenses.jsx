import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useDataTable } from '../../hooks/useDataTable';
import LoadingSpinner from '../../components/LoadingSpinner';
import { EntryActions } from '../../components/ConfirmDialog';
import { PageHeader, Pagination, ListPageToolbar, Modal, EmptyState, FieldLabel } from '../../components/common';
import { formatDate, formatCurrency, normalizeExpenseCategory } from '../../utils/helpers';
import { exportFilteredList } from '../../utils/listExport';
import ExcelImportModal from '../../components/ExcelImportModal';
import { useExcelImport } from '../../hooks/useExcelImport';

const UNIT_LABELS = {
  manufacturing: 'Manufacturing',
  trading: 'Trading',
};

export default function Expenses({ businessUnit = 'manufacturing' }) {
  const unitLabel = UNIT_LABELS[businessUnit] || businessUnit;

  const { data, pagination, loading, params, setPage, updateParams, createItem, updateItem, deleteItem, fetchData } =
    useDataTable('/accounting/expenses', {
      notifyStock: false,
      initialParams: { businessUnit },
    });

  const { onImport, importModalProps } = useExcelImport(
    businessUnit === 'trading' ? 'expenses-trading' : 'expenses-manufacturing',
    fetchData
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);

  const openCreate = () => {
    setEditItem(null);
    setModalOpen(true);
  };

  const openEdit = (expense) => {
    setEditItem(expense);
    setModalOpen(true);
  };

  const handleExport = () => exportFilteredList(
    '/accounting/expenses',
    { ...params, businessUnit },
    (e) => ({
      Date: formatDate(e.date),
      Type: e.type,
      Category: e.category,
      Amount: e.amount,
      Payment: e.paymentMode,
      Description: e.description || '',
    }),
    `${businessUnit}-expenses`
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      businessUnit,
      date: fd.get('date'),
      type: fd.get('type'),
      category: normalizeExpenseCategory(fd.get('category')),
      amount: parseFloat(fd.get('amount')),
      description: fd.get('description'),
      paymentMode: fd.get('paymentMode'),
    };
    const ok = editItem
      ? await updateItem(editItem._id, payload)
      : await createItem(payload);
    if (ok) {
      setModalOpen(false);
      setEditItem(null);
    }
  };

  return (
    <div>
      <PageHeader
        title={`${unitLabel} Expenses`}
        subtitle={`Direct, indirect, and personal expenses — ${unitLabel.toLowerCase()} only`}
        action={
          <button onClick={openCreate} className="btn-primary flex items-center gap-2">
            <Plus className="h-4 w-4" /> Add Expense
          </button>
        }
      />

      <div className="flex flex-col gap-4 mb-4">
        <select
          value={params.type || ''}
          onChange={(e) => updateParams({ type: e.target.value, page: 1 })}
          className="input-field w-full sm:max-w-xs"
        >
          <option value="">All Types</option>
          <option value="direct">Direct</option>
          <option value="indirect">Indirect</option>
          <option value="personal">Personal</option>
        </select>
        <ListPageToolbar
          showSearch={false}
          startDate={params.startDate || ''}
          endDate={params.endDate || ''}
          onStartChange={(v) => updateParams({ startDate: v, page: 1 })}
          onEndChange={(v) => updateParams({ endDate: v, page: 1 })}
          onExport={handleExport}
          onImport={onImport}
        />
      </div>

      {loading ? <LoadingSpinner className="py-12" /> : (
        <>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>Payment</th>
                  <th>Description</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.length === 0 ? (
                  <tr>
                    <td colSpan={7}><EmptyState /></td>
                  </tr>
                ) : (
                  data.map((e) => (
                    <tr key={e._id}>
                      <td>{formatDate(e.date)}</td>
                      <td className="capitalize">{e.type}</td>
                      <td>{e.category}</td>
                      <td>{formatCurrency(e.amount)}</td>
                      <td className="capitalize">{e.paymentMode}</td>
                      <td>{e.description || '-'}</td>
                      <td>
                        <EntryActions
                          onEdit={() => openEdit(e)}
                          onDelete={() => deleteItem(e._id)}
                          editTitle="Edit expense"
                          deleteTitle="Delete expense"
                          editMessage="You are about to edit this expense. Ledger entries will be updated."
                          deleteMessage="Are you sure you want to delete this expense?"
                          step2Message="This will update ledger balances. This action cannot be undone."
                        />
                      </td>
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
        onClose={() => { setModalOpen(false); setEditItem(null); }}
        title={editItem ? 'Edit Expense' : 'Add Expense'}
      >
        <form onSubmit={handleSubmit} className="space-y-4" key={editItem?._id || 'new'}>
          <div>
            <FieldLabel required>Date</FieldLabel>
            <input
              name="date"
              type="date"
              required
              defaultValue={
                editItem?.date
                  ? new Date(editItem.date).toISOString().split('T')[0]
                  : new Date().toISOString().split('T')[0]
              }
              className="input-field"
            />
          </div>
          <div>
            <FieldLabel required>Type</FieldLabel>
            <select name="type" required defaultValue={editItem?.type || 'direct'} className="input-field">
              <option value="direct">Direct</option>
              <option value="indirect">Indirect</option>
              <option value="personal">Personal</option>
            </select>
          </div>
          <div>
            <FieldLabel required>Category</FieldLabel>
            <input name="category" required defaultValue={editItem?.category} className="input-field" placeholder="e.g. Transport, Labour" />
          </div>
          <div>
            <FieldLabel required>Amount</FieldLabel>
            <input name="amount" type="number" step="0.01" min="0.01" required defaultValue={editItem?.amount} className="input-field" />
          </div>
          <div>
            <label className="block text-sm mb-1">Payment Mode</label>
            <select name="paymentMode" defaultValue={editItem?.paymentMode || 'cash'} className="input-field">
              <option value="cash">Cash</option>
              <option value="bank">Bank</option>
            </select>
          </div>
          <div>
            <label className="block text-sm mb-1">Description</label>
            <textarea name="description" defaultValue={editItem?.description} className="input-field" rows={2} />
          </div>
          <button type="submit" className="btn-primary w-full">{editItem ? 'Update' : 'Save'} Expense</button>
        </form>
      </Modal>
      <ExcelImportModal {...importModalProps} />
    </div>
  );
}

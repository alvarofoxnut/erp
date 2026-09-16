import { useState } from 'react';
import { Landmark, Pencil, Plus } from 'lucide-react';
import { useDataTable } from '../../hooks/useDataTable';
import LoadingSpinner from '../../components/LoadingSpinner';
import { PageHeader, SearchBar, Pagination, Modal, EmptyState, FieldLabel } from '../../components/common';
import { DeleteButton } from '../../components/ConfirmDialog';
import { formatCurrency } from '../../utils/helpers';

export default function Accounts() {
  const {
    data, pagination, loading, params, setPage, setSearch, saving, createItem, updateItem, deleteItem,
  } = useDataTable('/accounting/bank-accounts', { notifyStock: false });
  const [modalOpen, setModalOpen] = useState(false);
  const [editAccount, setEditAccount] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    const fd = new FormData(e.target);
    const payload = {
      name: fd.get('name'),
      bankName: fd.get('bankName'),
      accountNumber: fd.get('accountNumber'),
      ifsc: fd.get('ifsc'),
      openingBalance: parseFloat(fd.get('openingBalance') || 0),
      notes: fd.get('notes'),
      isActive: fd.get('isActive') === 'on',
    };
    const ok = editAccount
      ? await updateItem(editAccount._id, payload)
      : await createItem(payload);
    if (ok) {
      setModalOpen(false);
      setEditAccount(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Accounts"
        subtitle="Bank accounts used when invoice payments are collected or paid"
        action={(
          <button
            type="button"
            onClick={() => { setEditAccount(null); setModalOpen(true); }}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="h-4 w-4" /> Add Account
          </button>
        )}
      />

      <p className="mb-4 text-sm text-gray-500">
        Customer receipts increase the selected account. Vendor payments decrease it. Cash stays available as a payment option on invoices.
      </p>

      <div className="mb-4">
        <SearchBar value={params.search || ''} onChange={setSearch} placeholder="Search account, bank, or number..." />
      </div>

      {loading ? <LoadingSpinner className="py-12" /> : (
        <>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Bank</th>
                  <th>Account No.</th>
                  <th>Initial Balance</th>
                  <th>Current Balance</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.length === 0 ? (
                  <tr><td colSpan={7}><EmptyState message="No bank accounts yet" /></td></tr>
                ) : data.map((account) => (
                  <tr key={account._id}>
                    <td className="font-medium">
                      <span className="inline-flex items-center gap-2">
                        <Landmark className="h-4 w-4 text-primary-600" />
                        {account.name}
                      </span>
                    </td>
                    <td>{account.bankName || '—'}</td>
                    <td className="font-mono text-xs">{account.accountNumber || '—'}</td>
                    <td>{formatCurrency(account.openingBalance)}</td>
                    <td className="font-semibold">{formatCurrency(account.ledger?.currentBalance ?? account.currentBalance)}</td>
                    <td>
                      <span className={`px-2 py-1 text-xs rounded-full ${account.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                        {account.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => { setEditAccount(account); setModalOpen(true); }}
                          className="text-primary-600"
                          aria-label="Edit account"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <DeleteButton
                          onDelete={(reason) => deleteItem(account._id, reason)}
                          title="Delete account"
                          message="Delete this bank account and its opening balance?"
                          itemLabel={account.name}
                          step2Message="Only unused accounts can be deleted. Accounts already used on invoices should be deactivated."
                          className="text-red-600 text-sm font-medium hover:text-red-800"
                        />
                      </div>
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
        onClose={() => { setModalOpen(false); setEditAccount(null); }}
        title={editAccount ? 'Edit Account' : 'Add Bank Account'}
      >
        <form onSubmit={handleSubmit} className="space-y-4" key={editAccount?._id || 'new'}>
          <div>
            <FieldLabel required>Account name</FieldLabel>
            <input name="name" required defaultValue={editAccount?.name} className="input-field" placeholder="HDFC Current" />
          </div>
          <div className="form-grid-2">
            <div>
              <label className="block text-sm mb-1">Bank name</label>
              <input name="bankName" defaultValue={editAccount?.bankName || ''} className="input-field" placeholder="HDFC Bank" />
            </div>
            <div>
              <label className="block text-sm mb-1">Account number</label>
              <input name="accountNumber" defaultValue={editAccount?.accountNumber || ''} className="input-field" />
            </div>
          </div>
          <div className="form-grid-2">
            <div>
              <label className="block text-sm mb-1">IFSC</label>
              <input name="ifsc" defaultValue={editAccount?.ifsc || ''} className="input-field" />
            </div>
            <div>
              <FieldLabel required>Initial balance (₹)</FieldLabel>
              <input
                name="openingBalance"
                type="number"
                step="0.01"
                required
                defaultValue={editAccount?.openingBalance ?? 0}
                className="input-field"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm mb-1">Notes</label>
            <textarea name="notes" defaultValue={editAccount?.notes || ''} className="input-field" rows={2} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isActive" defaultChecked={editAccount?.isActive !== false} />
            Active (shown in invoice payment dropdown)
          </label>
          <button type="submit" disabled={saving} className="btn-primary w-full">
            {saving ? 'Saving...' : (editAccount ? 'Update Account' : 'Create Account')}
          </button>
        </form>
      </Modal>
    </div>
  );
}

import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { DeleteButton } from '../../components/ConfirmDialog';
import { useDataTable } from '../../hooks/useDataTable';
import LoadingSpinner from '../../components/LoadingSpinner';
import { PageHeader, Pagination, ListPageToolbar, Modal, EmptyState, FieldLabel } from '../../components/common';
import { exportFilteredList } from '../../utils/listExport';
import ExcelImportModal from '../../components/ExcelImportModal';
import { useExcelImport } from '../../hooks/useExcelImport';

export default function ManufacturingVendors() {
  const {data, pagination, loading, params, setPage, setSearch, updateParams, createItem, updateItem, deleteItem, fetchData } =
    useDataTable('/manufacturing/vendors', { notifyStock: false });
  const { onImport, importModalProps } = useExcelImport('manufacturing-vendors', fetchData);


  const handleExport = () => exportFilteredList(
    '/manufacturing/vendors',
    params,
    (v) => ({
      Name: v.name,
      Contact: v.contactPerson || '',
      Phone: v.phone || '',
      Email: v.email || '',
      GST: v.gstNumber || '',
      Address: v.address || '',
    }),
    'manufacturing-vendors'
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      name: fd.get('name'),
      contactPerson: fd.get('contactPerson'),
      phone: fd.get('phone'),
      email: fd.get('email'),
      address: fd.get('address'),
      gstNumber: fd.get('gstNumber'),
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
        title="Manufacturing Vendors"
        subtitle="Raw material suppliers for makhana manufacturing (separate from trading parties)"
        action={
          <button
            onClick={() => { setEditItem(null); setModalOpen(true); }}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="h-4 w-4" /> Add Vendor
          </button>
        }
      />

      <ListPageToolbar
        search={params.search || ''}
        onSearchChange={setSearch}
        searchPlaceholder="Search vendors..."
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
                  <th>Name</th>
                  <th>Contact</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>GST</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.length === 0 ? (
                  <tr><td colSpan={6}><EmptyState message="No manufacturing vendors yet. Add vendors who supply raw makhana." /></td></tr>
                ) : data.map((v) => (
                  <tr key={v._id}>
                    <td className="font-medium">{v.name}</td>
                    <td>{v.contactPerson || '-'}</td>
                    <td>{v.phone || '-'}</td>
                    <td>{v.email || '-'}</td>
                    <td>{v.gstNumber || '-'}</td>
                    <td className="flex gap-2">
                      <button onClick={() => { setEditItem(v); setModalOpen(true); }} className="text-blue-600">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <DeleteButton
                        onDelete={(reason) => deleteItem(v._id, reason)}
                        title="Delete vendor"
                        message={`Are you sure you want to delete vendor "${v.name}"?`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </DeleteButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage} />
        </>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editItem ? 'Edit Vendor' : 'Add Manufacturing Vendor'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <FieldLabel required>Vendor Name</FieldLabel>
            <input name="name" required defaultValue={editItem?.name} className="input-field" placeholder="e.g. Bihar Raw Makhana Supplier" />
          </div>
          <div className="form-grid-2">
            <div>
              <label className="block text-sm mb-1">Contact Person</label>
              <input name="contactPerson" defaultValue={editItem?.contactPerson} className="input-field" />
            </div>
            <div>
              <label className="block text-sm mb-1">Phone</label>
              <input name="phone" defaultValue={editItem?.phone} className="input-field" />
            </div>
          </div>
          <div>
            <label className="block text-sm mb-1">Email</label>
            <input name="email" type="email" defaultValue={editItem?.email} className="input-field" />
          </div>
          <div>
            <label className="block text-sm mb-1">GST Number</label>
            <input name="gstNumber" defaultValue={editItem?.gstNumber} className="input-field" />
          </div>
          <div>
            <label className="block text-sm mb-1">Address</label>
            <textarea name="address" defaultValue={editItem?.address} className="input-field" rows={2} />
          </div>
          <button type="submit" className="btn-primary w-full">{editItem ? 'Update' : 'Create'} Vendor</button>
        </form>
      </Modal>
      <ExcelImportModal {...importModalProps} />
    </div>
  );
}

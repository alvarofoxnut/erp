import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { DeleteButton } from '../../components/ConfirmDialog';
import { useDataTable, useFetchOptions } from '../../hooks/useDataTable';
import LoadingSpinner from '../../components/LoadingSpinner';
import { PageHeader, Pagination, ListPageToolbar, Modal, EmptyState, FieldLabel } from '../../components/common';
import { exportFilteredList } from '../../utils/listExport';
import ExcelImportModal from '../../components/ExcelImportModal';
import { useExcelImport } from '../../hooks/useExcelImport';

export default function Parties() {
  const {data, pagination, loading, params, setPage, setSearch, updateParams, createItem, updateItem, deleteItem, fetchData } =
    useDataTable('/trading/parties', { notifyStock: false, initialParams: { type: 'vendor' } });
  const { onImport, importModalProps } = useExcelImport('trading-parties', fetchData);


  const handleExport = () => exportFilteredList(
    '/trading/parties',
    params,
    (p) => ({
      Name: p.name,
      'Items Supplied': (p.suppliedItems || []).map((i) => i.name || i).join(', '),
      Phone: p.phone || '',
      Email: p.email || '',
      GST: p.gstNumber || '',
      Address: p.address || '',
    }),
    'trading-vendors'
  );
  const allItems = useFetchOptions('/trading/items');
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [selectedItems, setSelectedItems] = useState([]);

  const openCreate = () => {
    setEditItem(null);
    setSelectedItems([]);
    setModalOpen(true);
  };

  const openEdit = (party) => {
    setEditItem(party);
    setSelectedItems((party.suppliedItems || []).map((i) => i._id || i));
    setModalOpen(true);
  };

  const toggleItem = (itemId) => {
    setSelectedItems((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      name: fd.get('name'),
      type: 'vendor',
      contactPerson: fd.get('contactPerson'),
      phone: fd.get('phone'),
      email: fd.get('email'),
      address: fd.get('address'),
      gstNumber: fd.get('gstNumber'),
      suppliedItems: selectedItems,
    };
    const ok = editItem ? await updateItem(editItem._id, payload) : await createItem(payload);
    if (ok) { setModalOpen(false); setEditItem(null); }
  };

  return (
    <div>
      <PageHeader title="Trading Vendors" subtitle="Suppliers for trading purchases — assign items each vendor supplies"
        action={<button onClick={openCreate} className="btn-primary flex items-center gap-2"><Plus className="h-4 w-4" /> Add Vendor</button>} />

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
              <thead><tr><th>Name</th><th>Items Supplied</th><th>Phone</th><th>Email</th><th>GST</th><th>Actions</th></tr></thead>
              <tbody>
                {data.length === 0 ? <tr><td colSpan={6}><EmptyState message="No vendors yet. Add vendors and assign items they supply." /></td></tr> : data.map((p) => (
                  <tr key={p._id}>
                    <td className="font-medium">{p.name}</td>
                    <td className="text-sm">{(p.suppliedItems || []).map((i) => i.name || i).join(', ') || '-'}</td>
                    <td>{p.phone || '-'}</td><td>{p.email || '-'}</td><td>{p.gstNumber || '-'}</td>
                    <td className="flex gap-2">
                      <button onClick={() => openEdit(p)} className="text-blue-600"><Pencil className="h-4 w-4" /></button>
                      <DeleteButton
                        onDelete={() => deleteItem(p._id)}
                        title="Delete vendor"
                        message={`Are you sure you want to delete vendor "${p.name}"?`}
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

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editItem ? 'Edit Vendor' : 'Add Vendor'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><FieldLabel required>Vendor Name</FieldLabel><input name="name" required defaultValue={editItem?.name} className="input-field" /></div>
          <div>
            <FieldLabel required>Items Supplied</FieldLabel>
            <p className="text-xs text-gray-500 mb-2">Only vendors supplying the selected item appear when making a purchase.</p>
            <div className="max-h-40 overflow-y-auto border rounded-lg p-2 space-y-1 dark:border-gray-600">
              {allItems.length === 0 ? <p className="text-sm text-gray-500">Add trading items first.</p> : allItems.map((item) => (
                <label key={item._id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={selectedItems.includes(item._id)} onChange={() => toggleItem(item._id)} />
                  {item.name}
                </label>
              ))}
            </div>
          </div>
          <div className="form-grid-2">
            <div><label className="block text-sm mb-1">Contact Person</label><input name="contactPerson" defaultValue={editItem?.contactPerson} className="input-field" /></div>
            <div><label className="block text-sm mb-1">Phone</label><input name="phone" defaultValue={editItem?.phone} className="input-field" /></div>
          </div>
          <div><label className="block text-sm mb-1">Email</label><input name="email" type="email" defaultValue={editItem?.email} className="input-field" /></div>
          <div><label className="block text-sm mb-1">GST Number</label><input name="gstNumber" defaultValue={editItem?.gstNumber} className="input-field" /></div>
          <div><label className="block text-sm mb-1">Address</label><textarea name="address" defaultValue={editItem?.address} className="input-field" rows={2} /></div>
          <button type="submit" disabled={selectedItems.length === 0} className="btn-primary w-full">{editItem ? 'Update' : 'Create'} Vendor</button>
        </form>
      </Modal>
      <ExcelImportModal {...importModalProps} />
    </div>
  );
}

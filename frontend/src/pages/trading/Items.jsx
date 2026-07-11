import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { DeleteButton } from '../../components/ConfirmDialog';
import { useDataTable } from '../../hooks/useDataTable';
import LoadingSpinner from '../../components/LoadingSpinner';
import { PageHeader, Pagination, ListPageToolbar, Modal, EmptyState, FieldLabel } from '../../components/common';
import { exportFilteredList } from '../../utils/listExport';
import ExcelImportModal from '../../components/ExcelImportModal';
import { useExcelImport } from '../../hooks/useExcelImport';

export default function Items() {
  const {data, pagination, loading, params, setPage, setSearch, updateParams, createItem, updateItem, deleteItem, fetchData } =
    useDataTable('/trading/items', { notifyStock: false });
  const { onImport, importModalProps } = useExcelImport('trading-items', fetchData);


  const handleExport = () => exportFilteredList(
    '/trading/items',
    params,
    (item) => ({
      Name: item.name,
      SKU: item.sku || '',
      Unit: item.unit,
      Description: item.description || '',
    }),
    'trading-items'
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);

  const openCreate = () => { setEditItem(null); setModalOpen(true); };
  const openEdit = (item) => { setEditItem(item); setModalOpen(true); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const sku = String(fd.get('sku') || '').trim();
    const description = String(fd.get('description') || '').trim();
    const payload = {
      name: String(fd.get('name') || '').trim(),
      sku: sku || null,
      unit: fd.get('unit') || 'KG',
      description: description || null,
    };
    const ok = editItem ? await updateItem(editItem._id, payload) : await createItem(payload);
    if (ok) { setModalOpen(false); e.target.reset(); }
  };

  return (
    <div>
      <PageHeader title="Trading Items" subtitle="Manage trading inventory items"
        action={<button onClick={openCreate} className="btn-primary flex items-center gap-2"><Plus className="h-4 w-4" /> Add Item</button>} />
      <ListPageToolbar
        search={params.search || ''}
        onSearchChange={setSearch}
        searchPlaceholder="Search items..."
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
              <thead><tr><th>Name</th><th>SKU</th><th>Unit</th><th>Description</th><th>Actions</th></tr></thead>
              <tbody>
                {data.length === 0 ? <tr><td colSpan={5}><EmptyState /></td></tr> : data.map((item) => (
                  <tr key={item._id}>
                    <td className="font-medium">{item.name}</td><td>{item.sku || '-'}</td><td>{item.unit}</td><td>{item.description || '-'}</td>
                    <td className="flex gap-2">
                      <button onClick={() => openEdit(item)} className="text-blue-600 hover:text-blue-800"><Pencil className="h-4 w-4" /></button>
                      <DeleteButton
                        onDelete={(reason) => deleteItem(item._id, reason)}
                        title="Delete item"
                        message={`Are you sure you want to delete item "${item.name}"?`}
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

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editItem ? 'Edit Item' : 'Add Item'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><FieldLabel required>Name</FieldLabel><input name="name" required defaultValue={editItem?.name} className="input-field" /></div>
          <div><label className="block text-sm mb-1">SKU</label><input name="sku" defaultValue={editItem?.sku} className="input-field" /></div>
          <div><label className="block text-sm mb-1">Unit</label><input name="unit" defaultValue={editItem?.unit || 'KG'} className="input-field" /></div>
          <div><label className="block text-sm mb-1">Description</label><textarea name="description" defaultValue={editItem?.description} className="input-field" rows={2} /></div>
          <button type="submit" className="btn-primary w-full">{editItem ? 'Update' : 'Create'} Item</button>
        </form>
      </Modal>
      <ExcelImportModal {...importModalProps} />
    </div>
  );
}

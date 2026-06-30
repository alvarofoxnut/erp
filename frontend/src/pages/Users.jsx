import { useState, useEffect } from 'react';
import { Plus, Pencil, Upload } from 'lucide-react';
import { useDataTable } from '../hooks/useDataTable';
import LoadingSpinner from '../components/LoadingSpinner';
import { PageHeader, SearchBar, Pagination, Modal, EmptyState, FieldLabel } from '../components/common';
import api from '../services/api';
import ExcelImportModal from '../components/ExcelImportModal';
import { useExcelImport } from '../hooks/useExcelImport';

export default function Users() {
  const { data, pagination, loading, params, setPage, setSearch, createItem, updateItem, fetchData } = useDataTable('/users', { notifyStock: false });
  const [modalOpen, setModalOpen] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const { onImport, importModalProps } = useExcelImport('users', fetchData);
  const [roles, setRoles] = useState([]);

  useEffect(() => {
    api.get('/roles', { params: { limit: 100 } })
      .then(({ data: res }) => setRoles(res.data || []))
      .catch(() => setRoles([]));
  }, []);

  const roleLabel = (slug) => roles.find((r) => r.slug === slug)?.name || slug;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      name: fd.get('name'), email: fd.get('email'), role: fd.get('role'),
    };
    if (fd.get('password')) payload.password = fd.get('password');

    const ok = editUser
      ? await updateItem(editUser._id, payload)
      : await createItem({ ...payload, password: fd.get('password') });
    if (ok) { setModalOpen(false); setEditUser(null); }
  };

  return (
    <div>
      <PageHeader title="User Management" subtitle="Assign roles to control module access"
        action={<button onClick={() => { setEditUser(null); setModalOpen(true); }} className="btn-primary flex items-center gap-2"><Plus className="h-4 w-4" /> Add User</button>} />
      <div className="mb-4"><SearchBar value={params.search || ''} onChange={setSearch} placeholder="Search users..." /></div>

      {loading ? <LoadingSpinner className="py-12" /> : (
        <>
          <div className="table-container">
            <table className="data-table">
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Actions</th></tr></thead>
              <tbody>
                {data.length === 0 ? <tr><td colSpan={4}><EmptyState /></td></tr> : data.map((u) => (
                  <tr key={u._id}>
                    <td className="font-medium">{u.name}</td><td>{u.email}</td>
                    <td><span className="px-2 py-1 text-xs rounded-full bg-primary-100 text-primary-800">{roleLabel(u.role)}</span></td>
                    <td><button onClick={() => { setEditUser(u); setModalOpen(true); }} className="text-blue-600"><Pencil className="h-4 w-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage} />
        </>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editUser ? 'Edit User' : 'Add User'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><FieldLabel required>Name</FieldLabel><input name="name" required defaultValue={editUser?.name} className="input-field" /></div>
          <div><FieldLabel required>Email</FieldLabel><input name="email" type="email" required defaultValue={editUser?.email} className="input-field" /></div>
          <div><FieldLabel required={!editUser}>{editUser ? 'New Password (leave blank to keep)' : 'Password'}</FieldLabel><input name="password" type="password" required={!editUser} minLength={6} className="input-field" /></div>
          <div><FieldLabel required>Role</FieldLabel>
            <select name="role" required defaultValue={editUser?.role || 'operator'} className="input-field">
              {roles.length === 0 ? (
                <>
                  <option value="admin">Admin</option>
                  <option value="manager">Manager</option>
                  <option value="operator">Operator</option>
                </>
              ) : roles.map((r) => (
                <option key={r.slug} value={r.slug}>{r.name}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-primary w-full">{editUser ? 'Update' : 'Create'} User</button>
        </form>
      </Modal>
      <ExcelImportModal {...importModalProps} />
    </div>
  );
}

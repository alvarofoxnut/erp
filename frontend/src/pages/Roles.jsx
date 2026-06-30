import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Shield } from 'lucide-react';
import { DeleteButton } from '../components/ConfirmDialog';
import { useDataTable } from '../hooks/useDataTable';
import LoadingSpinner from '../components/LoadingSpinner';
import { PageHeader, SearchBar, Pagination, Modal, EmptyState, FieldLabel } from '../components/common';
import { usePermissions } from '../hooks/usePermissions';
import { PERMISSIONS } from '../utils/permissions';
import api from '../services/api';
import toast from 'react-hot-toast';
import { getErrorMessage } from '../utils/helpers';

function PermissionPicker({ groups, selected, onChange, disabled }) {
  const toggle = (key) => {
    if (disabled) return;
    onChange(
      selected.includes(key) ? selected.filter((p) => p !== key) : [...selected, key]
    );
  };

  const toggleGroup = (items) => {
    if (disabled) return;
    const keys = items.map((i) => i.key);
    const allSelected = keys.every((k) => selected.includes(k));
    if (allSelected) {
      onChange(selected.filter((p) => !keys.includes(p)));
    } else {
      onChange([...new Set([...selected, ...keys])]);
    }
  };

  return (
    <div className="space-y-4 max-h-64 overflow-y-auto border rounded-lg p-3">
      {groups.map((group) => (
        <div key={group.label}>
          <button
            type="button"
            onClick={() => toggleGroup(group.items)}
            disabled={disabled}
            className="text-sm font-medium text-primary-700 dark:text-primary-400 mb-2 hover:underline disabled:opacity-50"
          >
            {group.label}
          </button>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {group.items.map((item) => (
              <label key={item.key} className="flex items-start gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.includes(item.key)}
                  onChange={() => toggle(item.key)}
                  disabled={disabled}
                  className="mt-0.5"
                />
                <span>{item.label}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Roles() {
  const { can } = usePermissions();
  const canWrite = can(PERMISSIONS.ROLES_WRITE);
  const { data, pagination, loading, params, setPage, setSearch, fetchData } = useDataTable('/roles', { notifyStock: false });
  const [modalOpen, setModalOpen] = useState(false);
  const [editRole, setEditRole] = useState(null);
  const [permissionGroups, setPermissionGroups] = useState([]);
  const [selectedPermissions, setSelectedPermissions] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/roles/permissions')
      .then(({ data: res }) => setPermissionGroups(res.data || []))
      .catch(() => toast.error('Failed to load permissions'));
  }, []);

  const openCreate = () => {
    setEditRole(null);
    setSelectedPermissions([]);
    setModalOpen(true);
  };

  const openEdit = (role) => {
    setEditRole(role);
    setSelectedPermissions(role.permissions || []);
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedPermissions.length) {
      toast.error('Select at least one permission');
      return;
    }

    const fd = new FormData(e.target);
    const payload = {
      name: fd.get('name'),
      permissions: selectedPermissions,
    };

    setSaving(true);
    try {
      if (editRole) {
        await api.put(`/roles/${editRole._id}`, payload);
        toast.success('Role updated');
      } else {
        await api.post('/roles', payload);
        toast.success('Role created');
      }
      setModalOpen(false);
      setEditRole(null);
      fetchData();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRole = async (role) => {
    try {
      await api.delete(`/roles/${role._id}`);
      toast.success('Role deleted');
      fetchData();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <div>
      <PageHeader
        title="Roles & Permissions"
        subtitle="Create custom roles and assign module access"
        action={canWrite && (
          <button onClick={openCreate} className="btn-primary flex items-center gap-2">
            <Plus className="h-4 w-4" /> Add Role
          </button>
        )}
      />

      <div className="mb-4">
        <SearchBar value={params.search || ''} onChange={setSearch} placeholder="Search roles..." />
      </div>

      {loading ? <LoadingSpinner className="py-12" /> : (
        <>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Permissions</th>
                  {canWrite && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {data.length === 0 ? (
                  <tr><td colSpan={canWrite ? 3 : 2}><EmptyState /></td></tr>
                ) : data.map((role) => (
                  <tr key={role._id}>
                    <td className="font-medium flex items-center gap-2">
                      <Shield className="h-4 w-4 text-primary-600" />
                      {role.name}
                    </td>
                    <td>{role.permissions?.length || 0}</td>
                    {canWrite && (
                      <td className="flex gap-2">
                        <button onClick={() => openEdit(role)} className="text-blue-600" title="Edit">
                          <Pencil className="h-4 w-4" />
                        </button>
                        {!role.isSystem && (
                          <DeleteButton
                            onDelete={() => handleDeleteRole(role)}
                            title="Delete role"
                            message={`Are you sure you want to delete role "${role.name}"?`}
                            step2Message="Users assigned to this role may lose access. This action cannot be undone."
                          >
                            <Trash2 className="h-4 w-4" />
                          </DeleteButton>
                        )}
                      </td>
                    )}
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
        onClose={() => { setModalOpen(false); setEditRole(null); }}
        title={editRole ? `Edit Role — ${editRole.name}` : 'Create Role'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <FieldLabel required>Role Name</FieldLabel>
            <input
              name="name"
              required
              defaultValue={editRole?.name}
              disabled={editRole?.isSystem && editRole?.slug === 'admin'}
              className="input-field"
            />
          </div>
          <div>
            <FieldLabel required className="block text-sm mb-2">Permissions</FieldLabel>
            {permissionGroups.length === 0 ? (
              <LoadingSpinner className="py-4" />
            ) : (
              <PermissionPicker
                groups={permissionGroups}
                selected={selectedPermissions}
                onChange={setSelectedPermissions}
                disabled={editRole?.isSystem && editRole?.slug === 'admin'}
              />
            )}
          </div>
          <button
            type="submit"
            disabled={saving || (editRole?.isSystem && editRole?.slug === 'admin')}
            className="btn-primary w-full disabled:opacity-50"
          >
            {saving ? 'Saving...' : editRole ? 'Update Role' : 'Create Role'}
          </button>
        </form>
      </Modal>
    </div>
  );
}

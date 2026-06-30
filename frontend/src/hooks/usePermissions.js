import { useSelector } from 'react-redux';
import { hasPermission, hasAnyPermission } from '../utils/permissions';

export function usePermissions() {
  const { user } = useSelector((state) => state.auth);

  return {
    user,
    can: (permission) => hasPermission(user, permission),
    canAny: (permissions) => hasAnyPermission(user, permissions),
    permissions: user?.permissions || [],
  };
}

import { Navigate, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import LoadingSpinner from './LoadingSpinner';
import { hasAnyPermission } from '../utils/permissions';

export default function ProtectedRoute({ children, permissions, roles }) {
  const { isAuthenticated, user, sessionChecked } = useSelector((state) => state.auth);
  const location = useLocation();

  // Wait for cookie/session probe before redirecting to login
  if (!sessionChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (permissions?.length && !hasAnyPermission(user, permissions)) {
    return <Navigate to="/dashboard" replace />;
  }

  if (roles && user && !roles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

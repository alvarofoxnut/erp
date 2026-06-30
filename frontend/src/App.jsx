import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Provider, useDispatch, useSelector } from 'react-redux';
import { Toaster } from 'react-hot-toast';
import store from './store';
import { fetchMe } from './store/slices/authSlice';
import { initTheme } from './store/slices/themeSlice';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ManufacturingVendors from './pages/manufacturing/ManufacturingVendors';
import Brands from './pages/manufacturing/Brands';
import RawPurchase from './pages/manufacturing/RawPurchase';
import MachineEntry from './pages/manufacturing/MachineEntry';
import QualityProduction from './pages/manufacturing/QualityProduction';
import FinishedProduction from './pages/manufacturing/FinishedProduction';
import ManufacturingSales from './pages/manufacturing/ManufacturingSales';
import ManufacturingDamages from './pages/manufacturing/ManufacturingDamages';
import Items from './pages/trading/Items';
import Parties from './pages/trading/Parties';
import Purchases from './pages/trading/Purchases';
import Sales from './pages/trading/Sales';
import TradingDamages from './pages/trading/TradingDamages';
import Inventory from './pages/Inventory';
import Expenses from './pages/accounting/Expenses';
import Ledgers from './pages/accounting/Ledgers';
import BalanceSheet from './pages/BalanceSheet';
import Invoices from './pages/Invoices';
import Reports from './pages/Reports';
import Users from './pages/Users';
import Roles from './pages/Roles';
import AuditLogs from './pages/admin/AuditLogs';
import LoadingSpinner from './components/LoadingSpinner';
import { PERMISSIONS } from './utils/permissions';

function AppRoutes() {
  const dispatch = useDispatch();
  const { isAuthenticated } = useSelector((state) => state.auth);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    dispatch(initTheme());
    if (localStorage.getItem('accessToken')) {
      dispatch(fetchMe()).finally(() => setInitializing(false));
    } else {
      setInitializing(false);
    }
  }, [dispatch]);

  if (initializing) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/dashboard" /> : <Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout>
              <Outlet />
            </Layout>
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="manufacturing/vendors" element={<ManufacturingVendors />} />
        <Route path="manufacturing/brands" element={<Brands />} />
        <Route path="manufacturing/raw-purchase" element={<RawPurchase />} />
        <Route path="manufacturing/machine-entry" element={<MachineEntry />} />
        <Route path="manufacturing/quality-production" element={<QualityProduction />} />
        <Route path="manufacturing/finished-production" element={<FinishedProduction />} />
        <Route path="manufacturing/sales" element={<ManufacturingSales />} />
        <Route path="manufacturing/damages" element={<ManufacturingDamages />} />
        <Route path="manufacturing/expenses" element={<Expenses businessUnit="manufacturing" />} />
        <Route path="manufacturing/ledgers" element={<Ledgers businessUnit="manufacturing" />} />
        <Route path="trading/items" element={<Items />} />
        <Route path="trading/parties" element={<Parties />} />
        <Route path="trading/purchases" element={<Purchases />} />
        <Route path="trading/sales" element={<Sales />} />
        <Route path="trading/damages" element={<TradingDamages />} />
        <Route path="trading/expenses" element={<Expenses businessUnit="trading" />} />
        <Route path="trading/ledgers" element={<Ledgers businessUnit="trading" />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="accounting/expenses" element={<Navigate to="/manufacturing/expenses" replace />} />
        <Route path="accounting/ledgers" element={<Navigate to="/manufacturing/ledgers" replace />} />
        <Route
          path="balance-sheet"
          element={
            <ProtectedRoute permissions={[PERMISSIONS.REPORTS_READ]}>
              <BalanceSheet />
            </ProtectedRoute>
          }
        />
        <Route path="invoices" element={<Navigate to="/invoices/customers" replace />} />
        <Route path="invoices/:type" element={<Invoices />} />
        <Route path="reports" element={<Reports />} />
        <Route
          path="users"
          element={
            <ProtectedRoute roles={['admin']}>
              <Users />
            </ProtectedRoute>
          }
        />
        <Route
          path="roles"
          element={
            <ProtectedRoute roles={['admin']}>
              <Roles />
            </ProtectedRoute>
          }
        />
        <Route
          path="audit-logs"
          element={
            <ProtectedRoute roles={['admin']}>
              <AuditLogs />
            </ProtectedRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" />} />
    </Routes>
  );
}

function App() {
  return (
    <Provider store={store}>
      <BrowserRouter basename="/admin-panel">
        <AppRoutes />
        <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
      </BrowserRouter>
    </Provider>
  );
}

export default App;

import { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Provider, useDispatch, useSelector } from 'react-redux';
import { Toaster } from 'react-hot-toast';
import store from './store';
import { fetchMe } from './store/slices/authSlice';
import { initTheme } from './store/slices/themeSlice';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import LoadingSpinner from './components/LoadingSpinner';
import QueryCacheSync from './components/QueryCacheSync';
import { PERMISSIONS } from './utils/permissions';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const ManufacturingVendors = lazy(() => import('./pages/manufacturing/ManufacturingVendors'));
const Brands = lazy(() => import('./pages/manufacturing/Brands'));
const RawPurchase = lazy(() => import('./pages/manufacturing/RawPurchase'));
const MachineEntry = lazy(() => import('./pages/manufacturing/MachineEntry'));
const QualityProduction = lazy(() => import('./pages/manufacturing/QualityProduction'));
const FinishedProduction = lazy(() => import('./pages/manufacturing/FinishedProduction'));
const ManufacturingSales = lazy(() => import('./pages/manufacturing/ManufacturingSales'));
const ManufacturingDamages = lazy(() => import('./pages/manufacturing/ManufacturingDamages'));
const Items = lazy(() => import('./pages/trading/Items'));
const Parties = lazy(() => import('./pages/trading/Parties'));
const Purchases = lazy(() => import('./pages/trading/Purchases'));
const Sales = lazy(() => import('./pages/trading/Sales'));
const TradingDamages = lazy(() => import('./pages/trading/TradingDamages'));
const Inventory = lazy(() => import('./pages/Inventory'));
const Expenses = lazy(() => import('./pages/accounting/Expenses'));
const Ledgers = lazy(() => import('./pages/accounting/Ledgers'));
const BalanceSheet = lazy(() => import('./pages/BalanceSheet'));
const Invoices = lazy(() => import('./pages/Invoices'));
const Reports = lazy(() => import('./pages/Reports'));
const Users = lazy(() => import('./pages/Users'));
const Roles = lazy(() => import('./pages/Roles'));
const AuditLogs = lazy(() => import('./pages/admin/AuditLogs'));
const DeletedRecords = lazy(() => import('./pages/admin/DeletedRecords'));

function PageFallback() {
  return (
    <div className="min-h-[40vh] flex items-center justify-center">
      <LoadingSpinner size="lg" />
    </div>
  );
}

function AppRoutes() {
  const dispatch = useDispatch();
  const { isAuthenticated } = useSelector((state) => state.auth);

  useEffect(() => {
    dispatch(initTheme());
    // Do not block Login UI — ProtectedRoute waits on sessionChecked
    dispatch(fetchMe());
  }, [dispatch]);

  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/dashboard" /> : <Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout>
              <Suspense fallback={<PageFallback />}>
                <Outlet />
              </Suspense>
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
        <Route
          path="deleted-records"
          element={
            <ProtectedRoute roles={['admin']}>
              <DeletedRecords />
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
        <QueryCacheSync />
        <AppRoutes />
        <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
      </BrowserRouter>
    </Provider>
  );
}

export default App;

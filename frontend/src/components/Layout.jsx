import { NavLink, useNavigate, useLocation } from 'react-router-dom';

import { useDispatch, useSelector } from 'react-redux';

import {
  LayoutDashboard,
  Factory,
  ShoppingCart,
  FileText,
  Users,
  Menu,
  X,
  LogOut,
  Moon,
  Sun,
  ChevronDown,
  Shield,
  ScrollText,
  Trash2,
  Warehouse,
  Scale,
  Receipt,
} from 'lucide-react';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { logout } from '../store/slices/authSlice';

import { toggleTheme } from '../store/slices/themeSlice';

import { usePermissions } from '../hooks/usePermissions';

import { PERMISSIONS } from '../utils/permissions';



const navItems = [

  {

    label: 'Overview',

    collapsible: false,

    children: [

      { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: PERMISSIONS.DASHBOARD_READ },

      { path: '/inventory', label: 'Inventory', icon: Warehouse, permission: PERMISSIONS.INVENTORY_READ },

    ],

  },

  {

    label: 'Manufacturing',

    icon: Factory,

    children: [

      { path: '/manufacturing/vendors', label: 'Vendors', permission: PERMISSIONS.MFG_VENDORS_READ },

      { path: '/manufacturing/raw-purchase', label: 'Raw Purchase', permission: PERMISSIONS.MFG_RAW_PURCHASE_READ },

      { path: '/manufacturing/machine-entry', label: 'Machine Entry (WIP)', permission: PERMISSIONS.MFG_WIP_READ },

      { path: '/manufacturing/quality-production', label: 'Quality Output', permission: PERMISSIONS.MFG_QUALITY_READ },

      { path: '/manufacturing/brands', label: 'Brands', permission: PERMISSIONS.MFG_BRANDS_READ },

      { path: '/manufacturing/finished-production', label: 'Finished Production', permission: PERMISSIONS.MFG_FINISHED_READ },

      { path: '/manufacturing/sales', label: 'Sales', permission: PERMISSIONS.MFG_SALES_READ },

      { path: '/manufacturing/damages', label: 'Damages', permission: PERMISSIONS.MFG_DAMAGES_READ },

      { path: '/manufacturing/expenses', label: 'Expenses', permission: PERMISSIONS.EXPENSES_READ },

      { path: '/manufacturing/ledgers', label: 'Ledgers', permission: PERMISSIONS.LEDGERS_READ },

    ],

  },

  {

    label: 'Trading',

    icon: ShoppingCart,

    children: [

      { path: '/trading/items', label: 'Items', permission: PERMISSIONS.TRADING_ITEMS_READ },

      { path: '/trading/parties', label: 'Vendors', permission: PERMISSIONS.TRADING_VENDORS_READ },

      { path: '/trading/purchases', label: 'Purchases', permission: PERMISSIONS.TRADING_PURCHASES_READ },

      { path: '/trading/sales', label: 'Trading Sales', permission: PERMISSIONS.TRADING_SALES_READ },

      { path: '/trading/damages', label: 'Damages', permission: PERMISSIONS.TRADING_DAMAGES_READ },

      { path: '/trading/expenses', label: 'Expenses', permission: PERMISSIONS.EXPENSES_READ },

      { path: '/trading/ledgers', label: 'Ledgers', permission: PERMISSIONS.LEDGERS_READ },

    ],

  },

  {

    label: 'Finance',

    collapsible: false,

    children: [

      { path: '/balance-sheet', label: 'Trading Account', icon: Scale, permission: PERMISSIONS.REPORTS_READ },

      { path: '/reports', label: 'Reports', icon: FileText, permission: PERMISSIONS.REPORTS_READ },

      { path: '/invoices/customers', label: 'Invoice Customers', icon: Receipt, permission: PERMISSIONS.INVOICES_READ },

      { path: '/invoices/vendors', label: 'Invoice Vendors', icon: Receipt, permission: PERMISSIONS.INVOICES_READ },

    ],

  },

  {

    label: 'Administration',

    collapsible: false,

    adminOnly: true,

    children: [

      { path: '/users', label: 'Users', icon: Users, permission: PERMISSIONS.USERS_READ },

      { path: '/roles', label: 'Roles & Permissions', icon: Shield, permission: PERMISSIONS.ROLES_READ },

      { path: '/audit-logs', label: 'Audit Logs', icon: ScrollText, adminOnly: true },

      { path: '/deleted-records', label: 'Deleted Records', icon: Trash2, adminOnly: true },

    ],

  },

];



function NavItem({ item, onNavigate, can, userRole }) {

  const location = useLocation();
  const hasActiveChild = item.children?.some(
    (child) => location.pathname === child.path || location.pathname.startsWith(`${child.path}/`),
  );
  const [open, setOpen] = useState(hasActiveChild);

  useEffect(() => {
    if (hasActiveChild) setOpen(true);
  }, [hasActiveChild]);



  if (item.children) {

    const visibleChildren = item.children.filter((child) => {
      if (child.adminOnly && userRole !== 'admin') return false;
      if (child.permission && !can(child.permission)) return false;
      return true;
    });

    if (item.adminOnly && userRole !== 'admin') return null;

    if (!visibleChildren.length) return null;

    if (item.collapsible === false) {
      return (
        <div className="space-y-1">
          <p className="px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
            {item.label}
          </p>
          {visibleChildren.map((child) => (
            <NavLink
              key={child.path}
              to={child.path}
              onClick={onNavigate}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${
                  isActive
                    ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 font-medium'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`
              }
            >
              {child.icon && <child.icon className="h-5 w-5 shrink-0" />}
              {child.label}
            </NavLink>
          ))}
        </div>
      );
    }

    return (

      <div>

        <button

          onClick={() => setOpen(!open)}

          className="flex items-center justify-between w-full px-3 py-2 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"

        >

          <span className="flex items-center gap-3">

            <item.icon className="h-5 w-5" />

            {item.label}

          </span>

          <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />

        </button>

        {open && (

          <div className="ml-4 mt-1 space-y-1">

            {visibleChildren.map((child) => (

              <NavLink

                key={child.path}

                to={child.path}

                onClick={onNavigate}

                className={({ isActive }) =>

                  `block px-3 py-2 rounded-lg text-sm ${

                    isActive

                      ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 font-medium'

                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'

                  }`

                }

              >

                {child.label}

              </NavLink>

            ))}

          </div>

        )}

      </div>

    );

  }



  if (item.adminOnly && userRole !== 'admin') return null;

  if (item.permission && !can(item.permission)) return null;



  return (

    <NavLink

      to={item.path}

      onClick={onNavigate}

      className={({ isActive }) =>

        `flex items-center gap-3 px-3 py-2 rounded-lg ${

          isActive

            ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 font-medium'

            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'

        }`

      }

    >

      <item.icon className="h-5 w-5" />

      {item.label}

    </NavLink>

  );

}



export default function Layout({ children }) {

  const [sidebarOpen, setSidebarOpen] = useState(false);

  const dispatch = useDispatch();

  const navigate = useNavigate();

  const { user } = useSelector((state) => state.auth);

  const { darkMode } = useSelector((state) => state.theme);

  const { can } = usePermissions();



  const handleLogout = async () => {

    await dispatch(logout());

    navigate('/login');

  };



  const visibleNavItems = navItems.filter((item) => {
    if (item.adminOnly && user?.role !== 'admin') return false;
    if (item.children) {
      return item.children.some((child) => {
        if (child.adminOnly && user?.role !== 'admin') return false;
        return !child.permission || can(child.permission);
      });
    }
    return !item.permission || can(item.permission);
  });

  useEffect(() => {
    const html = document.documentElement;
    const { overflow: htmlOverflow } = html.style;
    const { overflow: bodyOverflow } = document.body.style;

    html.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';

    return () => {
      html.style.overflow = htmlOverflow;
      document.body.style.overflow = bodyOverflow;
    };
  }, []);

  useEffect(() => {
    if (!sidebarOpen) return undefined;

    const html = document.documentElement;
    const { overflow: htmlOverflow, overflowX: htmlOverflowX } = html.style;
    const { overflow: bodyOverflow, overflowX: bodyOverflowX, position, top, left, right, width } = document.body.style;
    const scrollY = window.scrollY;

    html.style.overflow = 'hidden';
    html.style.overflowX = 'hidden';
    document.body.style.overflow = 'hidden';
    document.body.style.overflowX = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';

    return () => {
      html.style.overflow = htmlOverflow;
      html.style.overflowX = htmlOverflowX;
      document.body.style.overflow = bodyOverflow;
      document.body.style.overflowX = bodyOverflowX;
      document.body.style.position = position;
      document.body.style.top = top;
      document.body.style.left = left;
      document.body.style.right = right;
      document.body.style.width = width;
      window.scrollTo(0, scrollY);
    };
  }, [sidebarOpen]);

  return (

    <div className="flex h-screen overflow-hidden">

      {sidebarOpen && createPortal(
        <div
          className="fixed inset-0 z-40 bg-black/50 touch-none lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />,
        document.body,
      )}



      <aside className={`fixed inset-y-0 left-0 z-50 flex h-screen w-64 flex-col overflow-hidden bg-white dark:bg-gray-800 border-r dark:border-gray-700 transform transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>

        <div className="flex shrink-0 items-center justify-between p-4 border-b dark:border-gray-700">

          <div>

            <h1 className="text-lg font-bold text-primary-600">Makhana ERP</h1>

            <p className="text-xs text-gray-500">Foxnut Manufacturing</p>

          </div>

          <button className="lg:hidden" onClick={() => setSidebarOpen(false)}>

            <X className="h-5 w-5" />

          </button>

        </div>



        <nav className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-1">

          {visibleNavItems.map((item) => (

            <NavItem key={item.path || item.label} item={item} onNavigate={() => setSidebarOpen(false)} can={can} userRole={user?.role} />

          ))}

        </nav>



        <div className="shrink-0 p-4 border-t dark:border-gray-700 bg-white dark:bg-gray-800">

          <div className="flex items-center gap-2 mb-3">

            <div className="h-8 w-8 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center text-primary-700 font-semibold text-sm">

              {user?.name?.charAt(0)}

            </div>

            <div className="flex-1 min-w-0">

              <p className="text-sm font-medium truncate">{user?.name}</p>

              <p className="text-xs text-gray-500 capitalize">{user?.role}</p>

            </div>

          </div>

          <div className="flex gap-2">

            <button onClick={() => dispatch(toggleTheme())} className="btn-secondary flex-1 p-2 flex justify-center">

              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}

            </button>

            <button onClick={handleLogout} className="btn-secondary flex-1 p-2 flex justify-center text-red-600">

              <LogOut className="h-4 w-4" />

            </button>

          </div>

        </div>

      </aside>



      <div className="flex flex-1 flex-col min-w-0 h-screen overflow-hidden lg:ml-64">

        <header className="lg:hidden shrink-0 flex items-center gap-4 p-4 bg-white dark:bg-gray-800 border-b dark:border-gray-700">

          <button onClick={() => setSidebarOpen(true)}>

            <Menu className="h-6 w-6" />

          </button>

          <h1 className="font-bold text-primary-600 truncate min-w-0 flex-1">Makhana ERP</h1>

        </header>

        <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 lg:p-6">{children}</main>

      </div>

    </div>

  );

}


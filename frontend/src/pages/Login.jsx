import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Activity,
  BarChart3,
  Eye,
  EyeOff,
  Factory,
  ShieldCheck,
  Warehouse,
} from 'lucide-react';
import { login, clearError } from '../store/slices/authSlice';
import LoadingSpinner from '../components/LoadingSpinner';
import { FieldLabel } from '../components/common';

const FEATURES = [
  { icon: Warehouse, label: 'Inventory Management', desc: 'Real-time stock across manufacturing & trading' },
  { icon: Factory, label: 'Manufacturing Tracking', desc: 'Raw material to finished goods workflow' },
  { icon: BarChart3, label: 'Financial Reports', desc: 'Trading accounts, P&L, and ledgers' },
  { icon: Activity, label: 'User Activity Monitoring', desc: 'Audit logs and role-based access' },
];

function BrandLogo({ compact = false }) {
  return (
    <div className={`flex items-center gap-3 ${compact ? '' : 'mb-8'}`}>
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-md ring-1 ring-white/25 shadow-lg">
        <Factory className="h-6 w-6 text-white" strokeWidth={1.75} />
      </div>
      <div>
        <p className="text-xl font-bold tracking-tight text-white">Makhana ERP</p>
        {!compact && (
          <p className="text-sm text-emerald-100/80">Foxnut Manufacturing & Trading</p>
        )}
      </div>
    </div>
  );
}

function BrandingPanel() {
  return (
    <div className="relative flex h-full w-full flex-col justify-between overflow-hidden p-10 xl:p-14">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary-900 via-emerald-900 to-primary-800" />
      <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-emerald-400/20 blur-3xl" />
      <div className="absolute -bottom-32 -right-16 h-96 w-96 rounded-full bg-primary-400/15 blur-3xl" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.08),transparent_50%)]" />
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.4) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      <div className="relative z-10">
        <BrandLogo />

        <div className="mt-8 max-w-md">
          <h1 className="text-2xl font-bold leading-tight text-white xl:text-3xl">
            Smart Manufacturing &amp; Trading ERP
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-emerald-100/90 xl:text-base">
            Manage manufacturing, trading, inventory, sales, purchases, damages, reports,
            and financials from a single platform.
          </p>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-2.5 xl:gap-3">
          {FEATURES.map(({ icon: Icon, label, desc }) => (
            <div
              key={label}
              className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/10 p-3 backdrop-blur-md transition-colors hover:bg-white/15 xl:items-start xl:p-4"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/20 xl:h-10 xl:w-10 xl:rounded-xl">
                <Icon className="h-4 w-4 text-emerald-200 xl:h-5 xl:w-5" strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">{label}</p>
                <p className="mt-0.5 hidden text-xs leading-relaxed text-emerald-100/75 xl:block">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="relative z-10 space-y-3">
        <div className="flex items-center gap-2 text-xs text-emerald-100/60">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          <span>Enterprise-grade security &amp; role-based access control</span>
        </div>
        <p className="text-xs text-emerald-100/50">
          Developed by{' '}
          <a
            href="https://bluepeakstudio.in/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-emerald-100/80 underline-offset-2 transition-colors hover:text-white hover:underline"
          >
            BluePeak Studio
          </a>
        </p>
      </div>
    </div>
  );
}

export default function Login() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { loading, error, isAuthenticated } = useSelector((state) => state.auth);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard');
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    if (error) {
      toast.error(error);
      dispatch(clearError());
    }
  }, [error, dispatch]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    dispatch(login({
      email: form.get('email'),
      password: form.get('password'),
    }));
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">
      {/* Left — branding (desktop) */}
      <div className="hidden h-full w-1/2 shrink-0 lg:block">
        <BrandingPanel />
      </div>

      {/* Right — login */}
      <div className="relative flex h-full min-h-0 w-full flex-col items-center justify-center overflow-hidden px-5 py-6 sm:px-8 lg:w-1/2">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary-50/80 via-white to-emerald-50/50 dark:from-gray-950 dark:via-gray-900 dark:to-primary-950/30 lg:from-transparent lg:via-transparent lg:to-transparent" />
        <div className="pointer-events-none absolute -right-20 top-0 h-64 w-64 rounded-full bg-primary-200/30 blur-3xl dark:bg-primary-900/20 lg:hidden" />

        {/* Mobile brand strip */}
        <div className="relative z-10 mb-8 lg:hidden">
          <BrandLogo compact />
        </div>

        <div className="relative z-10 w-full max-w-[420px]">
          <div className="rounded-2xl border border-gray-200/80 bg-white/90 p-6 shadow-xl shadow-gray-200/50 backdrop-blur-sm dark:border-gray-700/80 dark:bg-gray-900/90 dark:shadow-none sm:p-8">
            <div className="mb-6 text-center lg:text-left">
              <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                Welcome back
              </h2>
              <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">
                Sign in to access your ERP dashboard
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <FieldLabel required className="mb-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                  Email
                </FieldLabel>
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  className="input-field transition-shadow focus:shadow-md focus:shadow-primary-500/10"
                  placeholder="admin@makhanaerp.com"
                />
              </div>

              <div>
                <FieldLabel required className="mb-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                  Password
                </FieldLabel>
                <div className="relative">
                  <input
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    className="input-field pr-11 transition-shadow focus:shadow-md focus:shadow-primary-500/10"
                    placeholder="Enter your password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-300"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <input
                    type="checkbox"
                    name="remember"
                    className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-gray-600"
                  />
                  Remember me
                </label>
                <button
                  type="button"
                  className="text-sm font-medium text-primary-600 transition-colors hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
                  onClick={() => toast('Please contact your administrator to reset your password.')}
                >
                  Forgot password?
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full flex h-11 items-center justify-center rounded-xl text-sm font-semibold shadow-lg shadow-primary-600/25 transition-all hover:shadow-primary-600/35 hover:brightness-105"
              >
                {loading ? <LoadingSpinner size="sm" /> : 'Sign in'}
              </button>
            </form>

            {import.meta.env.DEV && (
              <p className="mt-6 text-center text-xs text-gray-400 dark:text-gray-500">
                Demo: admin@makhanaerp.com / admin123
              </p>
            )}
          </div>

          <div className="mt-5 space-y-1 text-center text-xs text-gray-400 dark:text-gray-600">
            <p>Makhana ERP v1.0.0</p>
            <p>
              Developed by{' '}
              <a
                href="https://bluepeakstudio.in/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-gray-500 underline-offset-2 transition-colors hover:text-primary-600 hover:underline dark:text-gray-400 dark:hover:text-primary-400"
              >
                BluePeak Studio
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

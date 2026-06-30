import { Search, ChevronLeft, ChevronRight, Download, Upload } from 'lucide-react';

export function FieldLabel({ children, required = false, className = 'block text-sm mb-1' }) {
  return (
    <label className={className}>
      {children}
      {required && <span className="text-red-500"> *</span>}
    </label>
  );
}

export function SearchBar({ value, onChange, placeholder = 'Search...' }) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input-field pl-10"
      />
    </div>
  );
}

export function Pagination({ page, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4">
      <span className="text-sm text-gray-500 dark:text-gray-400">
        Page {page} of {totalPages}
      </span>
      <div className="flex gap-2">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="btn-secondary p-2 disabled:opacity-50"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="btn-secondary p-2 disabled:opacity-50"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function DateRangeFilter({ startDate, endDate, onStartChange, onEndChange }) {
  return (
    <div className="flex flex-col sm:flex-row gap-2 flex-wrap w-full sm:w-auto">
      <input type="date" value={startDate} onChange={(e) => onStartChange(e.target.value)} className="input-field w-full sm:w-auto" />
      <input type="date" value={endDate} onChange={(e) => onEndChange(e.target.value)} className="input-field w-full sm:w-auto" />
    </div>
  );
}

export function EmptyState({ message = 'No data found' }) {
  return (
    <div className="text-center py-12 text-gray-500 dark:text-gray-400">
      {message}
    </div>
  );
}

export function StatCard({ title, value, subtitle, icon: Icon, color = 'primary' }) {
  const colors = {
    primary: 'bg-primary-50 dark:bg-primary-900/20 text-primary-600',
    blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600',
    amber: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600',
    red: 'bg-red-50 dark:bg-red-900/20 text-red-600',
  };

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
          <p className="text-xl sm:text-2xl font-bold mt-1 break-words">{value}</p>
          {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
        </div>
        {Icon && (
          <div className={`p-3 rounded-lg shrink-0 ${colors[color]}`}>
            <Icon className="h-6 w-6" />
          </div>
        )}
      </div>
    </div>
  );
}

export function Modal({ isOpen, onClose, title, children, wide = false }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 overflow-y-auto">
      <div className={`bg-white dark:bg-gray-800 rounded-t-xl sm:rounded-xl shadow-xl w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} max-h-[90vh] sm:max-h-[85vh] overflow-y-auto`}>
        <div className="flex items-center justify-between gap-3 p-4 border-b dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10">
          <h3 className="text-lg font-semibold min-w-0 truncate">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl shrink-0 leading-none">&times;</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export function ListPageToolbar({
  search = '',
  onSearchChange,
  searchPlaceholder = 'Search...',
  startDate = '',
  endDate = '',
  onStartChange,
  onEndChange,
  onExport,
  onImport,
  showSearch = true,
  showDate = true,
}) {
  return (
    <div className="flex flex-col lg:flex-row gap-4 mb-4">
      {showSearch && onSearchChange && (
        <div className="flex-1 min-w-0">
          <SearchBar value={search} onChange={onSearchChange} placeholder={searchPlaceholder} />
        </div>
      )}
      <div className="flex flex-wrap gap-2 items-center">
        {showDate && onStartChange && onEndChange && (
          <DateRangeFilter
            startDate={startDate}
            endDate={endDate}
            onStartChange={onStartChange}
            onEndChange={onEndChange}
          />
        )}
        {onImport && (
          <button type="button" onClick={onImport} className="btn-secondary flex items-center gap-2 whitespace-nowrap">
            <Upload className="h-4 w-4" /> Import Excel
          </button>
        )}
        {onExport && (
          <button type="button" onClick={onExport} className="btn-secondary flex items-center gap-2 whitespace-nowrap">
            <Download className="h-4 w-4" /> Export Excel
          </button>
        )}
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, action }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-bold break-words">{title}</h1>
        {subtitle && <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm sm:text-base">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0 w-full sm:w-auto [&_.btn-primary]:w-full [&_.btn-primary]:sm:w-auto [&_.btn-secondary]:w-full [&_.btn-secondary]:sm:w-auto">{action}</div>}
    </div>
  );
}

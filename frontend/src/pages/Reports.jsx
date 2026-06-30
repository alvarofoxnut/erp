import { useState, useEffect } from 'react';
import { Download, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import { PageHeader, DateRangeFilter } from '../components/common';
import TradingAccountReport from '../components/reports/TradingAccountReport';
import { formatCurrency, formatNumber, formatDate, getErrorMessage, STOCK_LABELS } from '../utils/helpers';

const REPORTS = [
  { id: 'stock', label: 'Stock Report', endpoint: '/reports/stock' },
  { id: 'loose-stock', label: 'Loose Stock Report', endpoint: '/reports/loose-stock' },
  { id: 'branded-stock', label: 'Branded Stock Report', endpoint: '/reports/branded-stock' },
  { id: 'production', label: 'Production Report', endpoint: '/reports/production' },
  { id: 'sales', label: 'Sales Report', endpoint: '/reports/sales' },
  { id: 'purchase', label: 'Purchase Report', endpoint: '/reports/purchase' },
  { id: 'vendors', label: 'Vendor Report', endpoint: '/reports/vendors' },
  { id: 'customers', label: 'Customer Report', endpoint: '/reports/customers' },
  { id: 'expenses', label: 'Expense Report', endpoint: '/reports/expenses' },
  { id: 'profit-loss', label: 'Profit/Loss Report', endpoint: '/reports/profit-loss' },
  { id: 'trading-account', label: 'Trading Account', endpoint: '/reports/trading-account' },
  { id: 'manufacturing-damages', label: 'Manufacturing Damage Report', endpoint: '/reports/manufacturing-damages' },
  { id: 'trading-damages', label: 'Trading Damage Report', endpoint: '/reports/trading-damages' },
];

const MFG_DAMAGE_FILTER_TYPES = [
  'raw_material',
  'quality_6no',
  'quality_5no',
  'quality_4_5no',
  'quality_4no',
  'quality_others',
  'finished_goods',
];

export default function Reports() {
  const [activeReport, setActiveReport] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [params, setParams] = useState({ startDate: '', endDate: '', financialYear: false });
  const [lotNumber, setLotNumber] = useState('');
  const [damageFilters, setDamageFilters] = useState({ inventoryType: '', itemId: '' });
  const [tradingItems, setTradingItems] = useState([]);

  useEffect(() => {
    api.get('/trading/items', { params: { limit: 100 } })
      .then(({ data: res }) => setTradingItems(res.data || []))
      .catch(() => setTradingItems([]));
  }, []);

  const fetchReport = async (report) => {
    setActiveReport(report);
    if (report.id === 'trading-account') {
      setData({});
      return;
    }
    setLoading(true);
    try {
      const queryParams = ['stock', 'loose-stock', 'branded-stock'].includes(report.id)
        ? {}
        : { startDate: params.startDate, endDate: params.endDate, financialYear: params.financialYear };
      if (report.id === 'manufacturing-damages' && damageFilters.inventoryType) {
        queryParams.inventoryType = damageFilters.inventoryType;
      }
      if (report.id === 'trading-damages' && damageFilters.itemId) {
        queryParams.itemId = damageFilters.itemId;
      }
      const { data: res } = await api.get(report.endpoint, { params: queryParams });
      setData(res.data);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const fetchLotReport = async () => {
    if (!lotNumber) return toast.error('Enter lot number');
    setLoading(true);
    try {
      const { data: res } = await api.get(`/reports/lot/${lotNumber}`);
      setActiveReport({ id: 'lot', label: `Lot Report: ${lotNumber}` });
      setData(res.data);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (reportType) => {
    try {
      const exportParams = {
        startDate: params.startDate,
        endDate: params.endDate,
        financialYear: params.financialYear,
      };
      if (reportType === 'manufacturing-damages' && damageFilters.inventoryType) {
        exportParams.inventoryType = damageFilters.inventoryType;
      }
      if (reportType === 'trading-damages' && damageFilters.itemId) {
        exportParams.itemId = damageFilters.itemId;
      }
      const response = await api.get(`/reports/export/${reportType}`, {
        params: exportParams,
        responseType: 'blob',
      });
      if (response.data.type?.includes('json')) {
        toast.error('Export failed');
        return;
      }
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${reportType}-report.xlsx`;
      link.click();
      window.URL.revokeObjectURL(url);
      toast.success('Report exported');
    } catch {
      toast.error('Export failed');
    }
  };

  const renderSummaryCards = (summary) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
      <div className="card p-3"><p className="text-xs text-gray-500">Transactions</p><p className="text-lg font-semibold">{summary?.count ?? 0}</p></div>
      <div className="card p-3"><p className="text-xs text-gray-500">Total Amount</p><p className="text-lg font-semibold">{formatCurrency(summary?.totalAmount ?? summary?.total ?? 0)}</p></div>
      <div className="card p-3"><p className="text-xs text-gray-500">Paid</p><p className="text-lg font-semibold text-green-600">{formatCurrency(summary?.totalPaid ?? 0)}</p></div>
      <div className="card p-3"><p className="text-xs text-gray-500">Due</p><p className="text-lg font-semibold text-red-600">{formatCurrency(summary?.totalDue ?? 0)}</p></div>
    </div>
  );

  const renderTransactionTable = (rows, nameLabel) => (
    <div className="table-container">
      <table className="data-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>{nameLabel}</th>
            <th>Contact</th>
            <th>Product</th>
            <th>Ref</th>
            <th>Qty</th>
            <th>Rate</th>
            <th>Amount</th>
            <th>Paid</th>
            <th>Due</th>
            <th>Payment</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td>{formatDate(row.date)}</td>
              <td>
                <div className="font-medium">{row.vendorName || row.customerName}</div>
                {(row.phone || row.gstNumber) && (
                  <div className="text-xs text-gray-500">
                    {[row.phone, row.gstNumber && `GST: ${row.gstNumber}`].filter(Boolean).join(' · ')}
                  </div>
                )}
              </td>
              <td className="text-sm">
                {[row.contactPerson, row.email, row.address].filter(Boolean).join(' · ') || '-'}
              </td>
              <td>{row.product || '-'}</td>
              <td>{row.reference || row.invoiceNumber || '-'}</td>
              <td>{formatNumber(row.quantity)}</td>
              <td>{formatCurrency(row.rate)}</td>
              <td>{formatCurrency(row.amount)}</td>
              <td className="text-green-600">{formatCurrency(row.paid)}</td>
              <td className="text-red-600">{formatCurrency(row.due)}</td>
              <td className="capitalize">{row.paymentMethod || '-'}</td>
              <td className="capitalize">{row.paymentStatus || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderSection = (section, title, nameLabel) => (
    <div className="mb-8">
      <h4 className="font-semibold mb-3">{title}</h4>
      {renderSummaryCards(section?.summary)}
      {!section?.rows?.length ? (
        <p className="text-sm text-gray-500">No data for this period.</p>
      ) : (
        renderTransactionTable(section.rows, nameLabel)
      )}
    </div>
  );

  const renderReportData = () => {
    if (!data) return null;

    if (activeReport?.id === 'vendors' && data.manufacturing?.rows) {
      return (
        <>
          {renderSection(data.manufacturing, 'Manufacturing Vendors (Raw Material)', 'Vendor')}
          {renderSection(data.trading, 'Trading Vendors', 'Vendor')}
        </>
      );
    }

    if (activeReport?.id === 'customers' && data.trading?.rows) {
      return (
        <>
          {renderSection(data.trading, 'Trading Customers', 'Customer')}
          {renderSection(data.manufacturing, 'Manufacturing Customers', 'Customer')}
        </>
      );
    }

    if (activeReport?.id === 'expenses' && data.manufacturing?.rows) {
      const renderExpenseSection = (section, title) => (
        <div className="mb-8">
          <h4 className="font-semibold mb-3">{title}</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <div className="card p-3"><p className="text-xs text-gray-500">Entries</p><p className="text-lg font-semibold">{section?.summary?.count ?? 0}</p></div>
            <div className="card p-3"><p className="text-xs text-gray-500">Total</p><p className="text-lg font-semibold text-red-600">{formatCurrency(section?.summary?.total ?? 0)}</p></div>
            {['direct', 'indirect', 'personal'].map((type) => (
              section?.summary?.byType?.[type] ? (
                <div key={type} className="card p-3">
                  <p className="text-xs text-gray-500 capitalize">{type}</p>
                  <p className="text-lg font-semibold">{formatCurrency(section.summary.byType[type])}</p>
                </div>
              ) : null
            ))}
          </div>
          {!section?.rows?.length ? (
            <p className="text-sm text-gray-500">No expenses for this period.</p>
          ) : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Category</th>
                    <th>Amount</th>
                    <th>Payment</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {section.rows.map((row, i) => (
                    <tr key={i}>
                      <td>{formatDate(row.date)}</td>
                      <td className="capitalize">{row.type}</td>
                      <td>{row.category}</td>
                      <td>{formatCurrency(row.amount)}</td>
                      <td className="capitalize">{row.paymentMode}</td>
                      <td>{row.description || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      );

      return (
        <>
          <div className="card p-4 mb-6 bg-primary-50 dark:bg-primary-900/20">
            <p className="text-sm text-gray-500">Grand Total (All Units)</p>
            <p className="text-2xl font-bold text-red-600">{formatCurrency(data.grandTotal ?? 0)}</p>
          </div>
          {renderExpenseSection(data.manufacturing, 'Manufacturing Expenses')}
          {renderExpenseSection(data.trading, 'Trading Expenses')}
        </>
      );
    }

    if (activeReport?.id === 'trading-account') {
      return (
        <TradingAccountReport
          embedded
          title="Trading Account"
          subtitle="Use filters above or the controls below"
        />
      );
    }

    if (activeReport?.id === 'profit-loss') {
      return (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="card p-4"><p className="text-sm text-gray-500">Revenue</p><p className="text-xl font-bold text-green-600">{formatCurrency(data.totalRevenue)}</p></div>
          <div className="card p-4"><p className="text-sm text-gray-500">Purchases</p><p className="text-xl font-bold">{formatCurrency(data.totalPurchases)}</p></div>
          <div className="card p-4"><p className="text-sm text-gray-500">Expenses</p><p className="text-xl font-bold text-red-600">{formatCurrency(data.totalExpenses)}</p></div>
          <div className="card p-4"><p className="text-sm text-gray-500">Damage Loss</p><p className="text-xl font-bold text-red-600">{formatCurrency(data.totalDamageLoss)}</p></div>
          <div className="card p-4"><p className="text-sm text-gray-500">Gross Profit</p><p className="text-xl font-bold">{formatCurrency(data.grossProfit)}</p></div>
          <div className="card p-4"><p className="text-sm text-gray-500">Net Profit</p><p className="text-xl font-bold text-primary-600">{formatCurrency(data.netProfit)}</p></div>
        </div>
      );
    }

    if (activeReport?.id === 'manufacturing-damages' || activeReport?.id === 'trading-damages') {
      const rows = data.rows || [];
      return (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <div className="card p-3"><p className="text-xs text-gray-500">Rows</p><p className="text-lg font-semibold">{data.summary?.count ?? 0}</p></div>
            <div className="card p-3"><p className="text-xs text-gray-500">Total Quantity</p><p className="text-lg font-semibold">{formatNumber(data.summary?.totalQuantity ?? 0)}</p></div>
            <div className="card p-3"><p className="text-xs text-gray-500">Total Loss</p><p className="text-lg font-semibold text-red-600">{formatCurrency(data.summary?.totalLoss ?? 0)}</p></div>
          </div>
          {!rows.length ? (
            <p className="text-sm text-gray-500">No damage records for this period.</p>
          ) : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Reference</th>
                    <th>Item</th>
                    <th>Qty Damaged</th>
                    <th>Loss Amount</th>
                    <th>Created By</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i}>
                      <td>{formatDate(row.date)}</td>
                      <td className="font-mono text-sm">{row.serialNumber}</td>
                      <td>{row.item}</td>
                      <td>{formatNumber(row.quantity)}</td>
                      <td>{formatCurrency(row.lossAmount)}</td>
                      <td>{row.createdBy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      );
    }

    if (activeReport?.id === 'stock') {
      return (
        <pre className="card overflow-auto text-sm">{JSON.stringify(data, null, 2)}</pre>
      );
    }

    if (activeReport?.id === 'loose-stock' && data.rows) {
      return (
        <>
          <p className="text-sm text-gray-500 mb-4">Total loose quality stock: <strong>{formatNumber(data.totalKg)} KG</strong></p>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr><th>Grade</th><th className="text-right">Balance (KG)</th></tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.category}>
                    <td>{STOCK_LABELS[row.category] || row.label}</td>
                    <td className="text-right">{formatNumber(row.balanceKg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      );
    }

    if (activeReport?.id === 'branded-stock' && data.rows) {
      return (
        <>
          <p className="text-sm text-gray-500 mb-4">Total branded packets: <strong>{formatNumber(data.totalPackets)}</strong></p>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Brand</th>
                  <th>Packet Size</th>
                  <th className="text-right">Available Packets</th>
                  <th className="text-right">Equivalent Weight (KG)</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr><td colSpan={4} className="text-center text-gray-500 py-4">No branded stock</td></tr>
                ) : data.rows.map((row) => (
                  <tr key={row.brandId}>
                    <td>{row.brandName}</td>
                    <td>{row.packetSizeGrams} gm</td>
                    <td className="text-right">{formatNumber(row.availablePackets)}</td>
                    <td className="text-right">{formatNumber(row.equivalentWeightKg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      );
    }

    if (Array.isArray(data)) {
      return (
        <div className="table-container">
          <table className="data-table">
            <thead><tr>{Object.keys(data[0] || {}).map((k) => <th key={k}>{k}</th>)}</tr></thead>
            <tbody>{data.map((row, i) => (
              <tr key={i}>{Object.values(row).map((v, j) => <td key={j}>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</td>)}</tr>
            ))}</tbody>
          </table>
        </div>
      );
    }

    return <pre className="card overflow-auto text-sm max-h-96">{JSON.stringify(data, null, 2)}</pre>;
  };

  return (
    <div>
      <PageHeader title="Reports" subtitle="Financial year and custom date range reports" />

      <div className="card mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <DateRangeFilter startDate={params.startDate} endDate={params.endDate}
            onStartChange={(v) => setParams({ ...params, startDate: v, financialYear: false })}
            onEndChange={(v) => setParams({ ...params, endDate: v, financialYear: false })} />
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={params.financialYear} onChange={(e) => setParams({ ...params, financialYear: e.target.checked })} />
            <span className="text-sm">Current Financial Year (Apr-Mar)</span>
          </label>
          <div className="flex gap-2">
            <input value={lotNumber} onChange={(e) => setLotNumber(e.target.value)} placeholder="Lot number" className="input-field w-40" />
            <button onClick={fetchLotReport} className="btn-secondary">Lot Report</button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {REPORTS.map((report) => (
          <button key={report.id} onClick={() => fetchReport(report)}
            className={`card p-4 text-left hover:border-primary-500 transition-colors ${activeReport?.id === report.id ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : ''}`}>
            <FileText className="h-5 w-5 text-primary-600 mb-2" />
            <p className="font-medium text-sm">{report.label}</p>
          </button>
        ))}
      </div>

      {activeReport && (
        <div className="card">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h3 className="font-semibold">{activeReport.label}</h3>
            <div className="flex flex-wrap items-center gap-2">
              {activeReport.id === 'manufacturing-damages' && (
                <select
                  className="input-field w-full sm:w-48 text-sm"
                  value={damageFilters.inventoryType}
                  onChange={(e) => setDamageFilters((f) => ({ ...f, inventoryType: e.target.value }))}
                >
                  <option value="">All inventory types</option>
                  {MFG_DAMAGE_FILTER_TYPES.map((t) => (
                    <option key={t} value={t}>{STOCK_LABELS[t] || t}</option>
                  ))}
                </select>
              )}
              {activeReport.id === 'trading-damages' && (
                <select
                  className="input-field w-full sm:w-48 text-sm"
                  value={damageFilters.itemId}
                  onChange={(e) => setDamageFilters((f) => ({ ...f, itemId: e.target.value }))}
                >
                  <option value="">All products</option>
                  {tradingItems.map((item) => (
                    <option key={item._id} value={item._id}>{item.name}</option>
                  ))}
                </select>
              )}
              {(activeReport.id === 'manufacturing-damages' || activeReport.id === 'trading-damages') && (
                <button onClick={() => fetchReport(activeReport)} className="btn-secondary text-sm">
                  Apply Filter
                </button>
              )}
              {activeReport.id !== 'lot' && activeReport.id !== 'trading-account' && (
                <button onClick={() => handleExport(activeReport.id)} className="btn-secondary flex items-center gap-2 text-sm">
                  <Download className="h-4 w-4" /> Export Excel
                </button>
              )}
            </div>
          </div>
          {loading ? <LoadingSpinner className="py-12" /> : renderReportData()}
        </div>
      )}
    </div>
  );
}

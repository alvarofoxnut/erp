import { useEffect, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import { Package, TrendingUp, DollarSign, AlertCircle, Factory, ShoppingBag, AlertTriangle } from 'lucide-react';
import api from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import { StatCard, PageHeader } from '../components/common';
import { formatCurrency, formatNumber, STOCK_LABELS } from '../utils/helpers';
import { STOCK_UPDATED_EVENT } from '../utils/stockEvents';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function Dashboard() {
  const location = useLocation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = useCallback(() => {
    setLoading(true);
    api.get('/dashboard', {
      params: { _: Date.now() },
      headers: { 'Cache-Control': 'no-cache' },
    })
      .then(({ data: res }) => setData(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard, location.key]);

  useEffect(() => {
    let timer;
    const onStockUpdated = () => {
      clearTimeout(timer);
      timer = setTimeout(fetchDashboard, 500);
    };

    window.addEventListener(STOCK_UPDATED_EVENT, onStockUpdated);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(STOCK_UPDATED_EVENT, onStockUpdated);
    };
  }, [fetchDashboard]);

  if (loading && !data) return <LoadingSpinner className="py-20" />;

  if (!data) return <div>Failed to load dashboard</div>;

  const monthlySalesData = {
    labels: (data.charts?.monthlySales || []).map((d) => MONTHS[d.month - 1]),
    datasets: [{
      label: 'Sales (₹)',
      data: (data.charts?.monthlySales || []).map((d) => d.total),
      backgroundColor: 'rgba(34, 197, 94, 0.7)',
      borderRadius: 6,
    }],
  };

  const productionData = {
    labels: (data.charts?.productionTrend || []).map((d) => `${MONTHS[d._id.month - 1]} ${d._id.year}`),
    datasets: [{
      label: 'Production Output (KG)',
      data: (data.charts?.productionTrend || []).map((d) => d.totalOutput),
      borderColor: 'rgb(34, 197, 94)',
      backgroundColor: 'rgba(34, 197, 94, 0.1)',
      tension: 0.3,
      fill: true,
    }],
  };

  const stockEntries = Object.entries(data.stock || {}).filter(
    ([k, v]) =>
      k !== 'trading'
      && k !== 'tradingStock'
      && k !== 'brandedStock'
      && k !== 'brandedGoodsTotalPackets'
      && k !== 'brandedGoodsEquivalentKg'
      && k !== 'branded_goods'
      && typeof v === 'number'
  );

  const tradingStock = data.stock?.tradingStock || [];
  const brandedStock = data.stock?.brandedStock || [];

  const StockCard = ({ title, quantity, unit = 'KG', subtitle, label = 'Available Stock', value, icon: Icon = Package }) => (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="h-4 w-4 text-primary-600 shrink-0" />
        <span className="text-sm font-medium truncate">{title}</span>
      </div>
      {subtitle && <p className="text-xs text-gray-400 mb-2">{subtitle}</p>}
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className="text-lg font-bold">{value ?? `${formatNumber(quantity)} ${unit}`}</p>
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Overview of your makhana business"
        action={
          <button onClick={fetchDashboard} className="btn-secondary text-sm" disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="Total Sales (FY)" value={formatCurrency(data.salesSummary?.total)} icon={TrendingUp} color="primary" />
        <StatCard title="Net Profit (FY)" value={formatCurrency(data.profitSummary?.netProfit)} icon={DollarSign} color="blue" />
        <StatCard title="Total Expenses (FY)" value={formatCurrency(data.profitSummary?.totalExpenses)} icon={AlertCircle} color="amber" />
        <StatCard title="Pending Payments" value={data.pendingPayments?.length || 0} subtitle="Unpaid invoices" icon={AlertCircle} color="red" />
      </div>

      <div className="mb-6 space-y-4">
        {stockEntries.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-3 flex items-center gap-2">
              <Factory className="h-4 w-4" /> Manufacturing Stock
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {stockEntries.map(([key, value]) => (
                <StockCard
                  key={key}
                  title={STOCK_LABELS[key] || key}
                  quantity={value}
                  unit="KG"
                />
              ))}
            </div>
          </div>
        )}

        {tradingStock.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-3 flex items-center gap-2">
              <ShoppingBag className="h-4 w-4" /> Trading Stock
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {tradingStock.map(({ item, balance }) => (
                <StockCard
                  key={item?._id || item?.id || item?.name}
                  title={item?.name || 'Trading Item'}
                  quantity={balance}
                  unit={item?.unit || 'KG'}
                  subtitle={item?.sku ? `SKU: ${item.sku}` : undefined}
                />
              ))}
            </div>
          </div>
        )}

        {brandedStock.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-3 flex items-center gap-2">
              <Package className="h-4 w-4" /> Branded Stock
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {brandedStock.map(({ brandId, brandName, availablePackets, equivalentWeightKg, packetSizeGrams }) => (
                <StockCard
                  key={brandId}
                  title={brandName}
                  value={`${formatNumber(availablePackets)} pkts (${formatNumber(equivalentWeightKg)} KG)`}
                  subtitle={packetSizeGrams ? `${packetSizeGrams} gm / packet` : undefined}
                  label="Available Stock"
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {data.damageSummary && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> Damage / Write-Off Summary
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <StockCard
              title="Mfg Damage Today"
              subtitle={`${data.damageSummary.manufacturingDamageTodayCount || 0} entries`}
              label="Damage Amount"
              value={formatCurrency(data.damageSummary.manufacturingDamageToday)}
              icon={Factory}
            />
            <StockCard
              title="Mfg Damage This Month"
              subtitle={`${data.damageSummary.manufacturingDamageMonthCount || 0} entries`}
              label="Damage Amount"
              value={formatCurrency(data.damageSummary.manufacturingDamageThisMonth)}
              icon={Factory}
            />
            <StockCard
              title="Trading Damage Today"
              subtitle={`${data.damageSummary.tradingDamageTodayCount || 0} entries`}
              label="Damage Amount"
              value={formatCurrency(data.damageSummary.tradingDamageToday)}
              icon={ShoppingBag}
            />
            <StockCard
              title="Trading Damage This Month"
              subtitle={`${data.damageSummary.tradingDamageMonthCount || 0} entries`}
              label="Damage Amount"
              value={formatCurrency(data.damageSummary.tradingDamageThisMonth)}
              icon={ShoppingBag}
            />
            <StockCard
              title="Total Damage Loss (FY)"
              label="Total Loss"
              value={formatCurrency(data.damageSummary.totalDamageLoss)}
              icon={AlertTriangle}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="card">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><ShoppingBag className="h-5 w-5" /> Monthly Sales</h3>
          <Bar data={monthlySalesData} options={{ responsive: true, plugins: { legend: { display: false } } }} />
        </div>
        <div className="card">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><Factory className="h-5 w-5" /> Production Trend</h3>
          <Line data={productionData} options={{ responsive: true, plugins: { legend: { display: false } } }} />
        </div>
      </div>

      {data.pendingPayments?.length > 0 && (
        <div className="card">
          <h3 className="font-semibold mb-4">Pending Payments</h3>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Party</th>
                  <th>Amount</th>
                  <th>Due</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.pendingPayments.map((inv) => (
                  <tr key={inv._id}>
                    <td>{inv.invoiceNumber}</td>
                    <td>{inv.partyName}</td>
                    <td>{formatCurrency(inv.amount)}</td>
                    <td>{formatCurrency(inv.dueAmount)}</td>
                    <td><span className="px-2 py-1 text-xs rounded-full bg-amber-100 text-amber-800 capitalize">{inv.paymentStatus}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

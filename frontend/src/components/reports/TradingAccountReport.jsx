import { useState } from 'react';
import { Download, FileText, Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import LoadingSpinner from '../LoadingSpinner';
import { PageHeader, DateRangeFilter } from '../common';
import ManufacturingAccountTables from './ManufacturingAccountTables';
import { formatCurrency, formatDate, formatNumber, getErrorMessage } from '../../utils/helpers';

const REPORT_TYPES = [
  { value: 'manufacturing', label: 'Manufacturing' },
  { value: 'trading', label: 'Trading' },
  { value: 'combined', label: 'Combined' },
];

function QtyValueRow({ label, quantity, value, bold = false }) {
  const qtyCell =
    quantity === '' || quantity === null || quantity === undefined
      ? '—'
      : `${formatNumber(quantity)} KG`;
  return (
    <tr className={bold ? 'font-semibold border-t' : ''}>
      <td className="break-words">{label}</td>
      <td className="text-right whitespace-nowrap">{qtyCell}</td>
      <td className="text-right whitespace-nowrap">{formatCurrency(value)}</td>
    </tr>
  );
}

function StockLines({ lines, title }) {
  if (!lines?.length) return null;
  return (
    <>
      <tr>
        <td colSpan={3} className="text-xs text-gray-500 pt-2">{title}</td>
      </tr>
      {lines.map((line) => (
        <tr key={line.key || line.label} className="text-sm">
          <td className="pl-4 break-words">{line.label}</td>
          <td className="text-right whitespace-nowrap">{formatNumber(line.quantity)} KG</td>
          <td className="text-right whitespace-nowrap">{formatCurrency(line.value)}</td>
        </tr>
      ))}
    </>
  );
}

function ExpenseRows({ items }) {
  if (!items?.length) {
    return (
      <tr>
        <td colSpan={2} className="text-sm text-gray-500">No expenses in this period</td>
      </tr>
    );
  }
  return items.map((item) => (
    <tr key={item.label}>
      <td className="pl-4">{item.label}</td>
      <td className="text-right text-red-600">{formatCurrency(item.amount)}</td>
    </tr>
  ));
}

function TradingAccountTables({ section }) {
  if (!section) return null;

  return (
    <div id="trading-account-print" className="space-y-6">
      <div className="card border-l-4 border-l-primary-500">
        <h3 className="font-semibold text-lg">{section.unitLabel}</h3>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h4 className="font-semibold mb-4 text-primary-700 dark:text-primary-400">
            {section.purchaseSide.heading}
          </h4>
          <div className="table-container lg:overflow-x-visible">
            <table className="data-table table-fixed">
              <thead>
                <tr>
                  <th className="w-[45%]">Particulars</th>
                  <th className="text-right w-[27%]">Quantity</th>
                  <th className="text-right w-[28%]">Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-gray-50 dark:bg-gray-800/50">
                  <td colSpan={3} className="font-medium">1. Opening Stock</td>
                </tr>
                <StockLines
                  lines={section.purchaseSide.openingStock.lines}
                  title="Stock breakdown"
                />
                <QtyValueRow
                  label="Opening Stock (Total)"
                  quantity={section.purchaseSide.openingStock.quantity}
                  value={section.purchaseSide.openingStock.value}
                />
                <tr className="bg-gray-50 dark:bg-gray-800/50">
                  <td colSpan={3} className="font-medium">2. Purchases</td>
                </tr>
                <QtyValueRow
                  label="Purchases"
                  quantity={section.purchaseSide.purchases.quantity}
                  value={section.purchaseSide.purchases.value}
                />
                <tr className="bg-gray-50 dark:bg-gray-800/50">
                  <td colSpan={3} className="font-medium">3. Direct Expenses</td>
                </tr>
                {section.purchaseSide.directExpenses.items.map((item) => (
                  <tr key={item.label}>
                    <td className="pl-4 break-words">{item.label}</td>
                    <td className="text-right whitespace-nowrap">—</td>
                    <td className="text-right whitespace-nowrap">{formatCurrency(item.amount)}</td>
                  </tr>
                ))}
                <QtyValueRow
                  label="Total Direct Expenses"
                  quantity=""
                  value={section.purchaseSide.directExpenses.total}
                />
                <QtyValueRow
                  label="Total Cost"
                  quantity=""
                  value={section.purchaseSide.totalCost}
                  bold
                />
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h4 className="font-semibold mb-4 text-primary-700 dark:text-primary-400">
            {section.saleSide.heading}
          </h4>
          <div className="table-container lg:overflow-x-visible">
            <table className="data-table table-fixed">
              <thead>
                <tr>
                  <th className="w-[45%]">Particulars</th>
                  <th className="text-right w-[27%]">Quantity</th>
                  <th className="text-right w-[28%]">Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-gray-50 dark:bg-gray-800/50">
                  <td colSpan={3} className="font-medium">1. Sales</td>
                </tr>
                <QtyValueRow
                  label="Sales"
                  quantity={section.saleSide.sales.quantity}
                  value={section.saleSide.sales.value}
                />
                <tr className="bg-gray-50 dark:bg-gray-800/50">
                  <td colSpan={3} className="font-medium">2. Damages</td>
                </tr>
                <QtyValueRow
                  label="Damages"
                  quantity={section.saleSide.damages?.quantity ?? 0}
                  value={section.saleSide.damages?.value ?? 0}
                />
                <tr className="bg-gray-50 dark:bg-gray-800/50">
                  <td colSpan={3} className="font-medium">3. Closing Stock</td>
                </tr>
                <StockLines
                  lines={section.saleSide.closingStock.lines}
                  title="Remaining stock"
                />
                <QtyValueRow
                  label="Closing Stock (Total)"
                  quantity={section.saleSide.closingStock.quantity}
                  value={section.saleSide.closingStock.value}
                />
                <QtyValueRow
                  label="Total Revenue"
                  quantity=""
                  value={section.saleSide.totalRevenue}
                  bold
                />
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className={`card text-center ${section.gross.isLoss ? 'bg-red-50 dark:bg-red-900/20' : 'bg-green-50 dark:bg-green-900/20'}`}>
        <p className="text-sm text-gray-500">{section.gross.label}</p>
        <p className={`text-2xl font-bold ${section.gross.isLoss ? 'text-red-600' : 'text-green-600'}`}>
          {formatCurrency(section.gross.amount)}
        </p>
      </div>

      <div className="card">
        <h4 className="font-semibold mb-4">Profit &amp; Loss</h4>
        <table className="data-table max-w-xl">
          <tbody>
            <tr>
              <td>Gross Profit</td>
              <td className="text-right font-medium">{formatCurrency(section.profitAndLoss.grossProfit)}</td>
            </tr>
            <tr>
              <td colSpan={2} className="text-sm text-gray-500">Less: Indirect Expenses</td>
            </tr>
            <ExpenseRows items={section.profitAndLoss.indirectExpenses.items} />
            <tr className="font-semibold border-t">
              <td>{section.profitAndLoss.net.label}</td>
              <td className={`text-right ${section.profitAndLoss.net.isLoss ? 'text-red-600' : 'text-primary-600'}`}>
                {formatCurrency(section.profitAndLoss.net.amount)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <h4 className="font-semibold mb-4">Final Profit</h4>
        <table className="data-table max-w-xl">
          <tbody>
            <tr>
              <td>Net Profit</td>
              <td className="text-right">{formatCurrency(section.final.netProfit)}</td>
            </tr>
            <tr>
              <td colSpan={2} className="text-sm text-gray-500">Less: Personal Expenses</td>
            </tr>
            <ExpenseRows items={section.final.personalExpenses.items} />
            <tr className="font-semibold border-t">
              <td>{section.final.final.label}</td>
              <td className={`text-right ${section.final.final.isLoss ? 'text-red-600' : 'text-primary-600'}`}>
                {formatCurrency(section.final.final.amount)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReportSection({ section }) {
  if (!section) return null;
  if (section.reportFormat === 'account-report' || section.debitSide) {
    return <ManufacturingAccountTables section={section} />;
  }
  return <TradingAccountTables section={section} />;
}

export default function TradingAccountReport({
  title = 'Trading Account',
  subtitle = 'Purchase vs sale account with gross, net, and final profit',
  embedded = false,
  defaultReportType = 'combined',
}) {
  const [reportType, setReportType] = useState(defaultReportType);
  const [params, setParams] = useState({ startDate: '', endDate: '', financialYear: false });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const { data: res } = await api.get('/reports/trading-account', {
        params: {
          reportType,
          startDate: params.startDate,
          endDate: params.endDate,
          financialYear: params.financialYear,
        },
      });
      setData(res.data);
    } catch (err) {
      toast.error(getErrorMessage(err));
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const downloadExport = async (format) => {
    try {
      const response = await api.get('/reports/trading-account/export', {
        params: {
          reportType,
          startDate: params.startDate,
          endDate: params.endDate,
          financialYear: params.financialYear,
          format,
        },
        responseType: 'blob',
      });
      if (response.data.type?.includes('json')) {
        toast.error('Export failed');
        return;
      }
      const ext = format === 'pdf' ? 'pdf' : 'xlsx';
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `trading-account-${reportType}.${ext}`;
      link.click();
      window.URL.revokeObjectURL(url);
      toast.success(`Report exported as ${ext.toUpperCase()}`);
    } catch {
      toast.error('Export failed');
    }
  };

  const handlePrint = () => {
    if (!data) {
      toast.error('Generate the report first');
      return;
    }
    const content = document.getElementById('trading-account-print');
    if (!content) return;
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html><head><title>${title}</title>
      <style>
        body { font-family: system-ui, sans-serif; padding: 24px; color: #111; }
        h1,h2,h3 { margin: 0 0 8px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 12px; }
        th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
        th { background: #f3f4f6; }
        .text-right { text-align: right; }
        .summary { margin: 16px 0; padding: 12px; background: #f0fdf4; border: 1px solid #86efac; }
        .loss { background: #fef2f2; border-color: #fca5a5; }
        tr.account-accordion-detail { display: table-row !important; }
      </style></head><body>
      <h1>${title}</h1>
      <p>${data.section?.unitLabel} · ${formatDate(data.startDate)} — ${formatDate(data.endDate)}</p>
      ${content.innerHTML}
      </body></html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const filterCard = (
    <div className="card mb-6 space-y-4">
      <div>
        <p className="text-sm font-medium mb-2">Report type</p>
        <div className="flex flex-wrap gap-4">
          {REPORT_TYPES.map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="reportType"
                value={opt.value}
                checked={reportType === opt.value}
                onChange={() => setReportType(opt.value)}
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-4 items-end">
        <DateRangeFilter
          startDate={params.startDate}
          endDate={params.endDate}
          onStartChange={(v) => setParams({ ...params, startDate: v, financialYear: false })}
          onEndChange={(v) => setParams({ ...params, endDate: v, financialYear: false })}
        />
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={params.financialYear}
            onChange={(e) => setParams({ ...params, financialYear: e.target.checked })}
          />
          <span className="text-sm">Current Financial Year (Apr–Mar)</span>
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={fetchReport} className="btn-primary w-full sm:w-auto">
          Generate Report
        </button>
        <button
          type="button"
          onClick={() => downloadExport('excel')}
          disabled={!data}
          className="btn-secondary flex items-center justify-center gap-2 disabled:opacity-50 w-full sm:w-auto"
        >
          <Download className="h-4 w-4" /> Excel
        </button>
        <button
          type="button"
          onClick={() => downloadExport('pdf')}
          disabled={!data}
          className="btn-secondary flex items-center justify-center gap-2 disabled:opacity-50 w-full sm:w-auto"
        >
          <FileText className="h-4 w-4" /> PDF
        </button>
        <button
          type="button"
          onClick={handlePrint}
          disabled={!data}
          className="btn-secondary flex items-center justify-center gap-2 disabled:opacity-50 w-full sm:w-auto"
        >
          <Printer className="h-4 w-4" /> Print
        </button>
      </div>
    </div>
  );

  const results = (
    <div>
      {loading ? (
        <LoadingSpinner className="py-12" />
      ) : data ? (
        <div className="space-y-6">
          <div className="card space-y-2">
            <div>
              <p className="text-sm text-gray-500">Report period</p>
              <p className="font-medium">
                {formatDate(data.startDate)} — {formatDate(data.endDate)}
              </p>
            </div>
            {data.stockDates && (
              <div className="text-sm text-gray-500 border-t pt-2 space-y-1">
                <p>
                  Opening stock as of end of{' '}
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    {formatDate(data.stockDates.openingAsOf)}
                  </span>
                  {' '}(day before period start)
                </p>
                <p>
                  Closing stock as of end of{' '}
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    {formatDate(data.stockDates.closingAsOf)}
                  </span>
                </p>
              </div>
            )}
          </div>
          <ReportSection section={data.section} />
          {data.reportType === 'combined' && data.manufacturing && data.trading && (
            <div className="pt-8 border-t space-y-8">
              <h3 className="font-semibold text-lg text-gray-600">Manufacturing (detail)</h3>
              <ReportSection section={data.manufacturing} />
              <h3 className="font-semibold text-lg text-gray-600">Trading (detail)</h3>
              <ReportSection section={data.trading} />
            </div>
          )}
        </div>
      ) : (
        <p className="text-center text-gray-500 py-8">
          Select report type and dates, then click Generate Report.
        </p>
      )}
    </div>
  );

  if (embedded) {
    return (
      <div>
        {filterCard}
        {results}
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} />
      {filterCard}
      {results}
    </div>
  );
}

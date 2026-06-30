import TradingAccountReport from '../components/reports/TradingAccountReport';

export default function BalanceSheet() {
  return (
    <TradingAccountReport
      title="Manufacturing Account / P&L"
      subtitle="Category-wise stock, purchases, damages, COGS, and profit for the manufacturing business"
      defaultReportType="manufacturing"
    />
  );
}

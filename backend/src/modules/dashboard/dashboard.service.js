import inventoryService from '../inventory/inventory.service.js';
import accountingModuleService from '../accounting/accountingModule.service.js';
import reportsService from '../reports/reports.service.js';
import damagesService from '../damages/damages.service.js';
import { getFinancialYear } from '../../shared/utils/helpers.js';
import { softDeleteOrphanInvoices } from '../../shared/utils/softDelete.js';
import { prisma } from '../../config/db.js';

class DashboardService {
  async getDashboardData() {
    const fy = getFinancialYear();

    // Numbers already ignore orphans (activeInvoiceWhere / isDeleted filters).
    // Persist cleanup in the background — do not block TTFB.
    void softDeleteOrphanInvoices(prisma).catch(() => {});

    const [stock, pendingPayments, damageMetrics, profitLoss] = await Promise.all([
      inventoryService.getStockSummaryWithTrading(),
      accountingModuleService.getPendingPayments(),
      damagesService.getDamageDashboardMetrics(),
      reportsService.getProfitLossAggregates(fy.start, fy.end, { totalDamageLoss: 0 }),
    ]);

    const totalDamageLoss = damageMetrics.totalDamageLoss || 0;
    const netProfit =
      profitLoss.grossProfit - profitLoss.totalExpenses - totalDamageLoss;

    return {
      stock,
      salesSummary: {
        tradingSales: profitLoss.salesBreakdown.tradingSales,
        manufacturingSales: profitLoss.salesBreakdown.manufacturingSales,
        invoiceSales: profitLoss.salesBreakdown.invoiceSales,
        total: profitLoss.totalRevenue,
      },
      profitSummary: {
        grossProfit: profitLoss.grossProfit,
        netProfit,
        totalRevenue: profitLoss.totalRevenue,
        totalExpenses: profitLoss.totalExpenses,
        totalDamageLoss,
      },
      damageSummary: damageMetrics,
      pendingPayments,
    };
  }
}

export default new DashboardService();

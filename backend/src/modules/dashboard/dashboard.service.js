import { prisma } from '../../config/db.js';
import inventoryService from '../inventory/inventory.service.js';
import inventoryRepository from '../inventory/inventory.repository.js';
import manufacturingService from '../manufacturing/manufacturing.service.js';
import accountingModuleService from '../accounting/accountingModule.service.js';
import reportsService from '../reports/reports.service.js';
import damagesService from '../damages/damages.service.js';
import { getFinancialYear } from '../../shared/utils/helpers.js';
import { softDeleteOrphanInvoices } from '../../shared/utils/softDelete.js';

class DashboardService {
  async getTradingStockSummary() {
    return inventoryRepository.getTradingStockWithBalances();
  }

  async getDashboardData() {
    const fy = getFinancialYear();

    // Soft-delete invoices whose linked sale/purchase was already deleted
    await softDeleteOrphanInvoices(prisma);

    // Independent blocks in parallel — one warehouse trip, not a single-file line.
    // P&L uses totalDamageLoss: 0 here; net profit is corrected with damageMetrics below
    // so we do not wait on (or re-query) FY damage.
    const [
      stockSummary,
      tradingStock,
      pendingPayments,
      damageMetrics,
      monthlySales,
      productionTrend,
      profitLoss,
    ] = await Promise.all([
      inventoryService.getStockSummary(),
      this.getTradingStockSummary(),
      accountingModuleService.getPendingPayments(),
      damagesService.getDamageDashboardMetrics(),
      this.getMonthlySales(fy.start, fy.end),
      manufacturingService.getProductionTrend(fy.start, fy.end),
      reportsService.getProfitLossAggregates(fy.start, fy.end, { totalDamageLoss: 0 }),
    ]);

    const totalDamageLoss = damageMetrics.totalDamageLoss || 0;
    const netProfit =
      profitLoss.grossProfit - profitLoss.totalExpenses - totalDamageLoss;

    return {
      stock: { ...stockSummary, tradingStock },
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
      charts: {
        monthlySales,
        productionTrend,
      },
    };
  }

  async getMonthlySales(startDate, endDate) {
    const [trading, manufacturing, invoices] = await Promise.all([
      prisma.$queryRaw`
        SELECT
          EXTRACT(MONTH FROM date)::int AS month,
          EXTRACT(YEAR FROM date)::int AS year,
          COALESCE(SUM(amount), 0)::float AS total
        FROM "Sale"
        WHERE date >= ${startDate} AND date <= ${endDate}
          AND "isDeleted" = false
        GROUP BY year, month
        ORDER BY year, month
      `,
      prisma.$queryRaw`
        SELECT
          EXTRACT(MONTH FROM date)::int AS month,
          EXTRACT(YEAR FROM date)::int AS year,
          COALESCE(SUM(amount), 0)::float AS total
        FROM "ManufacturingSale"
        WHERE date >= ${startDate} AND date <= ${endDate}
          AND "isDeleted" = false
        GROUP BY year, month
        ORDER BY year, month
      `,
      prisma.$queryRaw`
        SELECT
          EXTRACT(MONTH FROM date)::int AS month,
          EXTRACT(YEAR FROM date)::int AS year,
          COALESCE(SUM(amount), 0)::float AS total
        FROM "Invoice"
        WHERE date >= ${startDate} AND date <= ${endDate}
          AND "isDeleted" = false
        GROUP BY year, month
        ORDER BY year, month
      `,
    ]);

    const merged = {};
    for (const group of [trading, manufacturing, invoices]) {
      for (const item of group) {
        const key = `${item.year}-${item.month}`;
        merged[key] = (merged[key] || 0) + Number(item.total);
      }
    }

    return Object.entries(merged).map(([key, total]) => {
      const [year, month] = key.split('-');
      return { year: parseInt(year, 10), month: parseInt(month, 10), total };
    });
  }
}

export default new DashboardService();

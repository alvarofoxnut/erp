import { prisma } from '../../config/db.js';
import inventoryService from '../inventory/inventory.service.js';
import inventoryRepository from '../inventory/inventory.repository.js';
import manufacturingService from '../manufacturing/manufacturing.service.js';
import accountingModuleService from '../accounting/accountingModule.service.js';
import reportsService from '../reports/reports.service.js';
import damagesService from '../damages/damages.service.js';
import { getFinancialYear } from '../../shared/utils/helpers.js';
import { STOCK_CATEGORIES } from '../../shared/constants/index.js';

class DashboardService {
  async getTradingStockSummary() {
    const items = await prisma.item.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
    const tradingStock = [];
    for (const item of items) {
      const balance = await inventoryRepository.getCurrentBalance(STOCK_CATEGORIES.TRADING, { item: item.id });
      tradingStock.push({ item, balance });
    }
    return tradingStock;
  }

  async getDashboardData() {
    const fy = getFinancialYear();
    const stockSummary = await inventoryService.getStockSummary();
    const tradingStock = await this.getTradingStockSummary();
    const expenseSummary = await accountingModuleService.getExpenseSummary(fy.start, fy.end);
    const pendingPayments = await accountingModuleService.getPendingPayments();
    const profitLoss = await reportsService.getProfitLossReport(fy.start, fy.end);
    const damageMetrics = await damagesService.getDamageDashboardMetrics();

    const monthlySales = await this.getMonthlySales(fy.start, fy.end);
    const productionTrend = await manufacturingService.getProductionTrend(fy.start, fy.end);
    const inventoryTrend = await inventoryService.getInventoryTrend(fy.start, fy.end);

    const [salesTotal, manufacturingSalesTotal, invoiceTotal] = await Promise.all([
      prisma.sale.aggregate({
        where: { date: { gte: fy.start, lte: fy.end } },
        _sum: { amount: true },
      }),
      prisma.manufacturingSale.aggregate({
        where: { date: { gte: fy.start, lte: fy.end } },
        _sum: { amount: true },
      }),
      prisma.invoice.aggregate({
        where: { date: { gte: fy.start, lte: fy.end } },
        _sum: { amount: true },
      }),
    ]);

    return {
      stock: { ...stockSummary, tradingStock },
      salesSummary: {
        tradingSales: salesTotal._sum.amount || 0,
        manufacturingSales: manufacturingSalesTotal._sum.amount || 0,
        invoiceSales: invoiceTotal._sum.amount || 0,
        total: profitLoss.totalRevenue,
      },
      expenseSummary,
      profitSummary: {
        grossProfit: profitLoss.grossProfit,
        netProfit: profitLoss.netProfit,
        totalRevenue: profitLoss.totalRevenue,
        totalExpenses: profitLoss.totalExpenses,
        totalDamageLoss: profitLoss.totalDamageLoss,
      },
      damageSummary: damageMetrics,
      pendingPayments,
      charts: {
        monthlySales,
        productionTrend,
        inventoryTrend,
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

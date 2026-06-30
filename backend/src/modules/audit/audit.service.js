import { prisma } from '../../config/db.js';
import { buildPagination, buildPaginationMeta, getFinancialYear, getDateRange } from '../../shared/utils/helpers.js';
import { getDisplayDescription } from '../../shared/utils/auditDescription.js';
import ExcelJS from 'exceljs';
import { AUDIT_MODULES, AUTH_SESSION_AUDIT_ACTIONS } from '../../shared/constants/audit.js';

const auditInclude = {
  user: { select: { id: true, name: true, email: true, role: true } },
};

class AuditModuleService {
  buildAuditWhere({
    search,
    userId,
    module,
    action,
    recordType,
    startDate,
    endDate,
    financialYear,
    priority,
  }) {
    const where = {};

    if (userId) where.userId = userId;
    if (module) where.module = module;
    if (action) {
      if (AUTH_SESSION_AUDIT_ACTIONS.includes(action)) {
        where.id = '__excluded_auth_session__';
      } else {
        where.action = action;
      }
    } else {
      where.action = { notIn: AUTH_SESSION_AUDIT_ACTIONS };
    }
    if (recordType) where.recordType = { contains: recordType, mode: 'insensitive' };
    if (priority) where.priority = priority;
    if (financialYear) where.financialYear = financialYear;

    if (startDate || endDate) {
      const { start, end } = getDateRange(startDate, endDate);
      where.createdAt = { gte: start, lte: end };
    } else if (financialYear) {
      const [startYear] = financialYear.split('-');
      const fyStart = parseInt(startYear, 10);
      const fy = getFinancialYear(new Date(fyStart, 3, 15));
      where.createdAt = { gte: fy.start, lte: fy.end };
    }

    if (search) {
      where.OR = [
        { description: { contains: search, mode: 'insensitive' } },
        { resourceId: { contains: search, mode: 'insensitive' } },
        { recordType: { contains: search, mode: 'insensitive' } },
        { user: { name: { contains: search, mode: 'insensitive' } } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
      ];
    }

    return where;
  }

  async getAuditLogs(params) {
    const { page, limit, skip } = buildPagination(params.page, params.limit);
    const where = this.buildAuditWhere(params);

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: auditInclude,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    const formattedLogs = logs.map((log) => ({
      ...log,
      description: getDisplayDescription(log),
    }));

    return { logs: formattedLogs, pagination: buildPaginationMeta(total, page, limit) };
  }

  async getAuditLogById(id) {
    return prisma.auditLog.findUnique({
      where: { id },
      include: auditInclude,
    });
  }

  async getDashboardStats() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const authSessionFilter = { action: { notIn: AUTH_SESSION_AUDIT_ACTIONS } };
    const todayFilter = { createdAt: { gte: todayStart, lte: todayEnd }, ...authSessionFilter };

    const [
      totalActionsToday,
      totalUpdatesToday,
      totalDeletesToday,
      recentActivity,
    ] = await Promise.all([
      prisma.auditLog.count({ where: todayFilter }),
      prisma.auditLog.count({ where: { ...todayFilter, action: 'update' } }),
      prisma.auditLog.count({ where: { ...todayFilter, action: 'delete' } }),
      prisma.auditLog.findMany({
        where: todayFilter,
        include: auditInclude,
        orderBy: { createdAt: 'desc' },
        take: 15,
      }),
    ]);

    return {
      totalActionsToday,
      totalUpdatesToday,
      totalDeletesToday,
      recentActivity,
    };
  }

  getFilterOptions() {
    return {
      modules: Object.values(AUDIT_MODULES).filter((m) => m !== AUDIT_MODULES.AUTHENTICATION),
      actions: [
        'create', 'update', 'delete', 'restore',
        'approve', 'reject', 'export', 'import', 'permission_change', 'password_reset',
        'status_change', 'stock_adjustment',
      ],
    };
  }

  async exportAuditLogs(params) {
    const where = this.buildAuditWhere(params);
    const logs = await prisma.auditLog.findMany({
      where,
      include: auditInclude,
      orderBy: { createdAt: 'desc' },
      take: 10000,
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Audit Logs');
    sheet.columns = [
      { header: 'Date & Time', key: 'createdAt', width: 22 },
      { header: 'User', key: 'user', width: 20 },
      { header: 'Module', key: 'module', width: 18 },
      { header: 'Action', key: 'action', width: 16 },
      { header: 'Record Type', key: 'recordType', width: 18 },
      { header: 'Record ID', key: 'resourceId', width: 22 },
      { header: 'Description', key: 'description', width: 40 },
      { header: 'Priority', key: 'priority', width: 10 },
    ];

    for (const log of logs) {
      sheet.addRow({
        createdAt: log.createdAt.toISOString(),
        user: log.user?.name || 'System',
        module: log.module,
        action: log.action,
        recordType: log.recordType || '',
        resourceId: log.resourceId || '',
        description: getDisplayDescription(log),
        priority: log.priority,
      });
    }

    return workbook.xlsx.writeBuffer();
  }
}

export default new AuditModuleService();

import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import connectDB, { prisma, disconnectDB } from '../config/db.js';
import { BUSINESS_UNITS } from '../shared/constants/index.js';
import { businessUnitFromReferenceType } from '../modules/accounting/businessUnit.js';
import { resolvePermissionsForRole } from '../shared/utils/permissionResolver.js';
import logger from '../shared/utils/logger.js';

dotenv.config();

const ledgerTemplates = [
  { name: 'Cash Account', type: 'cash' },
  { name: 'Bank Account', type: 'bank' },
  { name: 'Sales', type: 'sales' },
  { name: 'Purchases', type: 'purchases' },
  { name: 'Expenses', type: 'expenses' },
];

const seed = async () => {
  try {
    await connectDB();

    const adminExists = await prisma.user.findUnique({
      where: { email: 'admin@makhanaerp.com' },
    });

    if (!adminExists) {
      const permissions = await resolvePermissionsForRole('admin');
      const password = await bcrypt.hash('admin123', 12);
      await prisma.user.create({
        data: {
          name: 'Admin User',
          email: 'admin@makhanaerp.com',
          password,
          role: 'admin',
          permissions,
        },
      });
      logger.info('Admin user created: admin@makhanaerp.com / admin123');
    }

    for (const unit of Object.values(BUSINESS_UNITS)) {
      for (const ledger of ledgerTemplates) {
        const exists = await prisma.ledger.findFirst({
          where: { name: ledger.name, type: ledger.type, businessUnit: unit },
        });
        if (!exists) {
          await prisma.ledger.create({
            data: { ...ledger, businessUnit: unit, currentBalance: 0 },
          });
          logger.info(`Ledger created: ${ledger.name} (${unit})`);
        }
      }
    }

    const entries = await prisma.ledgerEntry.findMany({
      where: { businessUnit: null },
    });

    let backfilled = 0;
    for (const entry of entries) {
      const unit = businessUnitFromReferenceType(entry.referenceType);
      if (unit) {
        await prisma.ledgerEntry.update({
          where: { id: entry.id },
          data: { businessUnit: unit },
        });
        backfilled += 1;
      }
    }

    if (backfilled) {
      logger.info(`Backfilled businessUnit on ${backfilled} ledger entries`);
    }

    logger.info('Seed completed successfully');
    await disconnectDB();
    process.exit(0);
  } catch (error) {
    logger.error(`Seed failed: ${error.message}`);
    await disconnectDB().catch(() => {});
    process.exit(1);
  }
};

seed();

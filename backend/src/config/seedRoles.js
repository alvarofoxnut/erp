import { prisma } from './db.js';
import { DEFAULT_ROLES } from '../shared/constants/index.js';
import { resolvePermissionsForRole } from '../shared/utils/permissionResolver.js';
import logger from '../shared/utils/logger.js';

export async function seedDefaultRoles() {
  for (const roleData of DEFAULT_ROLES) {
    await prisma.role.upsert({
      where: { slug: roleData.slug },
      update: roleData,
      create: roleData,
    });
  }

  for (const roleData of DEFAULT_ROLES) {
    const permissions = await resolvePermissionsForRole(roleData.slug);
    await prisma.user.updateMany({
      where: { role: roleData.slug },
      data: { permissions },
    });
  }

  logger.info('Default roles synced');
}

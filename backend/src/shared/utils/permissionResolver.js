import { prisma } from '../../config/db.js';
import { ALL_PERMISSIONS, ROLES } from '../constants/index.js';

export async function resolvePermissionsForRole(slug) {
  if (slug === ROLES.ADMIN) return ALL_PERMISSIONS;
  const role = await prisma.role.findFirst({ where: { slug, isActive: true } });
  return role?.permissions || [];
}

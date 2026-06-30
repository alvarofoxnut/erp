import { prisma } from '../../config/db.js';
import AppError from '../../shared/utils/AppError.js';
import { ALL_PERMISSIONS, ROLES } from '../../shared/constants/index.js';
import { buildSearchFilter } from '../../shared/utils/query.js';
import { resolvePermissionsForRole } from '../../shared/utils/permissionResolver.js';

class RoleService {
  async getAll({ search, page = 1, limit = 50 }) {
    const where = {
      isActive: true,
      ...buildSearchFilter(search, ['name', 'slug', 'description']),
    };

    const skip = (page - 1) * limit;
    const [roles, total] = await Promise.all([
      prisma.role.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
      prisma.role.count({ where }),
    ]);
    return { roles, total };
  }

  async getBySlug(slug) {
    const role = await prisma.role.findFirst({ where: { slug, isActive: true } });
    if (!role) throw new AppError('Role not found', 404);
    return role;
  }

  async getPermissionCatalog() {
    const { PERMISSION_GROUPS } = await import('../../shared/constants/permissions.js');
    return PERMISSION_GROUPS;
  }

  async create(data, userId) {
    const slug = data.slug || data.name.toLowerCase().replace(/\s+/g, '-');
    const existing = await prisma.role.findUnique({ where: { slug } });
    if (existing) throw new AppError('Role slug already exists', 409);

    this.validatePermissions(data.permissions);

    return prisma.role.create({
      data: {
        name: data.name,
        slug,
        description: data.description,
        permissions: data.permissions || [],
        isSystem: false,
        createdById: userId,
      },
    });
  }

  async update(id, data) {
    const role = await prisma.role.findUnique({ where: { id } });
    if (!role) throw new AppError('Role not found', 404);
    if (role.isSystem && role.slug === ROLES.ADMIN) {
      throw new AppError('Admin role cannot be modified', 400);
    }

    if (data.permissions) this.validatePermissions(data.permissions);
    if (data.slug && data.slug !== role.slug) {
      throw new AppError('Role slug cannot be changed', 400);
    }

    const { slug: _slug, ...updateData } = data;

    const updated = await prisma.role.update({
      where: { id },
      data: updateData,
    });

    if (data.permissions) {
      await this.syncUsersForRole(updated.slug, updated.permissions);
    }

    return updated;
  }

  async delete(id) {
    const role = await prisma.role.findUnique({ where: { id } });
    if (!role) throw new AppError('Role not found', 404);
    if (role.isSystem) throw new AppError('System roles cannot be deleted', 400);

    const usersCount = await prisma.user.count({
      where: { role: role.slug, isActive: true },
    });
    if (usersCount > 0) {
      throw new AppError(`Cannot delete role assigned to ${usersCount} user(s)`, 400);
    }

    return prisma.role.update({
      where: { id },
      data: { isActive: false },
    });
  }

  validatePermissions(permissions = []) {
    const invalid = permissions.filter((p) => !ALL_PERMISSIONS.includes(p));
    if (invalid.length) {
      throw new AppError(`Invalid permissions: ${invalid.join(', ')}`, 400);
    }
  }

  async syncUsersForRole(slug, permissions) {
    await prisma.user.updateMany({
      where: { role: slug },
      data: { permissions },
    });
  }

  async resolvePermissionsForRole(slug) {
    return resolvePermissionsForRole(slug);
  }
}

export default new RoleService();

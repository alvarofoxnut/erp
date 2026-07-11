import { prisma } from '../../config/db.js';
import AppError from '../../shared/utils/AppError.js';
import { hashPassword } from '../../shared/utils/password.js';
import { buildSearchFilter } from '../../shared/utils/query.js';
import roleService from '../roles/role.service.js';

const userPublicOmit = { password: true, refreshToken: true };

class UserService {
  async getAll({ search, role, page = 1, limit = 10 }) {
    const where = {
      ...(role ? { role } : {}),
      ...buildSearchFilter(search, ['name', 'email']),
    };

    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        omit: userPublicOmit,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    return { users, total };
  }

  async getById(id) {
    const user = await prisma.user.findUnique({
      where: { id },
      omit: userPublicOmit,
    });
    if (!user) throw new AppError('User not found', 404);
    return user;
  }

  async create(data) {
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw new AppError('Email already exists', 409);

    await roleService.getBySlug(data.role);
    const permissions = await roleService.resolvePermissionsForRole(data.role);
    const password = await hashPassword(data.password);

    return prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        password,
        role: data.role,
        permissions,
        isActive: data.isActive ?? true,
      },
      omit: userPublicOmit,
    });
  }

  async update(id, data) {
    const existingUser = await prisma.user.findUnique({ where: { id } });
    if (!existingUser) throw new AppError('User not found', 404);

    const updateData = {};

    if (data.name !== undefined) updateData.name = data.name;

    if (data.email !== undefined) {
      const emailTaken = await prisma.user.findFirst({
        where: { email: data.email, NOT: { id } },
      });
      if (emailTaken) throw new AppError('Email already exists', 409);
      updateData.email = data.email;
    }

    if (data.role !== undefined) {
      await roleService.getBySlug(data.role);
      updateData.role = data.role;
      updateData.permissions = await roleService.resolvePermissionsForRole(data.role);
    }

    if (data.password !== undefined) {
      updateData.password = await hashPassword(data.password);
      updateData.refreshToken = null;
      updateData.tokenVersion = { increment: 1 };
    }

    if (data.isActive !== undefined) {
      updateData.isActive = data.isActive;
    }

    return prisma.user.update({
      where: { id },
      data: updateData,
      omit: userPublicOmit,
    });
  }

  async delete(id) {
    try {
      return await prisma.user.update({
        where: { id },
        data: { isActive: false },
        omit: userPublicOmit,
      });
    } catch (error) {
      if (error.code === 'P2025') throw new AppError('User not found', 404);
      throw error;
    }
  }
}

export default new UserService();

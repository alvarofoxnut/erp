import { prisma } from '../../config/db.js';

export async function withTransaction(callback) {
  return prisma.$transaction(async (tx) => callback(tx));
}

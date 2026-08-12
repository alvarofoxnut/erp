import { prisma } from '../../config/db.js';

/**
 * Interactive transactions for stock/ledger deletes can exceed Prisma's
 * default 5s on cold Neon — raise timeout so correctness work can finish.
 */
export async function withTransaction(callback, options = {}) {
  const {
    maxWait = 10_000,
    timeout = 30_000,
  } = options;

  return prisma.$transaction(async (tx) => callback(tx), {
    maxWait,
    timeout,
  });
}

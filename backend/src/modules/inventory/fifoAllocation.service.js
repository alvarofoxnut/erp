import { prisma } from '../../config/db.js';
import AppError from '../../shared/utils/AppError.js';

const db = (tx) => tx ?? prisma;
const round2 = (n) => Math.round((n || 0) * 100) / 100;

class FifoAllocationService {
  async getAvailableBatches(tx = null) {
    const client = db(tx);
    return client.finishedProduction.findMany({
      where: { remainingQuantity: { gt: 0 } },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        batchNumber: true,
        lotNumber: true,
        remainingQuantity: true,
        finishedRate: true,
        finishedQuantity: true,
        date: true,
      },
    });
  }

  async getTotalRemainingQuantity(tx = null) {
    const client = db(tx);
    const agg = await client.finishedProduction.aggregate({
      _sum: { remainingQuantity: true },
      where: { remainingQuantity: { gt: 0 } },
    });
    return round2(agg._sum.remainingQuantity || 0);
  }

  /**
   * Greedy FIFO split across FG batches (date-ordered).
   * Does not mutate DB — returns allocation plan only.
   */
  async allocateQuantity(quantity, tx = null, { excludeSaleId = null } = {}) {
    const qty = round2(quantity);
    if (qty <= 0) {
      throw new AppError('Allocation quantity must be greater than zero', 400);
    }

    const batches = await this.getAvailableBatches(tx);
    const totalAvailable = round2(
      batches.reduce((sum, b) => sum + (b.remainingQuantity || 0), 0)
    );

    if (totalAvailable < qty) {
      throw new AppError(
        `Insufficient finished goods stock. Available: ${totalAvailable}, Required: ${qty}`,
        400
      );
    }

    let remaining = qty;
    const allocations = [];

    for (const batch of batches) {
      if (remaining <= 0) break;
      const available = round2(batch.remainingQuantity);
      if (available <= 0) continue;

      const take = round2(Math.min(remaining, available));
      const costPerKg = round2(batch.finishedRate);
      allocations.push({
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        lotNumber: batch.lotNumber,
        quantity: take,
        costPerKg,
        totalCost: round2(take * costPerKg),
      });
      remaining = round2(remaining - take);
    }

    if (excludeSaleId) {
      // reserved for future manual re-allocation flows
    }

    return allocations;
  }

  async applyAllocations(allocations, tx = null) {
    const client = db(tx);
    for (const alloc of allocations) {
      const batch = await client.finishedProduction.findUnique({
        where: { id: alloc.batchId },
        select: { remainingQuantity: true },
      });
      if (!batch) {
        throw new AppError(`Batch not found: ${alloc.batchId}`, 404);
      }
      const newRemaining = round2(batch.remainingQuantity - alloc.quantity);
      if (newRemaining < 0) {
        throw new AppError(
          `Insufficient batch stock for ${alloc.batchNumber || alloc.batchId}`,
          400
        );
      }
      await client.finishedProduction.update({
        where: { id: alloc.batchId },
        data: { remainingQuantity: newRemaining },
      });
    }
  }

  async reverseAllocations(saleId, tx = null) {
    const client = db(tx);
    const allocations = await client.manufacturingSaleAllocation.findMany({
      where: { saleId: String(saleId) },
    });

    for (const alloc of allocations) {
      await client.finishedProduction.update({
        where: { id: alloc.batchId },
        data: {
          remainingQuantity: {
            increment: alloc.quantity,
          },
        },
      });
    }

    await client.manufacturingSaleAllocation.deleteMany({
      where: { saleId: String(saleId) },
    });

    return allocations;
  }

  async persistSaleAllocations(saleId, allocations, tx = null) {
    const client = db(tx);
    if (!allocations.length) return [];

    return client.manufacturingSaleAllocation.createMany({
      data: allocations.map((alloc) => ({
        saleId: String(saleId),
        batchId: alloc.batchId,
        quantity: alloc.quantity,
        costPerKg: alloc.costPerKg,
        totalCost: alloc.totalCost,
      })),
    });
  }

  sumAllocationCost(allocations) {
    return round2(allocations.reduce((sum, a) => sum + (a.totalCost || 0), 0));
  }

  async getSaleAllocations(saleId, tx = null) {
    const client = db(tx);
    return client.manufacturingSaleAllocation.findMany({
      where: { saleId: String(saleId) },
      include: {
        batch: {
          select: {
            batchNumber: true,
            lotNumber: true,
            finishedRate: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getBatchInventory(tx = null) {
    const client = db(tx);
    const batches = await client.finishedProduction.findMany({
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        batchNumber: true,
        lotNumber: true,
        date: true,
        finishedQuantity: true,
        remainingQuantity: true,
        finishedRate: true,
        finishedValue: true,
      },
    });

    return batches.map((b) => ({
      ...b,
      inventoryValue: round2((b.remainingQuantity || 0) * (b.finishedRate || 0)),
    }));
  }

  /**
   * FIFO allocation for damages (no sale record). Returns plan + total loss.
   */
  async allocateForDamage(quantity, tx = null) {
    const allocations = await this.allocateQuantity(quantity, tx);
    return {
      allocations,
      totalLoss: this.sumAllocationCost(allocations),
    };
  }

  async applyDamageAllocations(allocations, tx = null) {
    return this.applyAllocations(allocations, tx);
  }

  async reverseDamageAllocations(referenceType, referenceId, tx = null) {
    const client = db(tx);
    const entries = await client.stockLedger.findMany({
      where: {
        referenceType,
        referenceId: String(referenceId),
        direction: 'out',
        batchId: { not: null },
      },
      select: { batchId: true, quantity: true },
    });

    for (const entry of entries) {
      if (!entry.batchId) continue;
      await client.finishedProduction.update({
        where: { id: entry.batchId },
        data: { remainingQuantity: { increment: entry.quantity } },
      });
    }
  }
}

export default new FifoAllocationService();

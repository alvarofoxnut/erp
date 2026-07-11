/**
 * Backfill FG batch fields, link ledger IN rows, retroactive FIFO sale allocations,
 * and replace pooled FG sale OUT movements with per-batch entries.
 *
 * Usage: node src/scripts/backfill-fg-batches.js [--dry-run]
 */
import { prisma } from '../config/db.js';

const round2 = (n) => Math.round((n || 0) * 100) / 100;
const dryRun = process.argv.includes('--dry-run');

function batchNumberFor(production, index) {
  const year = new Date(production.date).getFullYear().toString().slice(-2);
  return `FG-${year}-${String(index + 1).padStart(5, '0')}`;
}

async function allocateFifo(batches, quantity) {
  let remaining = round2(quantity);
  const allocations = [];

  for (const batch of batches) {
    if (remaining <= 0) break;
    const available = round2(batch.remainingQuantity);
    if (available <= 0) continue;

    const take = round2(Math.min(remaining, available));
    const costPerKg = round2(batch.finishedRate);
    allocations.push({
      batchId: batch.id,
      lotNumber: batch.lotNumber,
      quantity: take,
      costPerKg,
      totalCost: round2(take * costPerKg),
    });
    batch.remainingQuantity = round2(batch.remainingQuantity - take);
    remaining = round2(remaining - take);
  }

  if (remaining > 0) {
    throw new Error(
      `Insufficient batch stock during backfill. Short by ${remaining} kg`
    );
  }

  return allocations;
}

async function main() {
  console.log(dryRun ? 'DRY RUN — no writes' : 'Applying FG batch backfill...');

  const productions = await prisma.finishedProduction.findMany({
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
  });

  console.log(`Found ${productions.length} finished production batches`);

  const batchState = productions.map((p, index) => ({
    id: p.id,
    lotNumber: p.lotNumber,
    finishedRate: p.finishedRate || 0,
    finishedQuantity: p.finishedQuantity,
    remainingQuantity: p.finishedQuantity,
    batchNumber: p.batchNumber || batchNumberFor(p, index),
    date: p.date,
    createdAt: p.createdAt,
  }));

  const sales = await prisma.manufacturingSale.findMany({
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
  });

  console.log(`Replaying ${sales.length} manufacturing sales in FIFO order`);

  const saleAllocations = [];

  for (const sale of sales) {
    const allocations = await allocateFifo(batchState, sale.quantity);
    const costOfGoodsSold = round2(
      allocations.reduce((sum, a) => sum + a.totalCost, 0)
    );

    saleAllocations.push({
      saleId: sale.id,
      allocations,
      costOfGoodsSold,
      sale,
    });
  }

  const damages = await prisma.manufacturingDamage.findMany({
    include: { lines: true },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
  });

  const fgDamagePlans = [];
  for (const damage of damages) {
    for (const line of damage.lines) {
      if (line.inventoryType !== 'finished_goods') continue;
      const allocations = await allocateFifo(batchState, line.quantity);
      fgDamagePlans.push({ damage, line, allocations });
    }
  }

  const ledgerIns = await prisma.stockLedger.findMany({
    where: {
      referenceType: 'FinishedProduction',
      category: 'finished_goods',
      direction: 'in',
    },
  });

  const pooledFgOuts = await prisma.stockLedger.findMany({
    where: {
      category: 'finished_goods',
      direction: 'out',
      OR: [
        { referenceType: 'ManufacturingSale', batchId: null },
        { referenceType: 'ManufacturingDamage', batchId: null },
      ],
    },
  });

  const totalRemaining = round2(
    batchState.reduce((sum, b) => sum + b.remainingQuantity, 0)
  );

  console.log(`Post-replay remaining FG: ${totalRemaining} kg`);
  console.log(`Pooled FG OUT rows to replace: ${pooledFgOuts.length}`);
  console.log(`FG IN ledger rows to link: ${ledgerIns.length}`);

  if (dryRun) {
    console.log('Dry run complete.');
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const batch of batchState) {
      await tx.finishedProduction.update({
        where: { id: batch.id },
        data: {
          batchNumber: batch.batchNumber,
          remainingQuantity: batch.remainingQuantity,
        },
      });
    }

    for (const row of ledgerIns) {
      await tx.stockLedger.update({
        where: { id: row.id },
        data: { batchId: row.referenceId },
      });
    }

    for (const { saleId, allocations, costOfGoodsSold } of saleAllocations) {
      await tx.manufacturingSale.update({
        where: { id: saleId },
        data: { costOfGoodsSold },
      });

      if (allocations.length) {
        await tx.manufacturingSaleAllocation.createMany({
          data: allocations.map((alloc) => ({
            saleId,
            batchId: alloc.batchId,
            quantity: alloc.quantity,
            costPerKg: alloc.costPerKg,
            totalCost: alloc.totalCost,
          })),
        });
      }
    }

    for (const outRow of pooledFgOuts) {
      await tx.stockLedger.delete({ where: { id: outRow.id } });
    }

    const batchRunningBalance = new Map(
      batchState.map((b) => [b.id, b.finishedQuantity])
    );

    const createBatchOut = async (alloc, movement) => {
      const current = batchRunningBalance.get(alloc.batchId) ?? 0;
      const balanceAfter = round2(current - alloc.quantity);
      batchRunningBalance.set(alloc.batchId, balanceAfter);

      await tx.stockLedger.create({
        data: {
          category: 'finished_goods',
          lotNumber: alloc.lotNumber || null,
          batchId: alloc.batchId,
          movementType: movement.movementType,
          quantity: alloc.quantity,
          direction: 'out',
          balanceAfter,
          referenceType: movement.referenceType,
          referenceId: movement.referenceId,
          date: movement.date,
          createdById: movement.createdById,
        },
      });
    };

    for (const { sale, allocations } of saleAllocations) {
      for (const alloc of allocations) {
        await createBatchOut(alloc, {
          movementType: 'sales',
          referenceType: 'ManufacturingSale',
          referenceId: sale.id,
          date: sale.date,
          createdById: sale.createdById,
        });
      }
    }

    for (const { damage, allocations } of fgDamagePlans) {
      for (const alloc of allocations) {
        await createBatchOut(alloc, {
          movementType: 'damage',
          referenceType: 'ManufacturingDamage',
          referenceId: damage.id,
          date: damage.date,
          createdById: damage.createdById,
        });
      }
    }

    for (const batch of batchState) {
      const entries = await tx.stockLedger.findMany({
        where: {
          category: 'finished_goods',
          batchId: batch.id,
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });

      let balance = 0;
      for (const entry of entries) {
        balance =
          entry.direction === 'in'
            ? balance + entry.quantity
            : balance - entry.quantity;
        if (entry.balanceAfter !== balance) {
          await tx.stockLedger.update({
            where: { id: entry.id },
            data: { balanceAfter: round2(balance) },
          });
        }
      }
    }
  });

  await prisma.$executeRaw`
    ALTER TABLE "FinishedProduction"
    ALTER COLUMN "batchNumber" SET NOT NULL
  `;
  await prisma.$executeRaw`
    ALTER TABLE "FinishedProduction"
    ALTER COLUMN "remainingQuantity" SET NOT NULL
  `;

  console.log('Backfill completed successfully.');
}

main()
  .catch((err) => {
    console.error('Backfill failed:', err?.message || 'Unknown error');
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

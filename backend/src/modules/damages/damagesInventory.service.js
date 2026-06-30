import { prisma } from '../../config/db.js';
import inventoryRepository from '../inventory/inventory.repository.js';
import { STOCK_CATEGORIES, STOCK_MOVEMENT_TYPES } from '../../shared/constants/index.js';
import AppError from '../../shared/utils/AppError.js';
import { validateOutboundCapacity } from '../inventory/stockValidation.js';

const round2 = (n) => Math.round((n || 0) * 100) / 100;

class DamagesInventoryService {
  async validateManufacturingLineStock(line, tx, { referenceType = null, referenceId = null, previousLine = null } = {}) {
    const { inventoryType, lotNumber, batchId, quantity } = line;

    if (inventoryType === STOCK_CATEGORIES.FINISHED_GOODS) {
      const batch = await tx.finishedProduction.findUnique({
        where: { id: String(batchId) },
        select: { remainingQuantity: true, batchNumber: true },
      });
      if (!batch) throw new AppError('FG batch not found', 404);

      let available = round2(batch.remainingQuantity);
      if (
        previousLine &&
        previousLine.batchId === batchId &&
        referenceType &&
        referenceId
      ) {
        available = round2(available + (previousLine.quantity || 0));
      }

      if (available < quantity) {
        throw new AppError(
          `Insufficient stock in batch ${batch.batchNumber}. Available: ${available}, Required: ${quantity}`,
          400
        );
      }
      return;
    }

    const scope = lotNumber ? { lotNumber } : {};
    let previousOut = 0;
    if (
      previousLine &&
      previousLine.lotNumber === lotNumber &&
      previousLine.inventoryType === inventoryType &&
      referenceType &&
      referenceId
    ) {
      previousOut = previousLine.quantity || 0;
    }

    await validateOutboundCapacity(inventoryType, scope, quantity, tx, {
      referenceType,
      referenceId,
      label: lotNumber ? `${inventoryType} for lot ${lotNumber}` : inventoryType,
    });

    const balance = await inventoryRepository.getCurrentBalance(inventoryType, scope, tx);
    const available = round2(balance + previousOut);
    if (available < quantity) {
      throw new AppError(
        `Insufficient stock. Available: ${available}, Required: ${quantity}`,
        400
      );
    }
  }

  async recordManufacturingLine(line, damage, userId, tx) {
    const movementBase = {
      movementType: STOCK_MOVEMENT_TYPES.DAMAGE,
      direction: 'out',
      referenceType: 'ManufacturingDamage',
      referenceId: damage.id,
      date: damage.date,
      createdBy: userId,
    };

    if (line.inventoryType === STOCK_CATEGORIES.FINISHED_GOODS) {
      await tx.finishedProduction.update({
        where: { id: line.batchId },
        data: { remainingQuantity: { decrement: line.quantity } },
      });
      return inventoryRepository.createMovement(
        {
          ...movementBase,
          category: STOCK_CATEGORIES.FINISHED_GOODS,
          lotNumber: line.lotNumber || null,
          batchId: line.batchId,
          quantity: line.quantity,
        },
        tx
      );
    }

    return inventoryRepository.createMovement(
      {
        ...movementBase,
        category: line.inventoryType,
        lotNumber: line.lotNumber || null,
        quantity: line.quantity,
      },
      tx
    );
  }

  async restoreManufacturingLines(lines, tx) {
    for (const line of lines) {
      if (line.inventoryType === STOCK_CATEGORIES.FINISHED_GOODS && line.batchId) {
        await tx.finishedProduction.update({
          where: { id: line.batchId },
          data: { remainingQuantity: { increment: line.quantity } },
        });
      }
    }
  }

  async recordTradingLine(line, damage, userId, tx) {
    return inventoryRepository.createMovement(
      {
        category: STOCK_CATEGORIES.TRADING,
        item: line.itemId,
        movementType: STOCK_MOVEMENT_TYPES.DAMAGE,
        quantity: line.quantity,
        direction: 'out',
        referenceType: 'TradingDamage',
        referenceId: damage.id,
        date: damage.date,
        createdBy: userId,
      },
      tx
    );
  }
}

export default new DamagesInventoryService();

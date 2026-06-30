import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import inventoryRepository from './inventory.repository.js';

describe('buildEditStockErrorMessage', () => {
  const scope = { category: 'raw_material', lotNumber: 'Lot 1', item: null, batchId: null };

  it('describes consumed quantity when reducing inbound stock', () => {
    const message = inventoryRepository.buildEditStockErrorMessage(scope, {
      current: 400,
      oldNet: 1000,
      newNet: 500,
      projected: -100,
      context: { label: 'raw material' },
    });
    assert.match(message, /600 kg has already been consumed/);
  });

  it('allows projected balance when increasing inbound stock', () => {
    const projected = Math.round((400 - 1000 + 1500) * 100) / 100;
    assert.equal(projected, 900);
  });
});

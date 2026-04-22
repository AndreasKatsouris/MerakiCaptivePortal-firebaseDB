import { describe, test, expect } from 'vitest';
import { computeItemKey } from '../services/item-identity.js';

describe('computeItemKey', () => {
  test('prefers real itemCode', async () => {
    expect(await computeItemKey({ itemCode: 'SKU123', description: 'X' })).toBe('code:SKU123');
  });

  test('falls back to hash when itemCode is empty', async () => {
    const k = await computeItemKey({ itemCode: '', description: 'Chicken Breast', category: 'Protein', costCenter: 'Kitchen' });
    expect(k).toMatch(/^hash:[a-f0-9]{40}$/);
  });

  test('falls back to hash when itemCode is ITEM- random fallback', async () => {
    const k = await computeItemKey({ itemCode: 'ITEM-472', description: 'Lamb Shoulder', category: 'Protein', costCenter: 'Kitchen' });
    expect(k.startsWith('hash:')).toBe(true);
  });

  test('hash deterministic across case/whitespace', async () => {
    const a = await computeItemKey({ itemCode: '', description: 'Lamb  Shoulder ', category: 'protein', costCenter: 'kitchen' });
    const b = await computeItemKey({ itemCode: '', description: 'lamb shoulder', category: 'Protein', costCenter: 'Kitchen' });
    expect(a).toBe(b);
  });

  test('hash differs when description differs', async () => {
    const a = await computeItemKey({ itemCode: '', description: 'Chicken', category: 'Protein', costCenter: 'K' });
    const b = await computeItemKey({ itemCode: '', description: 'Beef', category: 'Protein', costCenter: 'K' });
    expect(a).not.toBe(b);
  });
});

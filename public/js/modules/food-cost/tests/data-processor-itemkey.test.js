import { describe, test, expect } from 'vitest';
import { attachItemKeys } from '../data-processor.js';

describe('attachItemKeys', () => {
  test('attaches code: key for real itemCode', async () => {
    const items = [{ itemCode: 'SKU001', description: 'Chicken', category: 'Protein', costCenter: 'K' }];
    const out = await attachItemKeys(items);
    expect(out[0].itemKey).toBe('code:SKU001');
  });

  test('attaches hash: key when itemCode empty', async () => {
    const items = [{ itemCode: '', description: 'Lamb Shoulder', category: 'Protein', costCenter: 'Kitchen' }];
    const out = await attachItemKeys(items);
    expect(out[0].itemKey).toMatch(/^hash:[a-f0-9]{40}$/);
  });

  test('attaches hash: key for random ITEM-NNN fallback code', async () => {
    const items = [{ itemCode: 'ITEM-472', description: 'Beef', category: 'Protein', costCenter: 'K' }];
    const out = await attachItemKeys(items);
    expect(out[0].itemKey.startsWith('hash:')).toBe(true);
  });

  test('preserves other fields', async () => {
    const items = [{ itemCode: 'X', description: 'd', openingQty: 10, usage: 5 }];
    const out = await attachItemKeys(items);
    expect(out[0].openingQty).toBe(10);
    expect(out[0].usage).toBe(5);
  });

  test('handles empty array', async () => {
    expect(await attachItemKeys([])).toEqual([]);
  });
});

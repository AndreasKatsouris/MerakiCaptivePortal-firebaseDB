// Convention: import test globals from vitest (ESM), require the module under
// test (CJS) — matching functions/payments/__tests__/bundles.test.js exactly.
// `require('vitest')` does NOT work (vitest rejects it), which is what the D1
// plan's copy of this file had.
import { describe, it, expect } from 'vitest';

const {
  sanitizeText, SupplierInput, ProductInput, MAX_SUPPLIERS, MAX_PRODUCTS,
} = require('../validate');

describe('sanitizeText', () => {
  it('strips control characters before truncating', () => {
    expect(sanitizeText('a\x00b\x1Fc')).toBe('abc');
  });
  it('truncates to 200 visible chars', () => {
    expect(sanitizeText('x'.repeat(500))).toHaveLength(200);
  });
  it('coerces null/undefined to empty string', () => {
    expect(sanitizeText(null)).toBe('');
    expect(sanitizeText(undefined)).toBe('');
  });
});

describe('SupplierInput', () => {
  it('accepts a minimal supplier (name only) — email is optional at D1', () => {
    const out = SupplierInput.parse({ name: 'Peninsula Beverages' });
    expect(out.name).toBe('Peninsula Beverages');
    expect(out.email).toBe('');
  });
  it('trims and strips control chars from the name', () => {
    expect(SupplierInput.parse({ name: '  Bean\x00 There  ' }).name).toBe('Bean There');
  });
  it('rejects an empty name', () => {
    expect(() => SupplierInput.parse({ name: '   ' })).toThrow();
  });
  it('rejects a name over 120 chars', () => {
    expect(() => SupplierInput.parse({ name: 'x'.repeat(121) })).toThrow();
  });
  it('accepts an empty email (the needs-email state)', () => {
    expect(SupplierInput.parse({ name: 'A', email: '' }).email).toBe('');
  });
  it('rejects a malformed email', () => {
    expect(() => SupplierInput.parse({ name: 'A', email: 'not-an-email' })).toThrow();
  });
  it('strips CR/LF from the name (header-injection precursor)', () => {
    expect(SupplierInput.parse({ name: 'A\r\nBcc: x@y.z' }).name).toBe('ABcc: x@y.z');
  });
  it('bounds deliveryDays to weekday integers', () => {
    expect(SupplierInput.parse({ name: 'A', deliveryDays: [1, 4] }).deliveryDays).toEqual([1, 4]);
    expect(() => SupplierInput.parse({ name: 'A', deliveryDays: [7] })).toThrow();
    expect(() => SupplierInput.parse({ name: 'A', deliveryDays: [1.5] })).toThrow();
  });
  it('rejects a negative minimumOrderValue', () => {
    expect(() => SupplierInput.parse({ name: 'A', minimumOrderValue: -1 })).toThrow();
  });
  it('defaults active to true', () => {
    expect(SupplierInput.parse({ name: 'A' }).active).toBe(true);
  });
});

describe('ProductInput', () => {
  it('accepts a minimal product', () => {
    const out = ProductInput.parse({ description: 'Sparkling water 500ml', unit: 'ea' });
    expect(out.unit).toBe('ea');
    expect(out.lastPrice).toBeNull();
  });
  it('requires description and unit', () => {
    expect(() => ProductInput.parse({ unit: 'ea' })).toThrow();
    expect(() => ProductInput.parse({ description: 'A' })).toThrow();
  });
  it('treats a non-finite or non-positive price as unknown (null)', () => {
    expect(ProductInput.parse({ description: 'A', unit: 'ea', lastPrice: 0 }).lastPrice).toBeNull();
    expect(ProductInput.parse({ description: 'A', unit: 'ea', lastPrice: -5 }).lastPrice).toBeNull();
  });
  it('keeps a valid price', () => {
    expect(ProductInput.parse({ description: 'A', unit: 'ea', lastPrice: 6.5 }).lastPrice).toBe(6.5);
  });
});

describe('caps', () => {
  it('exposes the §5.2 caps', () => {
    expect(MAX_SUPPLIERS).toBe(500);
    expect(MAX_PRODUCTS).toBe(2000);
  });
});

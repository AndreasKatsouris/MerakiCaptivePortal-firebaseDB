'use strict';

/**
 * D1 pure validation core for the ROSS supplier book.
 * Design: docs/plans/2026-07-28-ross-purchase-orders-design.md §5.
 *
 * This is the LOAD-BEARING validation for the feature. The RTDB `.validate`
 * rules are the outer fence only, and they do not constrain our own Cloud
 * Functions at all — the Admin SDK bypasses every rule (design G17).
 *
 * CommonJS: functions/ has no "type":"module". An ESM export here passes vitest
 * and SyntaxErrors at deployed require() time (2026-06-22 LESSON).
 */

const { z } = require('zod');

const MAX_TEXT = 200;      // sanitizeText ceiling
const MAX_SUPPLIERS = 500; // per location   (§5.2)
const MAX_PRODUCTS = 2000; // per supplier   (§5.2)

/**
 * Strip control characters FIRST, then truncate. Same order as
 * functions/agent/food-cost/suggest.js sanitizeText — stripping after
 * truncation would let a control char consume a visible slot.
 * Also removes CR/LF, which is the header-injection precursor for D3's email
 * subject and display name.
 */
function sanitizeText(v) {
  // eslint-disable-next-line no-control-regex
  return String(v == null ? '' : v).replace(/[\x00-\x1F\x7F]/g, '').slice(0, MAX_TEXT);
}

/** Trimmed, control-stripped string with a max visible length. */
function cleanString(max) {
  return z.preprocess((v) => sanitizeText(v).trim(), z.string().max(max));
}

/** Optional free-text field: absent/null/'' all normalise to ''. */
function optionalString(max) {
  return cleanString(max).default('');
}

/**
 * Price gate mirroring suggest.js's P4 cost gate: unknown unless it is a
 * finite number strictly greater than zero. Never store a garbage cost.
 */
const optionalPrice = z.preprocess(
  (v) => {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  },
  z.number().min(0).max(10000000).nullable(),
).default(null);

/**
 * `email` is OPTIONAL at D1 and '' is a first-class value, not a gap to be
 * filled in later by a status field. The stock CSV carries no supplier contact
 * details at all (design G1), so every seeded supplier necessarily starts here.
 *
 * The "needs email" state is DERIVED from `email === ''` — deliberately not
 * stored (operator decision 2026-08-04). Derived state cannot drift from the
 * thing it describes; a stored `status: 'needs-email'` can, and this repo has
 * been bitten by stale denormalised state before.
 *
 * D3's send path is where the absence becomes an error, and it must say so
 * explicitly rather than silently skipping the supplier.
 */
const SupplierInput = z.object({
  name: cleanString(120).refine((s) => s.length >= 1, { message: 'name is required' }),
  email: z.preprocess(
    (v) => sanitizeText(v).trim(),
    z.union([z.literal(''), z.string().max(200).email()]),
  ).default(''),
  phone: optionalString(40),
  contactName: optionalString(120),
  accountNumber: optionalString(60),
  deliveryDays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  leadTimeDays: z.number().int().min(0).max(60).optional(),
  minimumOrderValue: z.number().min(0).max(10000000).optional(),
  notes: optionalString(1000),
  active: z.boolean().default(true),
});

const ProductInput = z.object({
  description: cleanString(200).refine((s) => s.length >= 1, { message: 'description is required' }),
  unit: cleanString(20).refine((s) => s.length >= 1, { message: 'unit is required' }),
  packSize: optionalString(60),
  itemCode: optionalString(60),
  lastPrice: optionalPrice,
  active: z.boolean().default(true),
});

// ALL exports in ONE assignment — the #188 export-clobber trap.
module.exports = {
  sanitizeText, cleanString, SupplierInput, ProductInput,
  MAX_TEXT, MAX_SUPPLIERS, MAX_PRODUCTS,
};

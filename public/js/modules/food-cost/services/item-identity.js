/* global TextEncoder, crypto */

async function sha1Hex(str) {
  const bytes = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest('SHA-1', bytes);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

function normalize(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function isRandomFallbackCode(code) {
  return /^ITEM-\d{1,6}$/.test(String(code || ''));
}

export async function computeItemKey(item) {
  const code = String(item?.itemCode || '').trim();
  if (code && !isRandomFallbackCode(code)) {
    return `code:${code}`;
  }
  const payload = [
    normalize(item?.description),
    normalize(item?.category),
    normalize(item?.costCenter)
  ].join('|');
  const h = await sha1Hex(payload);
  return `hash:${h}`;
}

/**
 * Pure variant of `attachItemKeys` for a single item: returns a new object
 * with `itemKey` set, without mutating the input. If `itemKey` is already
 * present, returns the original reference unchanged.
 */
export async function withItemKey(item) {
  if (!item) return null;
  if (item.itemKey) return item;
  const itemKey = await computeItemKey(item);
  return { ...item, itemKey };
}

export const __test__ = { normalize, isRandomFallbackCode };

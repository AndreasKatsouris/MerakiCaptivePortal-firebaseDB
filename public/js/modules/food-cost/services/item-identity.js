import { webcrypto } from 'node:crypto';

const crypto = webcrypto;

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

export const __test__ = { normalize, isRandomFallbackCode };

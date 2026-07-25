// M-1 ingestion guards for the food-cost v2 upload wizard (design §4d).
//
// Pure module — no firebase, no DOM. Two gates with fixed placement:
//   1. checkFileSize BEFORE the file is read to string (byte cap alone is
//      insufficient — parseCSV has no limits, so a 2 MB file of short lines
//      can still exceed the row cap);
//   2. checkParsedShape AFTER parseCSVData returns but BEFORE
//      processDataWithMapping.
// Both return typed results the wizard renders as inline banners.

export const MAX_FILE_BYTES = 2 * 1024 * 1024
export const MAX_ROWS = 5000
export const MAX_COLS = 60

/**
 * Gate 1: reject oversized files before reading them. Reads file.size only,
 * so any {size} object works. Fails closed when size is not a finite number.
 *
 * @param {{size: number}} file
 * @returns {{ok: true} | {ok: false, code: 'file-too-large', limitBytes: number, actualBytes: number}}
 */
export function checkFileSize(file) {
  const size = file && typeof file.size === 'number' && Number.isFinite(file.size)
    ? file.size
    : Infinity
  if (size > MAX_FILE_BYTES) {
    return {
      ok: false,
      code: 'file-too-large',
      limitBytes: MAX_FILE_BYTES,
      actualBytes: size,
    }
  }
  return { ok: true }
}

/**
 * Gate 2: bound the parsed shape before any per-row processing.
 *
 * @param {{headers: Array, rows: Array}} parsed
 * @returns {{ok: true}
 *   | {ok: false, code: 'invalid-parse'}
 *   | {ok: false, code: 'too-many-rows' | 'too-many-columns', limit: number, actual: number}}
 */
export function checkParsedShape(parsed) {
  if (!parsed || !Array.isArray(parsed.headers) || !Array.isArray(parsed.rows)) {
    return { ok: false, code: 'invalid-parse' }
  }
  if (parsed.headers.length > MAX_COLS) {
    return {
      ok: false,
      code: 'too-many-columns',
      limit: MAX_COLS,
      actual: parsed.headers.length,
    }
  }
  if (parsed.rows.length > MAX_ROWS) {
    return {
      ok: false,
      code: 'too-many-rows',
      limit: MAX_ROWS,
      actual: parsed.rows.length,
    }
  }
  return { ok: true }
}

// Run UI input-type metadata. Mirrors server VALID_INPUT_TYPES
// (functions/ross.js:25) — keep in lockstep if the server changes.

export const VALID_INPUT_TYPES = [
  'checkbox', 'text', 'number', 'temperature',
  'yes_no', 'dropdown', 'timestamp', 'photo', 'signature', 'rating',
]

// Sentinel response value submitted by the "Mark N/A" affordance on
// photo/signature placeholder cards. The server has no validateResponseValue
// case for these types, so any string passes type-validation and the task
// counts as responded.
export const NA_SENTINEL = 'n/a'

const PLACEHOLDER_TYPES = new Set(['photo', 'signature'])
const RANGE_TYPES = new Set(['number', 'temperature'])

export function isPlaceholderType(t) {
  return PLACEHOLDER_TYPES.has(t)
}

export function isRangeType(t) {
  return RANGE_TYPES.has(t)
}

// Client-side pre-flight: should we reveal the note textarea BEFORE
// hitting the server? Mirrors the server's auto-flag + 422 logic so
// the same UI path handles both pre-flight and server 422 fallback.
export function needsPreflightNote(inputType, value, inputConfig) {
  if (!isRangeType(inputType)) return false
  if (!inputConfig) return false
  if (!inputConfig.requiredNote) return false
  const n = Number(value)
  if (Number.isNaN(n)) return false
  if (inputConfig.min !== undefined && n < inputConfig.min) return true
  if (inputConfig.max !== undefined && n > inputConfig.max) return true
  return false
}

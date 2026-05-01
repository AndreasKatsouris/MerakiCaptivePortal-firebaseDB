// Single source of truth for ROSS task input types on the v2 surface.
// Mirrors `VALID_INPUT_TYPES` in functions/ross.js (line 25-28). The
// server stores `inputConfig` verbatim; only `inputType` is enum-validated
// server-side. Runtime semantics (validation + flagging) live in
// validateResponseValue / isResponseFlagged on the server.
//
// Phase 4e.1 surfaces only the runtime-active types. Photo and signature
// have no agreed inputConfig contract yet — deferred until the runner ships.

// Mirrors functions/ross.js VALID_INPUT_TYPES exactly. Keep in sync if
// the server enum changes.
export const VALID_INPUT_TYPES = [
  'checkbox', 'text', 'number', 'temperature',
  'yes_no', 'dropdown', 'timestamp', 'photo', 'signature', 'rating',
]

// User-facing labels + descriptions for the type select.
export const INPUT_TYPE_OPTIONS = [
  { id: 'checkbox',    label: 'Checkbox',     description: 'Done / not done' },
  { id: 'yes_no',      label: 'Yes / no',     description: 'Boolean question' },
  { id: 'text',        label: 'Free text',    description: 'Short note' },
  { id: 'number',      label: 'Number',       description: 'Numeric reading; flags out-of-range' },
  { id: 'temperature', label: 'Temperature',  description: 'Numeric reading with °C/°F unit; flags out-of-range' },
  { id: 'dropdown',    label: 'Dropdown',     description: 'Pick one from a list' },
  { id: 'rating',      label: 'Rating',       description: 'Integer score on a fixed scale' },
  { id: 'timestamp',   label: 'Timestamp',    description: 'Capture moment of completion' },
  { id: 'photo',       label: 'Photo',        description: 'Upload an image (config TBD)' },
  { id: 'signature',   label: 'Signature',    description: 'Capture a signature (config TBD)' },
]

// Returns a fresh inputConfig object with the right defaults for the
// given inputType. Critical: must NOT inherit keys from a previous
// type — the editor's type-switch watcher calls this to clear stale
// keys (e.g. min/max left over after switching to dropdown).
export function defaultInputConfig(inputType) {
  switch (inputType) {
    case 'number':      return { min: null, max: null, unit: '', requiredNote: false }
    case 'temperature': return { min: null, max: null, unit: 'C', requiredNote: false }
    case 'dropdown':    return { options: [] }
    case 'rating':      return { scale: 5, requiredNote: false }
    case 'text':        return { placeholder: '', maxLength: null }
    case 'timestamp':
    case 'checkbox':
    case 'yes_no':
    case 'photo':
    case 'signature':
    default:
      return {}
  }
}

// Sanitise an inputConfig before sending to the server: strip nulls /
// empties, coerce numeric fields, dedupe dropdown options. Returns a
// fresh object; never mutates input.
export function sanitiseInputConfig(inputType, raw) {
  const cfg = raw && typeof raw === 'object' ? raw : {}
  switch (inputType) {
    case 'number':
    case 'temperature': {
      const out = {}
      if (Number.isFinite(Number(cfg.min))) out.min = Number(cfg.min)
      if (Number.isFinite(Number(cfg.max))) out.max = Number(cfg.max)
      if (cfg.unit && String(cfg.unit).trim()) out.unit = String(cfg.unit).trim()
      if (cfg.requiredNote === true) out.requiredNote = true
      return out
    }
    case 'dropdown': {
      const seen = new Set()
      const options = (Array.isArray(cfg.options) ? cfg.options : [])
        .map((o) => String(o || '').trim())
        .filter((o) => {
          if (!o || seen.has(o)) return false
          seen.add(o)
          return true
        })
      return { options }
    }
    case 'rating': {
      const out = {}
      const scale = Number(cfg.scale)
      out.scale = Number.isInteger(scale) && scale >= 2 && scale <= 10 ? scale : 5
      if (cfg.requiredNote === true) out.requiredNote = true
      return out
    }
    case 'text': {
      const out = {}
      if (cfg.placeholder && String(cfg.placeholder).trim()) {
        out.placeholder = String(cfg.placeholder).trim()
      }
      const ml = Number(cfg.maxLength)
      if (Number.isInteger(ml) && ml > 0) out.maxLength = ml
      return out
    }
    default:
      return {}
  }
}

// Validate inputConfig pre-flight. Returns an error string or null.
// Mirrors the UI rules from the plan (§5).
export function validateInputConfig(inputType, cfg) {
  const c = cfg || {}
  switch (inputType) {
    case 'number':
    case 'temperature': {
      const minSet = c.min !== null && c.min !== '' && c.min !== undefined
      const maxSet = c.max !== null && c.max !== '' && c.max !== undefined
      if (minSet && !Number.isFinite(Number(c.min))) return 'Min must be a number'
      if (maxSet && !Number.isFinite(Number(c.max))) return 'Max must be a number'
      if (minSet && maxSet && Number(c.min) > Number(c.max)) return 'Min cannot be greater than Max'
      if (inputType === 'temperature' && c.unit && !['C', 'F'].includes(c.unit)) {
        return 'Unit must be C or F'
      }
      return null
    }
    case 'dropdown': {
      const opts = Array.isArray(c.options) ? c.options.map((o) => String(o || '').trim()).filter(Boolean) : []
      if (opts.length < 2) return 'Add at least two non-empty options'
      const dupes = opts.length !== new Set(opts).size
      if (dupes) return 'Options must be unique'
      return null
    }
    case 'rating': {
      const scale = Number(c.scale)
      if (c.scale != null && c.scale !== '' && (!Number.isInteger(scale) || scale < 2 || scale > 10)) {
        return 'Scale must be an integer between 2 and 10'
      }
      return null
    }
    case 'text': {
      const ml = c.maxLength
      if (ml != null && ml !== '' && (!Number.isInteger(Number(ml)) || Number(ml) <= 0 || Number(ml) > 10000)) {
        return 'Max length must be a positive integer up to 10000'
      }
      return null
    }
    default:
      return null
  }
}

// Convenience for the editor: which types take any user-facing config?
// Used to decide whether to render the config sub-form at all.
export function hasConfigFields(inputType) {
  return ['number', 'temperature', 'dropdown', 'rating', 'text'].includes(inputType)
}

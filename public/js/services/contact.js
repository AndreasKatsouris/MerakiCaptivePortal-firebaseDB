/**
 * Centralised contact info for upsell / sales / support CTAs.
 *
 * Used by:
 *  - `/upgrade.html` — All-in upgrade CTA (Phase 6 PR 1C)
 *
 * Future consumers: any "Contact us" button across the app should
 * import from here so an address change is a single-file edit. When the
 * Phase 6 D self-service checkout ships, the email CTA becomes the
 * fallback path for operators who prefer human contact.
 */

export const SPARKS_CONTACT = {
  email: 'andreas@sparksclub.co.za',
  displayName: 'Sparks',
}

/**
 * Build a `mailto:` URL.
 */
export function buildMailtoUrl(subject = '', body = '') {
  const s = encodeURIComponent(subject)
  const b = encodeURIComponent(body)
  const qs = [s && `subject=${s}`, b && `body=${b}`].filter(Boolean).join('&')
  return `mailto:${SPARKS_CONTACT.email}${qs ? `?${qs}` : ''}`
}

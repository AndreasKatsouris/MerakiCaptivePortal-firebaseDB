/**
 * HTML escape utilities for the compliance module.
 *
 * Prevents XSS by escaping user-controllable strings before
 * interpolation into innerHTML templates.
 */

/**
 * Escape a string for safe use inside HTML element content.
 * @param {string|null|undefined} str
 * @returns {string}
 */
export function escapeHtml(str) {
  if (str == null) return '';
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(String(str)));
  return div.innerHTML;
}

/**
 * Escape a string for safe use inside an HTML attribute value (quoted).
 * @param {string|null|undefined} str
 * @returns {string}
 */
export function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;');
}

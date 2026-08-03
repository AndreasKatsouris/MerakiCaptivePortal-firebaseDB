// Guard for buildReceiptDetailsHtml — the admin "Receipt Details" modal body.
//
// Threat model: `receipts` root `.write` is `auth != null` with NO child rules
// (database.rules.json:131-135), so every field below is written by an
// untrusted tenant, and the result goes to Swal.fire({ html }) → innerHTML.
// Unescaped, any one of them is stored XSS in an admin's session.
import { describe, it, expect } from 'vitest'
import { buildReceiptDetailsHtml } from '../../public/js/receipt-management/receipt-details-html.js'

const BREAKOUT = '" onerror="steal()" x="'
const SCRIPT = '<script>steal()</script>'

const badgeClass = (status) => `badge-${String(status || 'unknown')}`

describe('buildReceiptDetailsHtml', () => {
  it('escapes a breakout payload in EVERY tenant-controlled string field', () => {
    const fields = [
      'fullStoreName', 'brandName', 'storeAddress', 'invoiceNumber',
      'date', 'time', 'guestPhoneNumber', 'tableNumber', 'waiterName', 'status',
    ]

    for (const field of fields) {
      const html = buildReceiptDetailsHtml({ [field]: BREAKOUT }, null, badgeClass)
      expect(html, `${field} leaked a raw quote`).not.toContain(BREAKOUT)
      expect(html, `${field} leaked onerror=`).not.toContain('onerror="steal()"')
      expect(html).toContain('&quot;')
    }
  })

  it('escapes markup inside item rows (name) and never emits a raw <script>', () => {
    const html = buildReceiptDetailsHtml(
      { items: [{ name: SCRIPT, quantity: 1, unitPrice: 1, totalPrice: 1 }] },
      null,
      badgeClass
    )
    expect(html).not.toContain(SCRIPT)
    expect(html).toContain('&lt;script&gt;')
  })

  // `${item.quantity || 0}` passed a STRING straight through — a truthy
  // '<img onerror=…>' is not replaced by 0 — and `.toFixed()` on a string
  // THROWS, blanking the modal. Both are closed by numeric coercion.
  it('coerces numeric fields instead of trusting `|| 0`, and never throws on a string amount', () => {
    expect(() => buildReceiptDetailsHtml(
      {
        subtotal: SCRIPT, vatAmount: SCRIPT, totalAmount: SCRIPT,
        items: [{ name: 'x', quantity: SCRIPT, unitPrice: SCRIPT, totalPrice: SCRIPT }],
      },
      null,
      badgeClass
    )).not.toThrow()

    const html = buildReceiptDetailsHtml(
      { subtotal: SCRIPT, items: [{ name: 'x', quantity: SCRIPT }] },
      null,
      badgeClass
    )
    expect(html).not.toContain(SCRIPT)
    expect(html).toContain('R0.00')
  })

  it('renders an https image src and escapes it', () => {
    const html = buildReceiptDetailsHtml({}, 'https://storage.googleapis.com/signed?x=1&y=2', badgeClass)
    expect(html).toContain('<img src="https://storage.googleapis.com/signed?x=1&amp;y=2"')
  })

  // A bad scheme must yield NO element rather than an escaped-but-live one.
  it('drops the image entirely for a non-http(s) src', () => {
    for (const src of ['javascript:steal()', 'data:text/html;base64,PHN2Zz4=', 'not a url', '']) {
      const html = buildReceiptDetailsHtml({}, src, badgeClass)
      expect(html, `rendered an <img> for ${src}`).not.toContain('<img')
    }
  })

  it('escapes the status badge class (it is derived from a tenant-controlled status)', () => {
    const html = buildReceiptDetailsHtml({ status: BREAKOUT }, null, badgeClass)
    expect(html).not.toContain('onerror="steal()"')
  })

  it('tolerates a missing/empty receipt without throwing', () => {
    expect(() => buildReceiptDetailsHtml(undefined, null, badgeClass)).not.toThrow()
    expect(() => buildReceiptDetailsHtml({}, null, undefined)).not.toThrow()
  })
})

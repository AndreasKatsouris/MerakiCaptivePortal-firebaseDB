// Guard for resolveReceiptImageSrc — the shared helper the 2 admin receipt
// consumers (public/js/receipt-management.js, public/js/modules/receipts/
// ReceiptManager.js) use to prefer the CRIT-09 F2 signed-URL CF
// (getReceiptImageUrl) over the legacy Twilio imageUrl. Automation queue card Q7.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { resolveReceiptImageSrc } from '../../public/js/receipt-management/receipt-image-url.js'

const FUNCTIONS_URL = 'https://us-central1-merakicaptiveportal-firebasedb.cloudfunctions.net'

describe('resolveReceiptImageSrc', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = vi.fn()
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('returns the legacy imageUrl directly for a pre-PR-B record (no storagePath) — never calls the CF', async () => {
    const receipt = { imageUrl: 'https://twilio.example/media/abc.jpg' }
    const src = await resolveReceiptImageSrc(receipt, 'receipt_1', 'token_123')
    expect(src).toBe('https://twilio.example/media/abc.jpg')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('returns null when a pre-PR-B record has neither storagePath nor imageUrl', async () => {
    const src = await resolveReceiptImageSrc({}, 'receipt_1', 'token_123')
    expect(src).toBeNull()
  })

  it('calls getReceiptImageUrl with the receiptId + bearer token, and returns the signed URL', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ signedUrl: 'https://storage.googleapis.com/signed?x=1' })
    })

    const receipt = { storagePath: 'receipts/uuid-1.jpg', imageUrl: 'https://twilio.example/stale.jpg' }
    const src = await resolveReceiptImageSrc(receipt, 'receipt_1', 'token_123')

    expect(global.fetch).toHaveBeenCalledWith(`${FUNCTIONS_URL}/getReceiptImageUrl`, expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer token_123' }),
      body: JSON.stringify({ receiptId: 'receipt_1' })
    }))
    expect(src).toBe('https://storage.googleapis.com/signed?x=1')
  })

  it('falls back to imageUrl when the CF call fails (network error, non-OK response, etc.)', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 403 })

    const receipt = { storagePath: 'receipts/uuid-1.jpg', imageUrl: 'https://twilio.example/stale.jpg' }
    const src = await resolveReceiptImageSrc(receipt, 'receipt_1', 'token_123')

    expect(src).toBe('https://twilio.example/stale.jpg')
  })
})

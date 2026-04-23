// Receipts & Ops Inbox service — Phase A7 scripted.
// A7.1 wires: inbox from receipts/{receiptId} filtered by status and
// lastUpdated desc; detail from receipt extraction pipeline
// (functions/receiptProcessor + OCR output); matching confidence from
// the PO-match function; observation from Ross service.

import {
  INBOX_FILTERS, INBOX, DETAIL_HEADER, RECEIPT_IMAGE,
  EXTRACTED, OBSERVATION, MATCHING,
} from './content.js'

const FAKE_LATENCY_MS = 60
const wait = () => new Promise(r => setTimeout(r, FAKE_LATENCY_MS))

export async function getInbox({ filter = 'pending' } = {}) {
  await wait()
  // Current scripted items all land in the pending bucket; a real
  // implementation filters on receipt.status.
  const rows = filter === 'flagged' ? INBOX.filter(r => r.flagged)
            : filter === 'matched' ? []
            : INBOX
  return {
    filters: INBOX_FILTERS.map(f => ({ ...f, active: f.id === filter })),
    rows,
    pendingCount: INBOX.filter(r => !r.flagged).length + INBOX.filter(r => r.flagged).length,
  }
}

export async function getReceiptDetail(receiptId) {
  await wait()
  // Single detail for now; wired service will look up by id and stream
  // OCR-extracted fields as they're computed.
  return {
    id: receiptId,
    header:      DETAIL_HEADER,
    image:       RECEIPT_IMAGE,
    extracted:   EXTRACTED,
    observation: OBSERVATION,
    matching:    MATCHING,
  }
}

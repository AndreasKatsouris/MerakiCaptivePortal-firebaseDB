// Scripted Receipts & Ops Inbox content — Phase A7.
// Shape matches eventual RTDB receipts + the Ross extraction pipeline
// (OCR → field extraction → GL coding → PO matching). ZAR amounts.

export const INBOX_FILTERS = [
  { id: 'pending', label: 'Pending', active: true  },
  { id: 'matched', label: 'Matched', active: false },
  { id: 'flagged', label: 'Flagged', active: false },
  { id: 'all',     label: 'All',     active: false },
]

export const INBOX = [
  { id: 'r1', source: 'Sysco Produce',    receivedAt: 'Apr 22 · 7:12 AM',  amount: 'R33,159.60', kind: 'invoice',    flagged: false, selected: true  },
  { id: 'r2', source: 'Chef Marco',       receivedAt: 'Apr 21 · 10:04 PM', amount: 'R2,570.40',  kind: 'petty cash', flagged: false },
  { id: 'r3', source: 'Pacific Wines',    receivedAt: 'Apr 21 · 3:40 PM',  amount: 'R58,320.00', kind: 'invoice',    flagged: true  },
  { id: 'r4', source: 'Uber · delivery',  receivedAt: 'Apr 21 · 11:16 AM', amount: 'R583.20',    kind: 'receipt',    flagged: false },
  { id: 'r5', source: 'Premium Meats',    receivedAt: 'Apr 20 · 8:22 AM',  amount: 'R37,882.80', kind: 'invoice',    flagged: true  },
  { id: 'r6', source: 'Whole Foods',      receivedAt: 'Apr 20 · 7:04 AM',  amount: 'R3,350.16',  kind: 'receipt',    flagged: false },
]

export const DETAIL_HEADER = {
  eyebrow: 'Invoice · received via WhatsApp · Apr 22 · 7:12 AM',
  vendor: 'Sysco Produce',
  amount: 'R33,159.60',
  actions: [
    { id: 'flag',    label: 'Flag',            variant: 'ghost' },
    { id: 'edit',    label: 'Edit',            variant: 'ghost' },
    { id: 'approve', label: 'Approve & file',  variant: 'solid', icon: 'check' },
  ],
}

export const RECEIPT_IMAGE = {
  title: 'SYSCO PRODUCE CO.',
  meta: 'INV-2026-04-0842 · Apr 22, 2026',
  lines: [
    { label: 'Romaine · 12 cs',        price: 'R2,570.40'  },
    { label: 'Baby arugula · 8 lb',    price: 'R1,152.00'  },
    { label: 'Tomato roma · 40 lb',    price: 'R3,240.00'  },
    { label: 'Onion yellow · 50 lb',   price: 'R2,025.00'  },
    { label: 'Avocado · 60 ct',        price: 'R3,780.00'  },
    { label: 'Lemon · 120 ct',         price: 'R1,728.00'  },
    { label: 'Herbs, mixed · 24 bn',   price: 'R3,024.00'  },
    { label: 'Mushroom, button · 20 lb', price: 'R2,520.00' },
    { label: '…',                      price: '…'           },
  ],
  total: 'R33,159.60',
}

export const EXTRACTED = {
  eyebrow: 'Ross extracted',
  fields: [
    { k: 'Vendor',    v: 'Sysco Produce Co.' },
    { k: 'Invoice #', v: 'INV-2026-04-0842'  },
    { k: 'Date',      v: 'Apr 22, 2026'      },
    { k: 'Due',       v: 'May 6, 2026 · Net 14' },
    { k: 'Venue',     v: 'Ocean Club'        },
    { k: 'Category',  v: 'Produce',          editable: true },
    { k: 'GL code',   v: '5100 · Food — Produce' },
  ],
}

// Ross observation — structured parts so bolds are safe.
export const OBSERVATION = {
  eyebrow: 'Ross noticed',
  parts: [
    { type: 'text',   value: 'Tomato roma is ' },
    { type: 'strong', value: 'R81/kg' },
    { type: 'text',   value: ' this week, up from ' },
    { type: 'strong', value: 'R58/kg' },
    { type: 'text',   value: " two weeks ago. That's a 40% jump. Consider swapping to canned for sauces until prices settle (est. save R3,240/wk)." },
  ],
  action: 'Compare vendors',
}

export const MATCHING = {
  eyebrow: 'Matching',
  poNumber: '#2026-0418',
  confidence: '99.4% confidence · 18 of 18 line items',
  viewLink: 'view PO →',
}

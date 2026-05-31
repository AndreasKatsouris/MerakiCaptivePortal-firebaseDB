'use strict';

/**
 * Phase 7 ① Credit Ledger — shared constants.
 *
 * The ledger is USD-denominated in v1 (no FX). It mirrors Anthropic's own
 * USD prepaid-wallet billing 1:1; ZAR / multi-currency display + collection
 * is a future "go global" layer in ③ Payment Rail. Every usage/credits record
 * carries `currency: 'USD'` so the model already supports multi-currency.
 *
 * Spec: docs/plans/2026-05-31-metering-credit-ledger-design.md
 */

// Pre-flight balance gate floor (USD cents). A turn is only authorised when the
// balance exceeds this. ~a few typical Sonnet turns of headroom; the final value
// is owned by the ② Agent UX spec (§10.3). Named, not a magic number.
const DEFAULT_MIN_BALANCE_CENTS = 50;

// Default Anthropic cache multipliers (relative to base input price).
const DEFAULT_CACHE_WRITE_MULT = 1.25; // 5-minute cache write
const DEFAULT_CACHE_READ_MULT = 0.10;  // cache read / hit

// Global passthrough markup on wholesale cost (§10.1). Lives in priceTable/markup
// at runtime; this is the seed default.
const DEFAULT_MARKUP = 1.30;

// v1 ledger currency. Stored per-record for future multi-currency.
const LEDGER_CURRENCY = 'USD';

// Billing services the ledger meters. v1 implements only the token path (askRoss);
// OCR / WhatsApp slot in later via the generic `units` shape + their own rate path.
const SERVICES = Object.freeze({
    ASK_ROSS: 'askRoss',
});

module.exports = {
    DEFAULT_MIN_BALANCE_CENTS,
    DEFAULT_CACHE_WRITE_MULT,
    DEFAULT_CACHE_READ_MULT,
    DEFAULT_MARKUP,
    LEDGER_CURRENCY,
    SERVICES,
};

// public/js/receipt-management/receipt-details-html.js
//
// Builds the admin "Receipt Details" modal body. Extracted from
// receipt-management.js's viewReceipt() so it can be guard-tested — the same
// pure-helper shape as its siblings reward-payload.js and receipt-image-url.js.
//
// SECURITY — every `receipt.*` field below is TENANT-CONTROLLED, not just
// OCR output. `receipts` root `.write` is `auth != null` with NO child rules
// (database.rules.json:131-135, live Critical bug-triage row), so any
// authenticated account can write any field of any receipt, and this string
// goes to `Swal.fire({ html })`, i.e. straight into innerHTML. Unescaped, a
// stored `" onerror="…` in ANY of ~12 fields is stored XSS executing in an
// admin's session. Escaping is therefore not optional here and not limited to
// the image URL — the image URL was merely the field CRIT-09 drew attention to.
//
// Numeric-looking fields are coerced with Number() before .toFixed(), because
// `${item.quantity || 0}` passes a STRING straight through (a truthy
// '<img onerror=…>' is not replaced by 0) and `.toFixed` on a string throws,
// which would blank the modal for the admin — a denial of the review workflow.

import { escapeHtml, safeHttpUrl } from '../utils/html-escape.js';

/** Coerce to a finite number for display; anything else renders as 0. */
function money(value) {
    const n = Number(value);
    return (Number.isFinite(n) ? n : 0).toFixed(2);
}

/** Quantities are displayed as-is but must never be raw markup. */
function quantity(value) {
    const n = Number(value);
    return Number.isFinite(n) ? String(n) : '0';
}

function buildItemRows(items) {
    if (!Array.isArray(items)) return '';
    return items.map((item) => `
                    <tr>
                        <td>${escapeHtml(item?.name || 'N/A')}</td>
                        <td>${quantity(item?.quantity)}</td>
                        <td>R${money(item?.unitPrice)}</td>
                        <td>R${money(item?.totalPrice)}</td>
                    </tr>
                `).join('');
}

/**
 * @param {object} receipt - the receipts/{id} record (fully tenant-controlled)
 * @param {string|null} receiptImageSrc - resolved by resolveReceiptImageSrc()
 * @param {(status: string) => string} statusBadgeClass - caller's class mapper
 * @returns {string} HTML safe to hand to Swal.fire({ html })
 */
export function buildReceiptDetailsHtml(receipt, receiptImageSrc, statusBadgeClass) {
    const r = receipt || {};
    const imageSrc = safeHttpUrl(receiptImageSrc);
    const badgeClass = typeof statusBadgeClass === 'function' ? statusBadgeClass(r.status) : '';

    return `
                        <div class="receipt-details">
                            <div class="store-info mb-3">
                                <h5>${escapeHtml(r.fullStoreName || r.brandName)}</h5>
                                <p>${escapeHtml(r.storeAddress || '')}</p>
                            </div>

                            <div class="receipt-meta mb-3">
                                <p><strong>Invoice Number:</strong> ${escapeHtml(r.invoiceNumber)}</p>
                                <p><strong>Date:</strong> ${escapeHtml(r.date)} ${escapeHtml(r.time || '')}</p>
                                <p><strong>Guest Phone:</strong> ${escapeHtml(r.guestPhoneNumber)}</p>
                                <p><strong>Table:</strong> ${escapeHtml(r.tableNumber || 'N/A')}</p>
                                <p><strong>Waiter:</strong> ${escapeHtml(r.waiterName || 'N/A')}</p>
                                <p><strong>Status:</strong> <span class="badge ${escapeHtml(badgeClass)}">${escapeHtml(r.status)}</span></p>
                            </div>

                            <div class="items-table mb-3">
                                <table class="table table-sm">
                                    <thead>
                                        <tr>
                                            <th>Item</th>
                                            <th>Qty</th>
                                            <th>Unit Price</th>
                                            <th>Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${buildItemRows(r.items)}
                                    </tbody>
                                </table>
                            </div>

                            <div class="totals mb-3">
                                <p><strong>Subtotal:</strong> R${money(r.subtotal)}</p>
                                <p><strong>VAT (15%):</strong> R${money(r.vatAmount)}</p>
                                <p><strong>Total Amount:</strong> R${money(r.totalAmount)}</p>
                            </div>

                            ${imageSrc ? `
                                <div class="receipt-image mb-3">
                                    <h6>Receipt Image</h6>
                                    <img src="${escapeHtml(imageSrc)}" alt="Receipt" class="img-fluid">
                                </div>
                            ` : ''}
                        </div>
                    `;
}

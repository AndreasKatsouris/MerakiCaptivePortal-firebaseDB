// Guard: the reward payload receipt-management.js writes to `rewards/{rewardId}`
// must satisfy rewards/$rewardId .validate in database.rules.json, which requires
// newData.hasChildren(['metadata', 'status', 'value', 'expiresAt']) — the pre-fix
// payload ({receiptId, campaignId, guestPhoneNumber, totalAmount, status, createdAt,
// createdBy}) was missing metadata/value/expiresAt and was rejected by the rules
// regardless of caller identity. Fix mirrors reward-management.js:657's manual
// reward-issue shape. Automation queue card Q5.
import { describe, it, expect } from 'vitest'
import { buildRewardPayload } from '../../public/js/receipt-management/reward-payload.js'

const RECEIPT = { id: 'receipt_1', campaignId: 'campaign_1', totalAmount: 150, guestPhoneNumber: 'whatsapp:+27821234567' }
const CAMPAIGN_NO_TYPE = { id: 'campaign_1', name: 'Weekly Special', rewardTypes: [] }
const CAMPAIGN_WITH_TYPE = {
  id: 'campaign_1',
  name: 'Weekly Special',
  rewardTypes: [{ typeId: 'type_1', criteria: {} }]
}
const REWARD_TYPES = [
  { id: 'type_1', name: 'R50 Voucher', category: 'voucher', value: '50', validityDays: 14 }
]
const CTX = { normalizedPhone: '+27821234567', createdBy: 'uid_admin', now: 1000 }

describe('buildRewardPayload (rewards/$rewardId .validate guard)', () => {
  it('includes every key the rules .validate requires: metadata, status, value, expiresAt', () => {
    const payload = buildRewardPayload(RECEIPT, CAMPAIGN_NO_TYPE, REWARD_TYPES, CTX)
    expect(payload).toHaveProperty('metadata')
    expect(payload).toHaveProperty('status')
    expect(payload).toHaveProperty('value')
    expect(payload).toHaveProperty('expiresAt')
  })

  it('uses guestPhone (not guestPhoneNumber) — the field name every other reward consumer reads', () => {
    const payload = buildRewardPayload(RECEIPT, CAMPAIGN_NO_TYPE, REWARD_TYPES, CTX)
    expect(payload.guestPhone).toBe('+27821234567')
    expect(payload).not.toHaveProperty('guestPhoneNumber')
  })

  it('resolves value/validityDays from the campaign-linked reward type when present', () => {
    const payload = buildRewardPayload(RECEIPT, CAMPAIGN_WITH_TYPE, REWARD_TYPES, CTX)
    expect(payload.value).toBe(50)
    expect(payload.expiresAt).toBe(1000 + 14 * 24 * 60 * 60 * 1000)
    expect(payload.metadata.type).toBe('voucher')
  })

  it('falls back to a 30-day / zero-value default when the campaign has no linked reward type', () => {
    const payload = buildRewardPayload(RECEIPT, CAMPAIGN_NO_TYPE, REWARD_TYPES, CTX)
    expect(payload.value).toBe(0)
    expect(payload.expiresAt).toBe(1000 + 30 * 24 * 60 * 60 * 1000)
  })

  it('preserves receiptId/campaignId — findAssociatedRewards() and campaign-rewards indexing depend on them', () => {
    const payload = buildRewardPayload(RECEIPT, CAMPAIGN_NO_TYPE, REWARD_TYPES, CTX)
    expect(payload.receiptId).toBe('receipt_1')
    expect(payload.campaignId).toBe('campaign_1')
  })
})

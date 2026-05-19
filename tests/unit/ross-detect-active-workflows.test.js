import { describe, test, expect, vi, beforeEach } from 'vitest'

// Mock the service module BEFORE importing detectActiveWorkflows.
vi.mock('../../public/js/modules/ross/v2/ross-service.js', () => ({
  getHomeWorkflowDigest: vi.fn(),
}))

import { detectActiveWorkflows } from '../../public/js/modules/ross/v2/detectors.js'
import { getHomeWorkflowDigest } from '../../public/js/modules/ross/v2/ross-service.js'

const baseCtx = { uid: 'u1', locationIds: ['locA'], locations: { locA: 'Ocean Club' }, now: Date.parse('2026-05-19T12:00:00Z') }

function digest(overrides = {}) {
  return {
    success: true,
    hasActiveWorkflows: false,
    activeWorkflowCount: 0,
    upcoming: null,
    overdue: [],
    today: [],
    recentCompletions: [],
    generatedAt: baseCtx.now,
    ...overrides,
  }
}

beforeEach(() => {
  getHomeWorkflowDigest.mockReset()
})

describe('detectActiveWorkflows priority + variants', () => {
  test('overdue → variant A card (tone warn, chip Overdue, run href with workflowId/locationId)', async () => {
    getHomeWorkflowDigest.mockResolvedValue(digest({
      hasActiveWorkflows: true,
      activeWorkflowCount: 1,
      overdue: [{
        workflowId: 'w1', locationId: 'locA',
        name: 'Daily Opening', locationName: 'Ocean Club',
        nextDueDate: '2026-05-18', daysLate: 1, requiredTaskCount: 7,
      }],
    }))
    const card = await detectActiveWorkflows(baseCtx)
    expect(card).toBeTruthy()
    expect(card.id).toBe('workflow:w1:locA')
    expect(card.tone).toBe('warn')
    expect(card.chip.label).toBe('Overdue')
    const runAction = card.actions.find(a => a.id === 'run-workflow')
    expect(runAction.href).toBe('/ross.html?tab=run&workflowId=w1&locationId=locA')
    expect(card.headline).toContain('Daily Opening')
    expect(card.headline).toContain('Ocean Club')
    expect(card.headline).toContain('1 day late')
  })

  test('overdue plural daysLate → "days late"', async () => {
    getHomeWorkflowDigest.mockResolvedValue(digest({
      hasActiveWorkflows: true,
      activeWorkflowCount: 1,
      overdue: [{
        workflowId: 'w1', locationId: 'locA',
        name: 'X', locationName: 'A',
        nextDueDate: '2026-05-16', daysLate: 3, requiredTaskCount: 3,
      }],
    }))
    const card = await detectActiveWorkflows(baseCtx)
    expect(card.headline).toContain('3 days late')
    // 3 days is still under the Missed threshold → keeps "Overdue" framing
    expect(card.chip.label).toBe('Overdue')
  })

  test('overdue plural (3 overdue) → aggSuffix + footnote', async () => {
    getHomeWorkflowDigest.mockResolvedValue(digest({
      hasActiveWorkflows: true,
      activeWorkflowCount: 3,
      overdue: [
        { workflowId: 'w1', locationId: 'locA', name: 'A', locationName: 'X', nextDueDate: '2026-05-16', daysLate: 3, requiredTaskCount: 3 },
        { workflowId: 'w2', locationId: 'locB', name: 'B', locationName: 'Y', nextDueDate: '2026-05-17', daysLate: 2, requiredTaskCount: 1 },
        { workflowId: 'w3', locationId: 'locC', name: 'C', locationName: 'Z', nextDueDate: '2026-05-18', daysLate: 1, requiredTaskCount: 2 },
      ],
    }))
    const card = await detectActiveWorkflows(baseCtx)
    expect(card.detail).toContain('And 2 more')
    expect(card.footnote).toBe('3 workflows overdue')
  })

  // Missed-threshold tests (per operator design call on PR #72):
  // daysLate ≥ 4 swaps the chip label, headline verb, footnote wording,
  // and sidecar target copy from "overdue" framing to "missed" framing.
  test('daysLate=4 → chip flips to "Missed" + headline uses "has been missed"', async () => {
    getHomeWorkflowDigest.mockResolvedValue(digest({
      hasActiveWorkflows: true,
      activeWorkflowCount: 1,
      overdue: [{
        workflowId: 'w1', locationId: 'locA',
        name: 'Weekly Deep Clean', locationName: 'Ocean Club',
        nextDueDate: '2026-05-15', daysLate: 4, requiredTaskCount: 5,
      }],
    }))
    const card = await detectActiveWorkflows(baseCtx)
    expect(card.chip.label).toBe('Missed')
    expect(card.headline).toContain('has been missed')
    expect(card.headline).toContain('Weekly Deep Clean')
    expect(card.headline).toContain('4 days late')
    expect(card.sidecar.target).toBe('untouched')
  })

  test('daysLate=3 → still "Overdue" (boundary)', async () => {
    getHomeWorkflowDigest.mockResolvedValue(digest({
      hasActiveWorkflows: true,
      activeWorkflowCount: 1,
      overdue: [{
        workflowId: 'w1', locationId: 'locA',
        name: 'X', locationName: 'A',
        nextDueDate: '2026-05-16', daysLate: 3, requiredTaskCount: 1,
      }],
    }))
    const card = await detectActiveWorkflows(baseCtx)
    expect(card.chip.label).toBe('Overdue')
    expect(card.headline).toContain('is overdue')
    expect(card.sidecar.target).toBe('target: 0 overdue')
  })

  test('multiple missed → aggSuffix + footnote use "missed" wording', async () => {
    getHomeWorkflowDigest.mockResolvedValue(digest({
      hasActiveWorkflows: true,
      activeWorkflowCount: 2,
      overdue: [
        { workflowId: 'w1', locationId: 'locA', name: 'A', locationName: 'X', nextDueDate: '2026-05-10', daysLate: 9, requiredTaskCount: 3 },
        { workflowId: 'w2', locationId: 'locB', name: 'B', locationName: 'Y', nextDueDate: '2026-05-12', daysLate: 7, requiredTaskCount: 1 },
      ],
    }))
    const card = await detectActiveWorkflows(baseCtx)
    expect(card.chip.label).toBe('Missed')
    expect(card.detail).toContain('And 1 more venue missed')
    expect(card.footnote).toBe('2 workflows missed')
  })

  test('today/in_progress → variant B (donut, Resume run)', async () => {
    getHomeWorkflowDigest.mockResolvedValue(digest({
      hasActiveWorkflows: true,
      activeWorkflowCount: 1,
      today: [{
        workflowId: 'w1', locationId: 'locA',
        name: 'Daily Opening', locationName: 'Ocean Club',
        nextDueDate: '2026-05-19',
        subState: 'in_progress',
        runId: 'r1', startedAt: baseCtx.now - 3_600_000,
        completedTaskCount: 3, requiredTaskCount: 7,
      }],
    }))
    const card = await detectActiveWorkflows(baseCtx)
    expect(card.chip.label).toBe('In progress')
    expect(card.sidecar.kind).toBe('donut')
    expect(card.sidecar.value).toBeCloseTo(3 / 7, 5)
    expect(card.sidecar.sub).toBe('3/7')
    const runAction = card.actions.find(a => a.id === 'run-workflow')
    expect(runAction.label).toBe('Resume run')
    expect(runAction.href).toBe('/ross.html?tab=run&workflowId=w1&locationId=locA')
  })

  test('today/pending → variant C (kpi-spark, Start run)', async () => {
    getHomeWorkflowDigest.mockResolvedValue(digest({
      hasActiveWorkflows: true,
      activeWorkflowCount: 1,
      today: [{
        workflowId: 'w1', locationId: 'locA',
        name: 'Daily Opening', locationName: 'Ocean Club',
        nextDueDate: '2026-05-19',
        subState: 'pending', requiredTaskCount: 7,
      }],
    }))
    const card = await detectActiveWorkflows(baseCtx)
    expect(card.chip.label).toBe('Due today')
    expect(card.sidecar.kind).toBe('kpi-spark')
    expect(card.sidecar.value).toBe(7)
    const runAction = card.actions.find(a => a.id === 'run-workflow')
    expect(runAction.label).toBe('Start run')
    expect(runAction.href).toBe('/ross.html?tab=run&workflowId=w1&locationId=locA')
  })

  test('recentCompletions 0 flagged → variant D good', async () => {
    getHomeWorkflowDigest.mockResolvedValue(digest({
      hasActiveWorkflows: true,
      activeWorkflowCount: 1,
      recentCompletions: [{
        workflowId: 'w1', locationId: 'locA',
        name: 'Daily Opening', locationName: 'Ocean Club',
        runId: 'r1', completedAt: baseCtx.now - 3_600_000,
        onTime: true, flaggedCount: 0, nextDueDate: '2026-05-20',
      }],
    }))
    const card = await detectActiveWorkflows(baseCtx)
    expect(card.tone).toBe('good')
    expect(card.chip.label).toBe('Just completed')
    expect(card.actions.find(a => a.id === 'see-report').href).toBe('/ross.html?tab=activity')
  })

  test('recentCompletions with flaggedCount > 0 → variant D warn', async () => {
    getHomeWorkflowDigest.mockResolvedValue(digest({
      hasActiveWorkflows: true,
      activeWorkflowCount: 1,
      recentCompletions: [{
        workflowId: 'w1', locationId: 'locA',
        name: 'X', locationName: 'Y',
        runId: 'r1', completedAt: baseCtx.now - 3_600_000,
        onTime: true, flaggedCount: 2, nextDueDate: '2026-05-20',
      }],
    }))
    const card = await detectActiveWorkflows(baseCtx)
    expect(card.tone).toBe('warn')
    expect(card.chip.label).toBe('Completed with flags')
    expect(card.detail).toContain('2 responses flagged')
  })

  test('all-clear → variant E (chip All clear, footnote count)', async () => {
    getHomeWorkflowDigest.mockResolvedValue(digest({
      hasActiveWorkflows: true,
      activeWorkflowCount: 3,
      upcoming: {
        workflowId: 'w1', locationId: 'locA',
        name: 'Daily Opening', locationName: 'Ocean Club',
        nextDueDate: '2026-05-20',
      },
    }))
    const card = await detectActiveWorkflows(baseCtx)
    expect(card.chip.label).toBe('All clear')
    expect(card.tone).toBe('good')
    expect(card.footnote).toContain('3 workflows running')
    expect(card.detail).toContain('2026-05-20')
  })

  test('no workflows at all → returns null', async () => {
    getHomeWorkflowDigest.mockResolvedValue(digest({
      hasActiveWorkflows: false,
      activeWorkflowCount: 0,
    }))
    const card = await detectActiveWorkflows(baseCtx)
    expect(card).toBeNull()
  })

  test('CF throws → returns null (no exception propagation)', async () => {
    getHomeWorkflowDigest.mockRejectedValue(new Error('network down'))
    const card = await detectActiveWorkflows(baseCtx)
    expect(card).toBeNull()
  })

  test('priority: overdue beats today + recent', async () => {
    getHomeWorkflowDigest.mockResolvedValue(digest({
      hasActiveWorkflows: true,
      activeWorkflowCount: 1,
      overdue: [{ workflowId: 'w1', locationId: 'locA', name: 'A', locationName: 'X', nextDueDate: '2026-05-18', daysLate: 1, requiredTaskCount: 1 }],
      today: [{ workflowId: 'w2', locationId: 'locB', name: 'B', locationName: 'Y', nextDueDate: '2026-05-19', subState: 'pending', requiredTaskCount: 1 }],
      recentCompletions: [{ workflowId: 'w3', locationId: 'locC', name: 'C', locationName: 'Z', runId: 'r9', completedAt: baseCtx.now - 1000, onTime: true, flaggedCount: 0, nextDueDate: '2026-05-20' }],
    }))
    const card = await detectActiveWorkflows(baseCtx)
    expect(card.chip.label).toBe('Overdue')
  })
})

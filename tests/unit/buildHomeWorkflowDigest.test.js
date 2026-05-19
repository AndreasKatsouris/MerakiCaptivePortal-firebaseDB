import { describe, test, expect } from 'vitest'
// ross.js uses a lazy Proxy for the Firebase db handle, so it can be required
// without a live Firebase app — no additional mocking needed here.
import { buildHomeWorkflowDigest } from '../../functions/ross.js'

const DAY = 86_400_000
const baseNow = Date.parse('2026-05-19T08:00:00Z')

function mkWorkflow(id, name, locations, status = 'active') {
  return { workflowId: id, name, status, locations }
}

function mkLocation(name, nextDueDate, tasks = {}) {
  return { locationName: name, nextDueDate, tasks }
}

function mkTask(required = true) {
  return { title: 't', required }
}

function mkRun(overrides = {}) {
  return {
    runId: 'r1',
    status: 'in_progress',
    startedAt: baseNow - 3_600_000,
    responses: {},
    ...overrides,
  }
}

describe('buildHomeWorkflowDigest', () => {
  test('empty inputs return empty buckets + hasActiveWorkflows false', () => {
    const d = buildHomeWorkflowDigest({ workflows: {}, runs: {}, clientToday: '2026-05-19', now: baseNow })
    expect(d.overdue).toEqual([])
    expect(d.today).toEqual([])
    expect(d.recentCompletions).toEqual([])
    expect(d.hasActiveWorkflows).toBe(false)
    expect(d.activeWorkflowCount).toBe(0)
    expect(d.upcoming).toBeNull()
    expect(d.generatedAt).toBe(baseNow)
  })

  test('workflow with nextDueDate yesterday, no run → overdue', () => {
    const workflows = {
      w1: mkWorkflow('w1', 'Daily Opening', {
        locA: mkLocation('Ocean Club', '2026-05-18', { t1: mkTask(), t2: mkTask() }),
      }),
    }
    const d = buildHomeWorkflowDigest({ workflows, runs: {}, clientToday: '2026-05-19', now: baseNow })
    expect(d.overdue).toHaveLength(1)
    expect(d.overdue[0]).toMatchObject({
      workflowId: 'w1',
      locationId: 'locA',
      name: 'Daily Opening',
      locationName: 'Ocean Club',
      nextDueDate: '2026-05-18',
      daysLate: 1,
      requiredTaskCount: 2,
    })
  })

  test('workflow with nextDueDate today, no run → today/pending', () => {
    const workflows = {
      w1: mkWorkflow('w1', 'Daily Opening', {
        locA: mkLocation('Ocean Club', '2026-05-19', { t1: mkTask() }),
      }),
    }
    const d = buildHomeWorkflowDigest({ workflows, runs: {}, clientToday: '2026-05-19', now: baseNow })
    expect(d.today).toHaveLength(1)
    expect(d.today[0].subState).toBe('pending')
    expect(d.today[0].requiredTaskCount).toBe(1)
  })

  test('workflow with in-progress run today, 2 of 5 responded → today/in_progress', () => {
    const workflows = {
      w1: mkWorkflow('w1', 'Daily Opening', {
        locA: mkLocation('Ocean Club', '2026-05-19', {
          t1: mkTask(), t2: mkTask(), t3: mkTask(), t4: mkTask(), t5: mkTask(),
        }),
      }),
    }
    const runs = {
      w1: {
        locA: {
          r1: mkRun({
            runId: 'r1',
            status: 'in_progress',
            startedAt: baseNow - 1_800_000,
            responses: { t1: { value: 'on' }, t2: { value: 'on' } },
          }),
        },
      },
    }
    const d = buildHomeWorkflowDigest({ workflows, runs, clientToday: '2026-05-19', now: baseNow })
    expect(d.today).toHaveLength(1)
    expect(d.today[0]).toMatchObject({
      subState: 'in_progress',
      runId: 'r1',
      completedTaskCount: 2,
      requiredTaskCount: 5,
    })
  })

  test('completed run 1h ago, on time, 0 flagged → recentCompletions', () => {
    const workflows = {
      w1: mkWorkflow('w1', 'Daily Opening', {
        locA: mkLocation('Ocean Club', '2026-05-20', { t1: mkTask() }),
      }),
    }
    const runs = {
      w1: {
        locA: {
          r1: mkRun({
            runId: 'r1',
            status: 'completed',
            startedAt: baseNow - 7_200_000,
            completedAt: baseNow - 3_600_000,
            onTime: true,
            flaggedCount: 0,
            responses: { t1: { value: 'on' } },
          }),
        },
      },
    }
    const d = buildHomeWorkflowDigest({ workflows, runs, clientToday: '2026-05-19', now: baseNow })
    expect(d.recentCompletions).toHaveLength(1)
    expect(d.recentCompletions[0]).toMatchObject({
      runId: 'r1',
      onTime: true,
      flaggedCount: 0,
    })
  })

  test('completed run 25h ago → NOT in recentCompletions', () => {
    const workflows = {
      w1: mkWorkflow('w1', 'X', { locA: mkLocation('L', '2026-05-20', { t1: mkTask() }) }),
    }
    const runs = {
      w1: { locA: { r1: mkRun({
        status: 'completed',
        completedAt: baseNow - 25 * 3_600_000,
        responses: { t1: { value: 'on' } },
      }) } },
    }
    const d = buildHomeWorkflowDigest({ workflows, runs, clientToday: '2026-05-19', now: baseNow })
    expect(d.recentCompletions).toEqual([])
  })

  test('paused workflow is skipped', () => {
    const workflows = {
      w1: mkWorkflow('w1', 'X', { locA: mkLocation('L', '2026-05-18', { t1: mkTask() }) }, 'paused'),
    }
    const d = buildHomeWorkflowDigest({ workflows, runs: {}, clientToday: '2026-05-19', now: baseNow })
    expect(d.overdue).toEqual([])
    expect(d.hasActiveWorkflows).toBe(false)
  })

  test('multi-location: one overdue + one due today populates both buckets', () => {
    const workflows = {
      w1: mkWorkflow('w1', 'Opening', {
        locA: mkLocation('A', '2026-05-18', { t1: mkTask() }),
        locB: mkLocation('B', '2026-05-19', { t1: mkTask() }),
      }),
    }
    const d = buildHomeWorkflowDigest({ workflows, runs: {}, clientToday: '2026-05-19', now: baseNow })
    expect(d.overdue).toHaveLength(1)
    expect(d.today).toHaveLength(1)
    expect(d.overdue[0].locationId).toBe('locA')
    expect(d.today[0].locationId).toBe('locB')
  })

  test('malformed workflow (no locations) is skipped, no throw', () => {
    const workflows = { w1: { workflowId: 'w1', name: 'X', status: 'active' } }
    expect(() => buildHomeWorkflowDigest({
      workflows, runs: {}, clientToday: '2026-05-19', now: baseNow,
    })).not.toThrow()
  })

  test('task with required: false excluded from requiredTaskCount', () => {
    const workflows = {
      w1: mkWorkflow('w1', 'X', {
        locA: mkLocation('A', '2026-05-19', {
          t1: mkTask(true), t2: mkTask(false), t3: mkTask(true),
        }),
      }),
    }
    const d = buildHomeWorkflowDigest({ workflows, runs: {}, clientToday: '2026-05-19', now: baseNow })
    expect(d.today[0].requiredTaskCount).toBe(2)
  })

  test('run with empty responses → completedTaskCount 0', () => {
    const workflows = {
      w1: mkWorkflow('w1', 'X', {
        locA: mkLocation('A', '2026-05-19', { t1: mkTask() }),
      }),
    }
    const runs = { w1: { locA: { r1: mkRun({ responses: {} }) } } }
    const d = buildHomeWorkflowDigest({ workflows, runs, clientToday: '2026-05-19', now: baseNow })
    expect(d.today[0].completedTaskCount).toBe(0)
  })

  test('clientToday missing → uses UTC date derived from now', () => {
    const workflows = {
      w1: mkWorkflow('w1', 'X', {
        locA: mkLocation('A', '2026-05-18', { t1: mkTask() }),
      }),
    }
    const d = buildHomeWorkflowDigest({ workflows, runs: {}, now: baseNow })
    expect(d.overdue).toHaveLength(1)
  })

  test('day-zero shape: 1 active workflow, nextDueDate tomorrow → all-clear payload', () => {
    const workflows = {
      w1: mkWorkflow('w1', 'Daily Opening', {
        locA: mkLocation('Ocean Club', '2026-05-20', { t1: mkTask() }),
      }),
    }
    const d = buildHomeWorkflowDigest({ workflows, runs: {}, clientToday: '2026-05-19', now: baseNow })
    expect(d.overdue).toEqual([])
    expect(d.today).toEqual([])
    expect(d.recentCompletions).toEqual([])
    expect(d.hasActiveWorkflows).toBe(true)
    expect(d.activeWorkflowCount).toBe(1)
    expect(d.upcoming).toMatchObject({
      workflowId: 'w1',
      locationId: 'locA',
      name: 'Daily Opening',
      locationName: 'Ocean Club',
      nextDueDate: '2026-05-20',
    })
  })

  test('no workflows at all → hasActiveWorkflows false, upcoming null', () => {
    const d = buildHomeWorkflowDigest({ workflows: {}, runs: {}, clientToday: '2026-05-19', now: baseNow })
    expect(d.hasActiveWorkflows).toBe(false)
    expect(d.activeWorkflowCount).toBe(0)
    expect(d.upcoming).toBeNull()
  })

  test('overdue sorted by daysLate desc', () => {
    const workflows = {
      w1: mkWorkflow('w1', 'A', { locA: mkLocation('A', '2026-05-17', { t1: mkTask() }) }),
      w2: mkWorkflow('w2', 'B', { locB: mkLocation('B', '2026-05-15', { t1: mkTask() }) }),
    }
    const d = buildHomeWorkflowDigest({ workflows, runs: {}, clientToday: '2026-05-19', now: baseNow })
    expect(d.overdue.map(o => o.daysLate)).toEqual([4, 2])
  })

  test('today/in_progress sorts before today/pending', () => {
    const workflows = {
      w1: mkWorkflow('w1', 'A', { locA: mkLocation('A', '2026-05-19', { t1: mkTask() }) }),
      w2: mkWorkflow('w2', 'B', { locB: mkLocation('B', '2026-05-19', { t1: mkTask() }) }),
    }
    const runs = {
      w2: { locB: { r1: mkRun({ status: 'in_progress', startedAt: baseNow - 600_000, responses: {} }) } },
    }
    const d = buildHomeWorkflowDigest({ workflows, runs, clientToday: '2026-05-19', now: baseNow })
    expect(d.today[0].subState).toBe('in_progress')
    expect(d.today[0].workflowId).toBe('w2')
  })
})

import { describe, it, expect } from 'vitest';
import { countActiveWorkflows, workflowCapStatus, UNLIMITED } from '../../functions/ross-workflow-cap.js';

describe('countActiveWorkflows', () => {
  it('returns 0 for null / non-object', () => {
    expect(countActiveWorkflows(null)).toBe(0);
    expect(countActiveWorkflows(undefined)).toBe(0);
    expect(countActiveWorkflows('nope')).toBe(0);
  });

  it('counts all workflows when none are paused', () => {
    const wf = { a: { status: 'active' }, b: { status: 'active' }, c: {} };
    expect(countActiveWorkflows(wf)).toBe(3); // missing status still counts as active
  });

  it('excludes paused workflows from the count', () => {
    const wf = { a: { status: 'active' }, b: { status: 'paused' }, c: { status: 'paused' }, d: {} };
    expect(countActiveWorkflows(wf)).toBe(2); // a + d
  });
});

describe('workflowCapStatus', () => {
  it('is unlimited when maxWorkflows is absent (null/undefined)', () => {
    expect(workflowCapStatus({ maxWorkflows: null, activeCount: 99 })).toMatchObject({ allowed: true, unlimited: true });
    expect(workflowCapStatus({ maxWorkflows: undefined, activeCount: 99 })).toMatchObject({ allowed: true, unlimited: true });
  });

  it('is unlimited when maxWorkflows is the -1 sentinel (or any negative)', () => {
    expect(workflowCapStatus({ maxWorkflows: UNLIMITED, activeCount: 1000 })).toMatchObject({ allowed: true, unlimited: true });
    expect(workflowCapStatus({ maxWorkflows: -5, activeCount: 1000 })).toMatchObject({ allowed: true, unlimited: true });
  });

  it('allows creation under the cap', () => {
    expect(workflowCapStatus({ maxWorkflows: 5, activeCount: 4 })).toEqual({ allowed: true, limit: 5, current: 4 });
  });

  it('blocks creation at the cap', () => {
    expect(workflowCapStatus({ maxWorkflows: 5, activeCount: 5 })).toEqual({ allowed: false, limit: 5, current: 5 });
  });

  it('blocks creation over the cap (e.g. a downgraded user already past it)', () => {
    expect(workflowCapStatus({ maxWorkflows: 5, activeCount: 7 })).toEqual({ allowed: false, limit: 5, current: 7 });
  });

  it('superAdmin always bypasses, even over a finite cap', () => {
    expect(workflowCapStatus({ maxWorkflows: 5, activeCount: 100, isSuperAdmin: true })).toMatchObject({ allowed: true, unlimited: true });
  });

  it('treats a non-numeric limit as unlimited (defensive)', () => {
    expect(workflowCapStatus({ maxWorkflows: '5', activeCount: 99 })).toMatchObject({ allowed: true, unlimited: true });
  });
});

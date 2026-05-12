import { describe, test, expect, vi } from 'vitest';
import {
  buildLocationsFromTemplate,
  buildWorkflowRecord,
} from '../../functions/ross-workflow-builder.js';

const VALID_INPUT_TYPES = [
  'checkbox', 'number', 'temperature', 'text', 'longtext',
  'dropdown', 'rating', 'photo', 'signature', 'date',
];

function makeTemplate(overrides = {}) {
  return {
    templateId: 'tpl-fixture',
    name: 'Fixture Template',
    description: 'fixture description',
    category: 'operations',
    recurrence: 'daily',
    daysBeforeAlert: [0],
    tier: 'free',
    subtasks: [
      { order: 1, title: 'First task', daysOffset: 0 },
      { order: 2, title: 'Second task', daysOffset: 0 },
    ],
    ...overrides,
  };
}

function makeIdGenerator(prefix = 'id') {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

describe('buildLocationsFromTemplate', () => {
  test('builds one location entry per locationId', () => {
    const result = buildLocationsFromTemplate({
      template: makeTemplate(),
      locationIds: ['loc-a', 'loc-b'],
      locationNames: ['Loc A', 'Loc B'],
      locationAssignedTo: null,
      nextDueDate: 1700000000000,
      validInputTypes: VALID_INPUT_TYPES,
      generateTaskId: makeIdGenerator('task'),
      now: 1700000000000,
    });
    expect(Object.keys(result)).toEqual(['loc-a', 'loc-b']);
    expect(result['loc-a'].locationName).toBe('Loc A');
    expect(result['loc-b'].locationName).toBe('Loc B');
  });

  test('falls back to locationId when locationNames missing', () => {
    const result = buildLocationsFromTemplate({
      template: makeTemplate(),
      locationIds: ['loc-a'],
      locationNames: null,
      locationAssignedTo: null,
      nextDueDate: 1700000000000,
      validInputTypes: VALID_INPUT_TYPES,
      generateTaskId: makeIdGenerator(),
      now: 1700000000000,
    });
    expect(result['loc-a'].locationName).toBe('loc-a');
  });

  test('honours locationAssignedTo map per location', () => {
    const result = buildLocationsFromTemplate({
      template: makeTemplate(),
      locationIds: ['loc-a', 'loc-b'],
      locationNames: ['A', 'B'],
      locationAssignedTo: { 'loc-a': 'uid-1' },
      nextDueDate: 1700000000000,
      validInputTypes: VALID_INPUT_TYPES,
      generateTaskId: makeIdGenerator(),
      now: 1700000000000,
    });
    expect(result['loc-a'].locationAssignedTo).toBe('uid-1');
    expect(result['loc-b'].locationAssignedTo).toBeNull();
  });

  test('creates one task per subtask, keyed by generated id', () => {
    const result = buildLocationsFromTemplate({
      template: makeTemplate(),
      locationIds: ['loc-a'],
      locationNames: ['A'],
      locationAssignedTo: null,
      nextDueDate: 1700000000000,
      validInputTypes: VALID_INPUT_TYPES,
      generateTaskId: makeIdGenerator('task'),
      now: 1700000000000,
    });
    const taskKeys = Object.keys(result['loc-a'].tasks);
    expect(taskKeys).toEqual(['task-1', 'task-2']);
    expect(result['loc-a'].tasks['task-1'].title).toBe('First task');
    expect(result['loc-a'].tasks['task-2'].title).toBe('Second task');
  });

  test('empty subtasks yields empty tasks object', () => {
    const result = buildLocationsFromTemplate({
      template: makeTemplate({ subtasks: [] }),
      locationIds: ['loc-a'],
      locationNames: ['A'],
      locationAssignedTo: null,
      nextDueDate: 1700000000000,
      validInputTypes: VALID_INPUT_TYPES,
      generateTaskId: makeIdGenerator(),
      now: 1700000000000,
    });
    expect(result['loc-a'].tasks).toEqual({});
  });

  test('missing subtasks field treated as empty', () => {
    const result = buildLocationsFromTemplate({
      template: makeTemplate({ subtasks: undefined }),
      locationIds: ['loc-a'],
      locationNames: ['A'],
      locationAssignedTo: null,
      nextDueDate: 1700000000000,
      validInputTypes: VALID_INPUT_TYPES,
      generateTaskId: makeIdGenerator(),
      now: 1700000000000,
    });
    expect(result['loc-a'].tasks).toEqual({});
  });

  test('status, activatedAt, nextDueDate populated per location', () => {
    const result = buildLocationsFromTemplate({
      template: makeTemplate(),
      locationIds: ['loc-a'],
      locationNames: ['A'],
      locationAssignedTo: null,
      nextDueDate: 1700000000000,
      validInputTypes: VALID_INPUT_TYPES,
      generateTaskId: makeIdGenerator(),
      now: 1799999999999,
    });
    expect(result['loc-a'].status).toBe('active');
    expect(result['loc-a'].activatedAt).toBe(1799999999999);
    expect(result['loc-a'].nextDueDate).toBe(1700000000000);
  });

  test('task dueDate honours daysOffset', () => {
    const result = buildLocationsFromTemplate({
      template: makeTemplate({
        subtasks: [{ order: 1, title: 'Late task', daysOffset: 3 }],
      }),
      locationIds: ['loc-a'],
      locationNames: ['A'],
      locationAssignedTo: null,
      nextDueDate: 1700000000000,
      validInputTypes: VALID_INPUT_TYPES,
      generateTaskId: makeIdGenerator(),
      now: 1700000000000,
    });
    const task = Object.values(result['loc-a'].tasks)[0];
    expect(task.dueDate).toBe(1700000000000 + 3 * 86400000);
  });

  test('invalid inputType falls back to checkbox', () => {
    const result = buildLocationsFromTemplate({
      template: makeTemplate({
        subtasks: [{ order: 1, title: 'T', daysOffset: 0, inputType: 'frobnicate' }],
      }),
      locationIds: ['loc-a'],
      locationNames: ['A'],
      locationAssignedTo: null,
      nextDueDate: 1700000000000,
      validInputTypes: VALID_INPUT_TYPES,
      generateTaskId: makeIdGenerator(),
      now: 1700000000000,
    });
    expect(Object.values(result['loc-a'].tasks)[0].inputType).toBe('checkbox');
  });

  test('valid inputType passes through unchanged', () => {
    const result = buildLocationsFromTemplate({
      template: makeTemplate({
        subtasks: [{ order: 1, title: 'T', daysOffset: 0, inputType: 'temperature' }],
      }),
      locationIds: ['loc-a'],
      locationNames: ['A'],
      locationAssignedTo: null,
      nextDueDate: 1700000000000,
      validInputTypes: VALID_INPUT_TYPES,
      generateTaskId: makeIdGenerator(),
      now: 1700000000000,
    });
    expect(Object.values(result['loc-a'].tasks)[0].inputType).toBe('temperature');
  });

  test('empty title becomes "Untitled Task"', () => {
    const result = buildLocationsFromTemplate({
      template: makeTemplate({
        subtasks: [{ order: 1, title: '', daysOffset: 0 }],
      }),
      locationIds: ['loc-a'],
      locationNames: ['A'],
      locationAssignedTo: null,
      nextDueDate: 1700000000000,
      validInputTypes: VALID_INPUT_TYPES,
      generateTaskId: makeIdGenerator(),
      now: 1700000000000,
    });
    expect(Object.values(result['loc-a'].tasks)[0].title).toBe('Untitled Task');
  });
});

describe('buildWorkflowRecord', () => {
  test('returns workflowId, workflowData, and atomicWrite', () => {
    const out = buildWorkflowRecord({
      template: makeTemplate(),
      locationIds: ['loc-a'],
      locationNames: ['A'],
      locationAssignedTo: null,
      nextDueDate: 1700000000000,
      uid: 'uid-1',
      name: 'My Run',
      workflowId: 'wf-1',
      validInputTypes: VALID_INPUT_TYPES,
      generateTaskId: makeIdGenerator(),
      now: 1700000000000,
    });
    expect(out.workflowId).toBe('wf-1');
    expect(out.workflowData).toBeTruthy();
    expect(out.atomicWrite).toBeTruthy();
  });

  test('workflowData mirrors rossActivateWorkflow shape', () => {
    const { workflowData } = buildWorkflowRecord({
      template: makeTemplate(),
      locationIds: ['loc-a'],
      locationNames: ['A'],
      locationAssignedTo: null,
      nextDueDate: 1700000000000,
      uid: 'uid-1',
      name: null,
      workflowId: 'wf-1',
      validInputTypes: VALID_INPUT_TYPES,
      generateTaskId: makeIdGenerator(),
      now: 1700000000000,
    });
    expect(workflowData).toMatchObject({
      workflowId: 'wf-1',
      templateId: 'tpl-fixture',
      ownerId: 'uid-1',
      name: 'Fixture Template',
      description: 'fixture description',
      category: 'operations',
      recurrence: 'daily',
      customInterval: null,
      notificationChannels: ['in_app'],
      notifyPhone: null,
      notifyEmail: null,
      daysBeforeAlert: [0],
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
    });
    expect(workflowData.locations).toHaveProperty('loc-a');
  });

  test('name override wins over template name', () => {
    const { workflowData } = buildWorkflowRecord({
      template: makeTemplate(),
      locationIds: ['loc-a'],
      locationNames: ['A'],
      locationAssignedTo: null,
      nextDueDate: 1700000000000,
      uid: 'uid-1',
      name: '  Override  ',
      workflowId: 'wf-1',
      validInputTypes: VALID_INPUT_TYPES,
      generateTaskId: makeIdGenerator(),
      now: 1700000000000,
    });
    expect(workflowData.name).toBe('Override');
  });

  test('null description in template yields null in workflowData', () => {
    const { workflowData } = buildWorkflowRecord({
      template: makeTemplate({ description: '' }),
      locationIds: ['loc-a'],
      locationNames: ['A'],
      locationAssignedTo: null,
      nextDueDate: 1700000000000,
      uid: 'uid-1',
      name: null,
      workflowId: 'wf-1',
      validInputTypes: VALID_INPUT_TYPES,
      generateTaskId: makeIdGenerator(),
      now: 1700000000000,
    });
    expect(workflowData.description).toBeNull();
  });

  test('missing daysBeforeAlert falls back to [30, 7]', () => {
    const { workflowData } = buildWorkflowRecord({
      template: makeTemplate({ daysBeforeAlert: undefined }),
      locationIds: ['loc-a'],
      locationNames: ['A'],
      locationAssignedTo: null,
      nextDueDate: 1700000000000,
      uid: 'uid-1',
      name: null,
      workflowId: 'wf-1',
      validInputTypes: VALID_INPUT_TYPES,
      generateTaskId: makeIdGenerator(),
      now: 1700000000000,
    });
    expect(workflowData.daysBeforeAlert).toEqual([30, 7]);
  });

  test('atomicWrite contains workflow, ownerIndex, and per-location index', () => {
    const { atomicWrite } = buildWorkflowRecord({
      template: makeTemplate(),
      locationIds: ['loc-a', 'loc-b'],
      locationNames: ['A', 'B'],
      locationAssignedTo: null,
      nextDueDate: 1700000000000,
      uid: 'uid-1',
      name: null,
      workflowId: 'wf-1',
      validInputTypes: VALID_INPUT_TYPES,
      generateTaskId: makeIdGenerator(),
      now: 1700000000000,
    });
    expect(atomicWrite['ross/workflows/uid-1/wf-1']).toBeTruthy();
    expect(atomicWrite['ross/ownerIndex/uid-1']).toBe(true);
    expect(atomicWrite['ross/workflowsByLocation/loc-a/wf-1']).toBe('uid-1');
    expect(atomicWrite['ross/workflowsByLocation/loc-b/wf-1']).toBe('uid-1');
  });
});

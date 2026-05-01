<script setup>
// Per-(workflowId, locationId) task editor panel. Mounts inline below
// the workflow card in RossPlaybook.vue when store.editingTasksFor
// matches that pair. Lists existing tasks (sorted by `order`) plus
// an optional "new task" draft row on demand.
//
// All mutations go through rossManageTask via store.create/update/
// deleteTask. After every success the store calls load(), which
// repopulates `currentRow.tasks` and re-renders this panel.
//
// Mid-run advisory: if the workflow's locationStatus is 'active' and
// there's a nextDueDate in the past, we surface a passive warning so
// the operator knows edits may invalidate in-progress responses.
// Heuristic, not precise — Q2 in the plan.

import { computed, ref } from 'vue'
import { usePlaybookStore } from '../playbook-store.js'
import { sanitiseInputConfig } from '../constants/input-types.js'
import { HfIcon, HfButton } from '/js/design-system/hifi/index.js'
import RossPlaybookTaskRow from './RossPlaybookTaskRow.vue'

const store = usePlaybookStore()

// Stable id for the "new task" draft (same helper pattern as
// RossPlaybookTemplateEditor — see PR #30 review item #2).
function newUid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// Resolve the current (workflowId, locationId) row from store.workflows
// (already flattened by playbook-service into one entry per pair).
const pair = computed(() => store.editingTasksFor)
const currentRow = computed(() => {
  if (!pair.value) return null
  return store.workflows.find(
    (w) => w.workflowId === pair.value.workflowId && w.locationId === pair.value.locationId,
  ) || null
})

// Tasks map → sorted array. Server stores tasks as { [taskId]: task }.
// We sort by `order` then fall back to title to keep render stable
// across reloads.
const tasks = computed(() => {
  const map = currentRow.value?.tasks || {}
  return Object.entries(map)
    .map(([taskId, t]) => ({ ...t, taskId }))
    .sort((a, b) => {
      const ao = Number(a.order) || 0
      const bo = Number(b.order) || 0
      if (ao !== bo) return ao - bo
      return (a.title || '').localeCompare(b.title || '')
    })
})

// Mid-run advisory (heuristic — Q2 in the plan).
const midRunWarning = computed(() => {
  const r = currentRow.value
  if (!r) return false
  if (r.locationStatus !== 'active') return false
  const due = r.locationNextDueDate
  if (!due) return false
  return Date.now() > due
})

// --- Add-task draft -----------------------------------------------
const addingDraft = ref(null) // { _uid, title: '', inputType: 'checkbox', inputConfig: {}, required: true } | null
function startAdd() {
  if (store.taskSaving) return
  addingDraft.value = {
    _uid: newUid(),
    taskId: null,
    title: '',
    inputType: 'checkbox',
    inputConfig: {},
    required: true,
    order: tasks.value.length + 1,
  }
}
function cancelAdd() {
  addingDraft.value = null
}

// --- Mutations dispatched to store --------------------------------
async function saveExisting(taskId, taskData) {
  if (!pair.value) return
  store.clearTaskRowError(taskId)
  try {
    await store.updateTask({
      workflowId: pair.value.workflowId,
      locationId: pair.value.locationId,
      taskId,
      taskData: {
        ...taskData,
        // Sanitise the inputConfig before round-trip — strips empties,
        // dedupes dropdown options, coerces numbers.
        inputConfig: sanitiseInputConfig(taskData.inputType, taskData.inputConfig),
      },
    })
    // Re-load happens in the action; row hydration via watch on taskId.
  } catch (_) {
    // store.taskRowErrors[taskId] already populated
  }
}

async function createFromDraft(taskData) {
  if (!pair.value || !addingDraft.value) return
  try {
    await store.createTask({
      workflowId: pair.value.workflowId,
      locationId: pair.value.locationId,
      taskData: {
        ...taskData,
        inputConfig: sanitiseInputConfig(taskData.inputType, taskData.inputConfig),
        order: tasks.value.length + 1,
      },
    })
    addingDraft.value = null
  } catch (_) {
    // store.taskSaveError populated; surfaced in the panel banner.
  }
}

async function deleteExisting(taskId) {
  if (!pair.value) return
  store.clearTaskRowError(taskId)
  try {
    await store.deleteTask({
      workflowId: pair.value.workflowId,
      locationId: pair.value.locationId,
      taskId,
    })
  } catch (_) {
    // store.taskRowErrors[taskId] populated
  }
}
</script>

<template>
  <div v-if="pair && currentRow" class="tedit">
    <header class="tedit__head">
      <h3 class="tedit__title">
        Tasks
        <span class="tedit__sub hf-mono">— {{ currentRow.name }} · {{ currentRow.locationName }}</span>
      </h3>
      <button
        class="tedit__close"
        @click="store.closeTasksEditor()"
        aria-label="Close tasks editor"
      >
        <HfIcon name="x" :size="14" />
      </button>
    </header>

    <p class="tedit__caption hf-mono">
      Configure each task's input type and thresholds. Operators see these
      as the run's checklist; values that breach thresholds are
      auto-flagged in Activity.
    </p>

    <div v-if="midRunWarning" class="tedit__warn hf-mono">
      <HfIcon name="x" :size="12" />
      This workflow has an open run. Editing task type or thresholds may
      invalidate responses already submitted.
    </div>

    <!-- Panel-level save error (e.g. add-task / delete failures) -->
    <div v-if="store.taskSaveError" class="tedit__error">
      <HfIcon name="x" :size="12" />
      <span>{{ store.taskSaveError }}</span>
    </div>

    <ul class="tedit__list">
      <RossPlaybookTaskRow
        v-for="(t, i) in tasks" :key="t.taskId"
        :task="t"
        :index="i"
        :disabled="store.taskSaving && store.taskSavingTaskId !== t.taskId"
        :row-error="store.taskRowErrors[t.taskId] || ''"
        @save="(data) => saveExisting(t.taskId, data)"
        @delete="(id) => deleteExisting(id)"
      />
      <RossPlaybookTaskRow
        v-if="addingDraft"
        :key="addingDraft._uid"
        :task="addingDraft"
        :index="tasks.length"
        :is-draft="true"
        :disabled="store.taskSaving"
        @save="createFromDraft"
        @cancel="cancelAdd"
      />
    </ul>

    <div v-if="!tasks.length && !addingDraft" class="tedit__empty hf-mono">
      No tasks yet. Add one to define what the operator captures during a run.
    </div>

    <div class="tedit__add">
      <HfButton
        v-if="!addingDraft"
        variant="ghost"
        @click="startAdd"
        :disabled="store.taskSaving"
      >
        <template #leading><HfIcon name="plus" :size="13" /></template>
        Add task
      </HfButton>
    </div>
  </div>
</template>

<style scoped>
.tedit {
  border: 1px solid var(--hf-line);
  border-radius: var(--hf-radius);
  background: var(--hf-bg);
  padding: 18px 20px 20px;
  margin: 14px 0 24px;
}

.tedit__head {
  display: flex; justify-content: space-between; align-items: baseline;
  margin-bottom: 4px;
  gap: 12px;
}
.tedit__title {
  font-family: var(--hf-font-display);
  font-size: 18px; font-weight: 400; margin: 0;
}
.tedit__sub { font-size: 11px; color: var(--hf-muted); }

.tedit__close {
  background: transparent; border: 0; cursor: pointer; padding: 4px;
  color: var(--hf-muted);
}
.tedit__close:hover { color: var(--hf-fg); }

.tedit__caption {
  font-size: 11px;
  color: var(--hf-muted);
  margin: 0 0 12px;
  line-height: 1.5;
}

.tedit__warn {
  display: flex; gap: 6px; align-items: center;
  background: var(--hf-warn-bg, #fef3c7);
  color: var(--hf-warn, #92400e);
  padding: 8px 10px;
  border: 1px solid var(--hf-warn-border, #f59e0b);
  border-radius: var(--hf-radius-sm, 4px);
  font-size: 11px;
  margin-bottom: 10px;
}

.tedit__error {
  display: flex; gap: 6px; align-items: center;
  background: var(--hf-warn-bg, #fef3c7);
  color: var(--hf-warn, #92400e);
  padding: 8px 10px;
  border: 1px solid var(--hf-warn-border, #f59e0b);
  border-radius: var(--hf-radius-sm, 4px);
  font-family: var(--hf-font-mono);
  font-size: 12px;
  margin-bottom: 10px;
}

.tedit__list {
  list-style: none; padding: 0; margin: 0;
}

.tedit__empty {
  border: 1px dashed var(--hf-line);
  border-radius: var(--hf-radius);
  padding: 20px;
  text-align: center;
  font-size: 12px;
  color: var(--hf-muted);
}

.tedit__add {
  margin-top: 8px;
}
</style>

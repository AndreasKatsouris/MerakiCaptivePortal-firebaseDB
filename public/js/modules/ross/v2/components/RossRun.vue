<script setup>
import { computed, onMounted, onBeforeUnmount } from 'vue'
import { useRunStore } from '../run-store.js'
import RossRunTaskCard from './RossRunTaskCard.vue'
import RossRunSummaryBar from './RossRunSummaryBar.vue'
import RossRunCompletionBanner from './RossRunCompletionBanner.vue'
import HfButton from '../../../../design-system/hifi/components/HfButton.vue'
import HfIcon from '../../../../design-system/hifi/components/HfIcon.vue'
import HfLogo from '../../../../design-system/hifi/components/HfLogo.vue'

const props = defineProps({
  workflowId: { type: String, required: true },
  locationId: { type: String, required: true },
})

const store = useRunStore()

const tasks = computed(() => store.workflow?.tasks || [])
// Mirror server default: required: taskData.required !== false
// (functions/ross.js line 875). Template-activated tasks don't carry
// a required field, so we treat undefined as required-by-default.
const requiredTasks = computed(() => tasks.value.filter(t => t.required !== false))
const optionalTasks = computed(() => tasks.value.filter(t => t.required === false))
const requiredDone = computed(() =>
  requiredTasks.value.filter(t => t.id in store.responses).length,
)
const optionalDone = computed(() =>
  optionalTasks.value.filter(t => t.id in store.responses).length,
)
const isCompleted = computed(() => !!store.currentRun?.completedAt)

function navTo(url) {
  window.history.pushState({}, '', url)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function onSave(taskId, { value, note }) {
  store.commitResponse(taskId, value, note)
}

onMounted(() => {
  store.initRun(props.workflowId, props.locationId)
})

onBeforeUnmount(() => {
  store.reset()
})
</script>

<template>
  <section class="rross-run">
    <header class="rross-run__head">
      <button class="rross-run__back" @click="navTo('/ross.html?tab=playbook')">
        <HfIcon name="arrow" :size="14" />
        <span>Back to Playbook</span>
      </button>
      <div class="rross-run__head-meta">
        <HfLogo :size="18" />
        <span class="hf-mono rross-run__head-mono">run · {{ store.workflow?.name || '…' }}</span>
      </div>
    </header>

    <div v-if="store.loading" class="rross-run__loading">Loading run…</div>

    <div v-else-if="store.loadError" class="rross-run__error">
      <p>{{ store.loadError }}</p>
      <div class="rross-run__error-actions">
        <HfButton variant="solid" @click="store.initRun(props.workflowId, props.locationId)">Retry</HfButton>
        <HfButton variant="ghost" @click="navTo('/ross.html?tab=playbook')">Back to Playbook</HfButton>
      </div>
    </div>

    <template v-else-if="store.workflow">
      <h1 class="rross-run__title">{{ store.workflow.name }}</h1>
      <div class="rross-run__list">
        <RossRunTaskCard
          v-for="task in tasks"
          :key="task.id"
          :task="task"
          :response="store.responses[task.id] || null"
          :save-status="store.saveStatus[task.id] || 'idle'"
          :error="store.errors[task.id] || null"
          :requires-note="store.pendingNoteTaskId === task.id"
          :disabled="isCompleted"
          @save="payload => onSave(task.id, payload)"
          @dismiss-error="store.dismissError(task.id)"
        />
      </div>

      <RossRunCompletionBanner
        v-if="isCompleted"
        :run="store.currentRun"
        @back-to-playbook="navTo('/ross.html?tab=playbook')"
        @view-activity="navTo('/ross.html?tab=activity')"
      />
      <RossRunSummaryBar
        v-else
        :required-total="requiredTasks.length"
        :required-done="requiredDone"
        :optional-total="optionalTasks.length"
        :optional-done="optionalDone"
        @finish="navTo('/ross.html?tab=playbook')"
      />
    </template>
  </section>
</template>

<style scoped>
.rross-run {
  display: flex; flex-direction: column; min-height: 100vh;
  background: var(--hf-bg); color: var(--hf-ink);
  font-family: var(--hf-font-body);
}
.rross-run__head {
  padding: 14px 28px;
  border-bottom: 1px solid var(--hf-line);
  display: flex; align-items: center; justify-content: space-between;
}
.rross-run__back {
  display: inline-flex; align-items: center; gap: 6px;
  background: transparent; border: none; cursor: pointer;
  color: var(--hf-ink-2);
  font-family: var(--hf-font-body); font-size: 12px;
  padding: 4px 8px; border-radius: 4px;
}
.rross-run__back :deep(svg) { transform: rotate(180deg); }
.rross-run__back:hover { color: var(--hf-ink); background: var(--hf-paper); }
.rross-run__head-meta {
  display: flex; align-items: center; gap: 10px;
}
.rross-run__head-mono {
  font-size: 11px;
  letter-spacing: 0.14em;
  color: var(--hf-muted);
  text-transform: uppercase;
}
.rross-run__title {
  font-family: var(--hf-font-display);
  font-size: 1.5rem; line-height: 1.2;
  color: var(--hf-ink);
  margin-top: 0; margin-bottom: 0; margin-left: auto; margin-right: auto;
  padding: var(--hf-space-5) var(--hf-space-5) 0;
  max-width: 760px; width: 100%;
}
.rross-run__list { flex: 1; padding: var(--hf-space-5); max-width: 760px; width: 100%; margin-left: auto; margin-right: auto; }
.rross-run__loading, .rross-run__error {
  padding: var(--hf-space-6) var(--hf-space-5);
  text-align: center; color: var(--hf-muted);
}
.rross-run__error p { color: var(--hf-crit); margin: 0 0 var(--hf-space-3); }
.rross-run__error-actions { display: inline-flex; gap: var(--hf-space-3); justify-content: center; }
</style>

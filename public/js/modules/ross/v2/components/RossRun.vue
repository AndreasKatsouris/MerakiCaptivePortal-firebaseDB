<script setup>
import { computed, onMounted, onBeforeUnmount } from 'vue'
import { useRunStore } from '../run-store.js'
import RossRunTaskCard from './RossRunTaskCard.vue'
import RossRunSummaryBar from './RossRunSummaryBar.vue'
import RossRunCompletionBanner from './RossRunCompletionBanner.vue'
import HfButton from '../../../../design-system/hifi/components/HfButton.vue'

const props = defineProps({
  workflowId: { type: String, required: true },
  locationId: { type: String, required: true },
})

const store = useRunStore()

const tasks = computed(() => store.workflow?.tasks || [])
const requiredTasks = computed(() => tasks.value.filter(t => t.required))
const optionalTasks = computed(() => tasks.value.filter(t => !t.required))
const requiredDone = computed(() =>
  requiredTasks.value.filter(t => store.responses[t.id]).length,
)
const optionalDone = computed(() =>
  optionalTasks.value.filter(t => store.responses[t.id]).length,
)
const isCompleted = computed(() => store.currentRun?.status === 'completed')

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
      <HfButton variant="ghost" size="sm" @click="navTo('/ross.html?tab=playbook')">
        ← Back to Playbook
      </HfButton>
      <h1 class="rross-run__title">{{ store.workflow?.name || 'Run' }}</h1>
    </header>

    <div v-if="store.loading" class="rross-run__loading">Loading run…</div>

    <div v-else-if="store.loadError" class="rross-run__error">
      <p>{{ store.loadError }}</p>
      <HfButton variant="solid" @click="store.initRun(props.workflowId, props.locationId)">Retry</HfButton>
    </div>

    <template v-else-if="store.workflow">
      <div class="rross-run__list">
        <RossRunTaskCard
          v-for="task in tasks"
          :key="task.id"
          :task="task"
          :response="store.responses[task.id] || null"
          :save-status="store.saveStatus[task.id] || 'idle'"
          :error="store.errors[task.id] || null"
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
  display: flex; align-items: center; gap: var(--hf-space-4);
  padding: var(--hf-space-4) var(--hf-space-5);
  border-bottom: 1px solid var(--hf-line);
  background: var(--hf-paper);
}
.rross-run__title { font: 1.4rem/1.2 var(--hf-font-display); margin: 0; color: var(--hf-ink); }
.rross-run__list { flex: 1; padding: var(--hf-space-5); max-width: 760px; width: 100%; margin: 0 auto; }
.rross-run__loading, .rross-run__error {
  padding: var(--hf-space-6) var(--hf-space-5);
  text-align: center; color: var(--hf-muted);
}
.rross-run__error p { color: var(--hf-crit); margin: 0 0 var(--hf-space-3); }
</style>

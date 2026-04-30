<script setup>
// Project Status — internal sprint tracker.
// Reads /data/project-status.json (Claude updates it at session-end alongside
// PROJECT_BACKLOG.md). Hi-Fi v2 visual language.
import { onMounted, computed } from 'vue'
import { useProjectStatusStore } from '../store.js'
import {
  HfIcon, HfChip, HfCard, HfButton,
} from '/js/design-system/hifi/index.js'

const store = useProjectStatusStore()
onMounted(() => { if (!store.data) store.load() })

const data = computed(() => store.data)
const error = computed(() => store.error)

const phaseStatusLabel = {
  done:        'Done',
  in_progress: 'In progress',
  todo:        'To do',
  blocked:     'Blocked',
  deferred:    'Deferred',
}

const formatDate = (iso) => {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return new Intl.DateTimeFormat('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }).format(d)
  } catch { return iso }
}

const backlogTotal = computed(() => {
  const b = data.value?.backlog
  if (!b) return 0
  const sum = (k) => Array.isArray(b[k]) ? b[k].length : (typeof b[k] === 'number' ? b[k] : 0)
  return sum('high') + sum('medium') + sum('low')
})

const backlogList = (key) => {
  const v = data.value?.backlog?.[key]
  return Array.isArray(v) ? v : []
}
</script>

<template>
  <div class="ps">
    <header class="ps__topbar">
      <a href="/admin-dashboard.html" class="ps__back">
        <HfIcon name="arrow" :size="14" />
        <span>Back to admin</span>
      </a>
    </header>

    <main class="ps__main" v-if="data">
      <header class="ps__header">
        <div>
          <div class="hf-eyebrow">Sprint · {{ formatDate(data.sprint?.started) }} → ongoing</div>
          <h1 class="ps__title">Project Status</h1>
          <p class="ps__sub">{{ data.sprint?.goal }}</p>
        </div>
        <div class="ps__actions">
          <HfChip>
            <template #leading><HfIcon name="dot" :size="10" :color="'var(--hf-good)'" /></template>
            {{ data.sprint?.state || 'active' }}
          </HfChip>
          <HfChip>
            <template #leading><HfIcon name="cal" :size="12" /></template>
            Updated {{ formatDate(data.lastUpdated) }}
          </HfChip>
        </div>
      </header>

      <p class="ps__summary" v-if="data.sprint?.summary">{{ data.sprint.summary }}</p>

      <!-- Progress + counters -->
      <div class="ps__metrics">
        <HfCard :padded="false" class="ps__metric">
          <div class="hf-eyebrow">Tasks done</div>
          <div class="hf-num ps__metric-value">
            {{ data.progress.done }}<span class="ps__metric-of">/{{ data.progress.total }}</span>
          </div>
          <div class="ps__progress">
            <div class="ps__progress-fill" :style="{ width: `${data.progress.pct}%` }" />
          </div>
          <div class="hf-mono ps__metric-sub">{{ data.progress.pct }}%</div>
        </HfCard>

        <HfCard :padded="false" class="ps__metric">
          <div class="hf-eyebrow">In progress</div>
          <div class="hf-num ps__metric-value">{{ data.inProgress?.length || 0 }}</div>
          <div class="ps__metric-sub hf-mono">active branches</div>
        </HfCard>

        <HfCard :padded="false" class="ps__metric">
          <div class="hf-eyebrow">Bugs queued</div>
          <div class="hf-num ps__metric-value" :class="{ 'is-warn': (data.bugs?.length || 0) > 0 }">
            {{ data.bugs?.length || 0 }}
          </div>
          <div class="ps__metric-sub hf-mono">in triage</div>
        </HfCard>

        <HfCard :padded="false" class="ps__metric">
          <div class="hf-eyebrow">Backlog</div>
          <div class="hf-num ps__metric-value">{{ backlogTotal }}</div>
          <div class="ps__metric-sub hf-mono">items prioritised</div>
        </HfCard>
      </div>

      <!-- Phase stepper -->
      <section class="ps__panel">
        <div class="ps__panel-head">
          <h3 class="ps__panel-title">Phases</h3>
          <div class="hf-mono ps__panel-sub">Sprint roadmap</div>
        </div>
        <ol class="ps__phases">
          <li v-for="p in data.phases" :key="p.id" class="ps__phase" :data-status="p.status">
            <div class="ps__phase-marker">
              <HfIcon
                v-if="p.status === 'done'"
                name="check" :size="12" color="var(--hf-bg)"
              />
              <HfIcon
                v-else-if="p.status === 'in_progress'"
                name="dot" :size="12" color="var(--hf-bg)"
              />
              <HfIcon
                v-else-if="p.status === 'blocked'"
                name="x" :size="12" color="var(--hf-bg)"
              />
              <span v-else class="ps__phase-num">{{ p.id }}</span>
            </div>
            <div class="ps__phase-body">
              <div class="ps__phase-row">
                <span class="ps__phase-name">{{ p.name }}</span>
                <span class="ps__phase-status">{{ phaseStatusLabel[p.status] || p.status }}</span>
              </div>
              <p class="ps__phase-summary" v-if="p.summary">{{ p.summary }}</p>
            </div>
          </li>
        </ol>
      </section>

      <!-- Two columns: tasks + in-progress / recent -->
      <div class="ps__row-2">
        <HfCard :padded="false" class="ps__panel-card">
          <div class="ps__panel-head">
            <h3 class="ps__panel-title">Sprint tasks</h3>
            <div class="hf-mono ps__panel-sub">Current branch checklist</div>
          </div>
          <ul class="ps__tasks">
            <li v-for="t in data.tasks" :key="t.id" :class="['ps__task', { 'is-done': t.done }]">
              <span class="ps__task-box">
                <HfIcon v-if="t.done" name="check" :size="11" color="var(--hf-bg)" />
              </span>
              <span class="ps__task-label">{{ t.label }}</span>
              <span class="hf-mono ps__task-phase">phase {{ t.phase }}</span>
            </li>
            <li v-if="!data.tasks.length" class="ps__empty">No tasks yet.</li>
          </ul>
        </HfCard>

        <HfCard :padded="false" class="ps__panel-card">
          <div class="ps__panel-head">
            <h3 class="ps__panel-title">In progress</h3>
            <div class="hf-mono ps__panel-sub">Active branches</div>
          </div>
          <ul class="ps__branches">
            <li v-for="b in data.inProgress" :key="b.branch">
              <div class="ps__branch-row">
                <span class="hf-mono ps__branch-name">{{ b.branch }}</span>
                <span class="hf-mono ps__branch-date">{{ formatDate(b.startedAt) }}</span>
              </div>
              <p class="ps__branch-summary" v-if="b.summary">{{ b.summary }}</p>
            </li>
            <li v-if="!data.inProgress?.length" class="ps__empty">No active branches.</li>
          </ul>

          <div class="ps__panel-head ps__panel-head--later">
            <h3 class="ps__panel-title ps__panel-title--sm">Recently completed</h3>
            <div class="hf-mono ps__panel-sub">Last 5 PRs</div>
          </div>
          <ul class="ps__recent">
            <li v-for="r in data.recentlyCompleted" :key="r.pr">
              <span class="ps__recent-title">{{ r.title }}</span>
              <span class="hf-mono ps__recent-meta">#{{ r.pr }} · {{ formatDate(r.mergedAt) }}</span>
            </li>
            <li v-if="!data.recentlyCompleted?.length" class="ps__empty">Nothing merged yet.</li>
          </ul>
        </HfCard>
      </div>

      <!-- Backlog -->
      <section class="ps__panel">
        <div class="ps__panel-head">
          <h3 class="ps__panel-title">Backlog</h3>
          <div class="hf-mono ps__panel-sub">{{ backlogTotal }} items prioritised</div>
        </div>
        <div class="ps__backlog">
          <div class="ps__backlog-col">
            <div class="hf-eyebrow">High</div>
            <ul>
              <li v-for="item in backlogList('high')" :key="item">{{ item }}</li>
              <li v-if="!backlogList('high').length" class="ps__empty">Empty</li>
            </ul>
          </div>
          <div class="ps__backlog-col">
            <div class="hf-eyebrow">Medium</div>
            <ul>
              <li v-for="item in backlogList('medium')" :key="item">{{ item }}</li>
              <li v-if="!backlogList('medium').length" class="ps__empty">Empty</li>
            </ul>
          </div>
          <div class="ps__backlog-col">
            <div class="hf-eyebrow">Low</div>
            <ul>
              <li v-for="item in backlogList('low')" :key="item">{{ item }}</li>
              <li v-if="!backlogList('low').length" class="ps__empty">Empty</li>
            </ul>
          </div>
        </div>
      </section>

      <!-- Bug triage -->
      <section class="ps__panel" v-if="data.bugs?.length">
        <div class="ps__panel-head">
          <h3 class="ps__panel-title">Bug triage queue</h3>
          <div class="hf-mono ps__panel-sub">{{ data.bugs.length }} logged</div>
        </div>
        <ul class="ps__bugs">
          <li v-for="(bug, i) in data.bugs" :key="i">
            <div class="ps__bug-row">
              <span class="ps__bug-title">{{ bug.title || bug.summary }}</span>
              <span class="hf-mono ps__bug-meta">
                {{ bug.severity || 'unspecified' }} · {{ formatDate(bug.discovered) }}
              </span>
            </div>
          </li>
        </ul>
      </section>

      <footer class="ps__footer">
        <p class="hf-mono">
          Source: <code>/data/project-status.json</code> · Updated by Claude at session end alongside <code>KNOWLEDGE BASE/PROJECT_BACKLOG.md</code>.
        </p>
      </footer>
    </main>

    <div v-else-if="error" class="ps__loading">
      <div class="hf-eyebrow">Failed to load</div>
      <p class="ps__error">{{ error }}</p>
    </div>
    <div v-else class="ps__loading">
      <div class="hf-eyebrow">Loading…</div>
    </div>
  </div>
</template>

<style scoped>
.ps {
  width: 100%; min-height: 100vh;
  background: var(--hf-bg);
  display: flex; flex-direction: column;
}

.ps__topbar {
  padding: 14px 28px;
  border-bottom: 1px solid var(--hf-line);
  display: flex; align-items: center;
}
.ps__back {
  display: inline-flex; align-items: center; gap: 6px;
  color: var(--hf-ink-2);
  text-decoration: none;
  font-family: var(--hf-font-body);
  font-size: 12px;
}
.ps__back :deep(svg) { transform: rotate(180deg); }
.ps__back:hover { color: var(--hf-ink); }

.ps__main {
  padding: 28px 36px 64px;
  max-width: 1280px;
  width: 100%;
  margin: 0 auto;
  box-sizing: border-box;
}

.ps__header {
  display: flex; justify-content: space-between; align-items: flex-end;
  gap: 16px; flex-wrap: wrap;
}
.ps__title {
  font-family: var(--hf-font-display);
  font-size: 40px; letter-spacing: -0.015em;
  margin: 4px 0 0;
  font-weight: 400;
}
.ps__sub {
  margin: 8px 0 0; max-width: 720px;
  color: var(--hf-ink-2);
  font-size: 15px;
}
.ps__actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }

.ps__summary {
  margin: 16px 0 0;
  color: var(--hf-muted);
  font-size: 13px;
  max-width: 820px;
}

/* Metric tiles */
.ps__metrics {
  display: grid; grid-template-columns: repeat(4, 1fr);
  gap: 14px; margin-top: 24px;
}
@media (max-width: 960px) {
  .ps__metrics { grid-template-columns: repeat(2, 1fr); }
}
.ps__metric { padding: 16px; }
.ps__metric-value {
  font-size: 32px; margin: 4px 0 6px; line-height: 1;
}
.ps__metric-value.is-warn { color: var(--hf-warn); }
.ps__metric-of {
  font-size: 16px; color: var(--hf-muted); margin-left: 2px;
}
.ps__metric-sub {
  font-size: 11px; color: var(--hf-muted); margin-top: 6px;
}
.ps__progress {
  height: 4px; background: var(--hf-line);
  border-radius: 2px; overflow: hidden;
}
.ps__progress-fill {
  height: 100%; background: var(--hf-ink);
  transition: width 300ms var(--hf-ease);
}

/* Panel */
.ps__panel, .ps__panel-card { margin-top: 24px; padding: 0; }
.ps__panel { padding: 20px; border: 1px solid var(--hf-line-2); border-radius: var(--hf-radius-md); background: var(--hf-paper); }
.ps__panel-card { padding: 20px; }
.ps__panel-head {
  display: flex; justify-content: space-between; align-items: flex-start;
  gap: 12px;
}
.ps__panel-head--later { margin-top: 20px; }
.ps__panel-title {
  font-family: var(--hf-font-display);
  font-size: 22px; letter-spacing: -0.01em;
  margin: 0; font-weight: 400;
}
.ps__panel-title--sm { font-size: 18px; }
.ps__panel-sub { font-size: 11px; color: var(--hf-muted); margin-top: 2px; }

/* Phases */
.ps__phases {
  list-style: none; margin: 16px 0 0; padding: 0;
}
.ps__phase {
  display: grid;
  grid-template-columns: 28px 1fr;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--hf-line);
}
.ps__phase:last-child { border-bottom: none; }
.ps__phase-marker {
  width: 24px; height: 24px;
  border-radius: 50%;
  background: var(--hf-line);
  color: var(--hf-ink-2);
  display: grid; place-items: center;
  font-family: var(--hf-font-mono);
  font-size: 11px;
}
.ps__phase[data-status="done"] .ps__phase-marker { background: var(--hf-good); color: var(--hf-bg); }
.ps__phase[data-status="in_progress"] .ps__phase-marker { background: var(--hf-ink); color: var(--hf-bg); }
.ps__phase[data-status="blocked"] .ps__phase-marker { background: var(--hf-warn); color: var(--hf-bg); }
.ps__phase[data-status="deferred"] .ps__phase-marker { background: var(--hf-paper); border: 1px dashed var(--hf-line-2); color: var(--hf-muted); }

.ps__phase-num { font-weight: 500; }
.ps__phase-body { min-width: 0; }
.ps__phase-row {
  display: flex; justify-content: space-between; gap: 12px;
}
.ps__phase-name {
  font-family: var(--hf-font-body);
  font-size: 14px;
  color: var(--hf-ink);
}
.ps__phase-status {
  font-family: var(--hf-font-mono);
  font-size: 11px;
  color: var(--hf-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.ps__phase[data-status="in_progress"] .ps__phase-status { color: var(--hf-ink); }
.ps__phase[data-status="done"] .ps__phase-status { color: var(--hf-good); }
.ps__phase-summary {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--hf-muted);
}

/* Row 2 */
.ps__row-2 {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 14px; margin-top: 14px;
}
.ps__row-2 .ps__panel-card { margin-top: 0; }
.ps__row-2 > * { border: 1px solid var(--hf-line-2); border-radius: var(--hf-radius-md); background: var(--hf-paper); }
@media (max-width: 960px) {
  .ps__row-2 { grid-template-columns: 1fr; }
}

/* Tasks list */
.ps__tasks { list-style: none; margin: 14px 0 0; padding: 0; }
.ps__task {
  display: grid;
  grid-template-columns: 18px 1fr auto;
  gap: 10px; align-items: center;
  padding: 9px 0;
  border-bottom: 1px solid var(--hf-line);
  font-size: 13px;
}
.ps__task:last-child { border-bottom: none; }
.ps__task-box {
  width: 16px; height: 16px;
  border: 1px solid var(--hf-line-2);
  border-radius: 4px;
  display: grid; place-items: center;
  background: var(--hf-paper);
}
.ps__task.is-done .ps__task-box {
  background: var(--hf-ink);
  border-color: var(--hf-ink);
}
.ps__task.is-done .ps__task-label {
  color: var(--hf-muted);
  text-decoration: line-through;
}
.ps__task-label { color: var(--hf-ink); }
.ps__task-phase {
  font-size: 10px; color: var(--hf-muted);
  text-transform: uppercase; letter-spacing: 0.08em;
}

/* Branches / recent */
.ps__branches, .ps__recent { list-style: none; margin: 14px 0 0; padding: 0; }
.ps__branches li {
  padding: 10px 0;
  border-bottom: 1px solid var(--hf-line);
}
.ps__branches li:last-child { border-bottom: none; }
.ps__branch-row {
  display: flex; justify-content: space-between; gap: 8px;
}
.ps__branch-name { font-size: 13px; color: var(--hf-ink); }
.ps__branch-date { font-size: 11px; color: var(--hf-muted); }
.ps__branch-summary { margin: 4px 0 0; font-size: 12px; color: var(--hf-muted); }

.ps__recent li {
  display: flex; justify-content: space-between; gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid var(--hf-line);
  font-size: 13px;
}
.ps__recent li:last-child { border-bottom: none; }
.ps__recent-meta { color: var(--hf-muted); font-size: 11px; }

.ps__empty {
  font-family: var(--hf-font-body);
  font-size: 12px;
  color: var(--hf-muted);
  font-style: italic;
}

/* Backlog */
.ps__backlog {
  display: grid; grid-template-columns: repeat(3, 1fr);
  gap: 14px; margin-top: 16px;
}
@media (max-width: 960px) {
  .ps__backlog { grid-template-columns: 1fr; }
}
.ps__backlog-col ul {
  list-style: none; margin: 8px 0 0; padding: 0;
}
.ps__backlog-col li {
  font-size: 13px;
  color: var(--hf-ink);
  padding: 6px 0;
  border-bottom: 1px solid var(--hf-line);
}
.ps__backlog-col li:last-child { border-bottom: none; }

/* Bugs */
.ps__bugs { list-style: none; margin: 14px 0 0; padding: 0; }
.ps__bug-row { display: flex; justify-content: space-between; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--hf-line); }
.ps__bug-title { font-size: 13px; }
.ps__bug-meta { font-size: 11px; color: var(--hf-muted); }

/* Footer */
.ps__footer {
  margin-top: 32px;
  padding-top: 16px;
  border-top: 1px solid var(--hf-line);
  color: var(--hf-muted);
  font-size: 11px;
}
.ps__footer code {
  background: var(--hf-paper);
  border: 1px solid var(--hf-line);
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
}

.ps__loading {
  min-height: 60vh;
  display: grid; place-items: center;
  text-align: center;
}
.ps__error { margin: 12px 0 0; color: var(--hf-warn); font-family: var(--hf-font-mono); font-size: 12px; }
</style>

<script setup>
// Activity — what Ross has done. Execution log of the playbook.
//
// Mental-model framing: today every row is a human-walked workflow run;
// once the agent is online the same shape will hold agent-run rows
// indistinguishably (agent vs. human becomes a chip in the row).
//
// First cut renders three layers:
//   1. Stat tiles — total workflows, overdue, on-track, avg completion
//   2. Recent activity feed — last 20 completions across the estate
//   3. Workflows table — one row per (workflowId × locationId) with
//      status, completion rate, next due. Click → drill-down into the
//      run history for that pair (rossGetRunHistory under the hood).
import { onMounted, computed, ref } from 'vue'
import { useActivityStore } from '../activity-store.js'
import {
  HfIcon, HfChip, HfCard, HfButton, HfLogo,
} from '/js/design-system/hifi/index.js'

const store = useActivityStore()
onMounted(() => { if (!store.rows.length) store.load() })

const loading = computed(() => store.loading)
const error = computed(() => store.error)
const rows = computed(() => store.rows)

// Group rows by workflow id so the table renders one section per workflow
const grouped = computed(() => {
  const by = new Map()
  for (const r of rows.value) {
    const key = r.workflowId
    if (!by.has(key)) by.set(key, { workflowId: key, name: r.name, category: r.category, locations: [] })
    by.get(key).locations.push(r)
  }
  return Array.from(by.values())
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
})

const recent = computed(() => store.recentHistory)

const dateZA = new Intl.DateTimeFormat('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
const timeZA = new Intl.DateTimeFormat('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false })

function formatTs(ts) {
  if (!ts) return '—'
  const d = new Date(Number(ts))
  return `${dateZA.format(d)} · ${timeZA.format(d)}`
}
function formatDueDate(d) {
  if (!d) return '—'
  // server returns ISO yyyy-mm-dd or full ISO
  try {
    const date = typeof d === 'string' ? new Date(d) : new Date(Number(d))
    if (Number.isNaN(date.getTime())) return d
    return dateZA.format(date)
  } catch { return String(d) }
}

function statusTone(status) {
  if (status === 'overdue') return 'warn'
  if (status === 'completed') return 'good'
  if (status === 'paused') return 'muted'
  return 'default'
}

const drillKey = computed(() => store.drillKey)
function isDrilled(r) {
  return drillKey.value === `${r.workflowId}::${r.locationId}`
}
function toggleDrill(r) {
  if (isDrilled(r)) store.closeDrill()
  else store.loadDrill({ workflowId: r.workflowId, locationId: r.locationId })
}

function backToHome() {
  if (typeof window === 'undefined') return
  window.history.pushState({}, '', '/ross.html')
  window.dispatchEvent(new PopStateEvent('popstate'))
}
</script>

<template>
  <div class="activity">
    <header class="activity__head">
      <button class="activity__back" @click="backToHome">
        <HfIcon name="arrow" :size="14" />
        <span>Back to Ross</span>
      </button>
      <div class="activity__head-meta">
        <HfLogo :size="18" />
        <span class="hf-mono activity__head-mono">activity · execution log</span>
      </div>
    </header>

    <main class="activity__main">
      <section class="activity__intro">
        <div class="hf-eyebrow">
          <HfIcon name="line" :size="11" color="var(--hf-accent)" />
          Ross's activity
        </div>
        <h1 class="activity__title">
          What I've done,<br />
          <span class="activity__title-italic">across your venues.</span>
        </h1>
        <p class="activity__lead">
          Every workflow execution lands here — completion rate, what got flagged,
          who did what. Today every row is human-walked; once I'm online, agent runs
          and human runs interleave in the same feed.
        </p>
      </section>

      <!-- Stat tiles -->
      <div class="activity__stats" v-if="!error">
        <HfCard :padded="false" class="activity__stat">
          <div class="hf-eyebrow">Workflows</div>
          <div class="hf-num activity__stat-value">{{ loading ? '—' : store.totalWorkflows }}</div>
          <div class="hf-mono activity__stat-sub">in scope</div>
        </HfCard>
        <HfCard :padded="false" class="activity__stat">
          <div class="hf-eyebrow">Overdue</div>
          <div
            class="hf-num activity__stat-value"
            :class="{ 'is-warn': !loading && store.overdueRows.length > 0 }"
          >
            {{ loading ? '—' : store.overdueRows.length }}
          </div>
          <div class="hf-mono activity__stat-sub">need attention</div>
        </HfCard>
        <HfCard :padded="false" class="activity__stat">
          <div class="hf-eyebrow">On-track rows</div>
          <div class="hf-num activity__stat-value">{{ loading ? '—' : store.onTrackRows.length }}</div>
          <div class="hf-mono activity__stat-sub">workflow × venue</div>
        </HfCard>
        <HfCard :padded="false" class="activity__stat">
          <div class="hf-eyebrow">Avg completion</div>
          <div class="hf-num activity__stat-value">
            {{ loading ? '—' : `${store.averageCompletion}%` }}
          </div>
          <div class="hf-mono activity__stat-sub">tasks done</div>
        </HfCard>
      </div>

      <section v-if="loading" class="activity__loading">
        <div class="hf-eyebrow">Loading activity…</div>
      </section>

      <section v-else-if="error" class="activity__error">
        <div class="hf-eyebrow">Could not load</div>
        <p class="activity__error-msg">{{ error }}</p>
        <HfButton variant="ghost" @click="store.load()">Retry</HfButton>
      </section>

      <section v-else-if="!rows.length" class="activity__empty">
        <div class="hf-eyebrow">No activity yet</div>
        <p class="activity__empty-msg">
          Nothing's been run yet across your venues. Once a workflow executes,
          you'll see completion stats and a run history here.
        </p>
      </section>

      <template v-else>
        <!-- Recent feed -->
        <section v-if="recent.length" class="activity__panel">
          <header class="activity__panel-head">
            <h2 class="activity__panel-title">Recent completions</h2>
            <span class="hf-mono activity__panel-sub">last {{ recent.length }} across all venues</span>
          </header>
          <ul class="activity__feed">
            <li v-for="(h, i) in recent" :key="i" class="activity__feed-row">
              <span class="hf-mono activity__feed-ts">{{ formatTs(h.completedAt) }}</span>
              <span class="activity__feed-name">{{ h.workflowName }}</span>
              <span class="hf-mono activity__feed-loc">{{ h.locationName }}</span>
            </li>
          </ul>
        </section>

        <!-- Workflows table grouped by workflow -->
        <section class="activity__panel">
          <header class="activity__panel-head">
            <h2 class="activity__panel-title">Workflows</h2>
            <span class="hf-mono activity__panel-sub">click a row to see its run history</span>
          </header>
          <div class="activity__groups">
            <article
              v-for="g in grouped" :key="g.workflowId"
              class="activity__group"
            >
              <header class="activity__group-head">
                <h3 class="activity__group-title">{{ g.name }}</h3>
                <span class="hf-mono activity__group-cat">{{ g.category || 'uncategorised' }}</span>
              </header>
              <ul class="activity__rows">
                <li
                  v-for="r in g.locations" :key="r.locationId"
                  class="activity__row"
                  :data-status="r.status"
                  :class="{ 'is-open': isDrilled(r) }"
                >
                  <button class="activity__row-btn" @click="toggleDrill(r)">
                    <span class="activity__row-loc">{{ r.locationName || r.locationId }}</span>
                    <span class="activity__row-meta">
                      <HfChip :tone="statusTone(r.status)">
                        <span class="activity__dot" :class="`is-${statusTone(r.status)}`" />
                        {{ r.status || 'active' }}
                      </HfChip>
                      <span class="hf-mono activity__row-progress">
                        {{ r.tasksCompleted }}/{{ r.tasksTotal }}
                        ({{ r.completionRate }}%)
                      </span>
                      <span class="hf-mono activity__row-due">
                        due {{ formatDueDate(r.nextDueDate) }}
                      </span>
                      <HfIcon
                        name="arrow" :size="12"
                        class="activity__row-chev"
                        :class="{ 'is-open': isDrilled(r) }"
                      />
                    </span>
                  </button>

                  <!-- Drill-down panel -->
                  <div v-if="isDrilled(r)" class="activity__drill">
                    <div v-if="store.drillLoading" class="activity__drill-state">
                      <span class="hf-eyebrow">Loading run history…</span>
                    </div>
                    <div v-else-if="store.drillError" class="activity__drill-state">
                      <span class="hf-eyebrow">Failed</span>
                      <p class="activity__drill-error">{{ store.drillError }}</p>
                    </div>
                    <div v-else-if="!store.drillRuns.length" class="activity__drill-state">
                      <span class="hf-eyebrow">No completed runs yet</span>
                    </div>
                    <ul v-else class="activity__drill-runs">
                      <li v-for="run in store.drillRuns" :key="run.runId" class="activity__drill-run">
                        <span class="hf-mono activity__drill-ts">{{ formatTs(run.completedAt) }}</span>
                        <span class="activity__drill-meta">
                          <HfChip v-if="run.onTime === true" tone="good">on time</HfChip>
                          <HfChip v-else-if="run.onTime === false" tone="warn">late</HfChip>
                          <span v-if="run.flaggedCount > 0" class="hf-mono activity__drill-flagged">
                            {{ run.flaggedCount }} flagged
                          </span>
                        </span>
                      </li>
                    </ul>
                  </div>
                </li>
              </ul>
            </article>
          </div>
        </section>
      </template>

      <footer class="activity__footer">
        <p class="hf-mono">
          Once the agent is online, agent runs land in this feed alongside human runs
          with the same audit shape (timestamps, on-time, flagged tasks, actor).
        </p>
      </footer>
    </main>
  </div>
</template>

<style scoped>
.activity {
  width: 100%; min-height: 100vh;
  background: var(--hf-bg);
  display: flex; flex-direction: column;
}

.activity__head {
  padding: 14px 28px;
  border-bottom: 1px solid var(--hf-line);
  display: flex; align-items: center; justify-content: space-between;
}
.activity__back {
  display: inline-flex; align-items: center; gap: 6px;
  background: transparent; border: none; cursor: pointer;
  color: var(--hf-ink-2);
  font-family: var(--hf-font-body); font-size: 12px;
  padding: 4px 8px; border-radius: 4px;
}
.activity__back :deep(svg) { transform: rotate(180deg); }
.activity__back:hover { color: var(--hf-ink); background: var(--hf-paper); }
.activity__head-meta { display: flex; align-items: center; gap: 10px; }
.activity__head-mono {
  font-size: 11px; letter-spacing: 0.14em;
  color: var(--hf-muted); text-transform: uppercase;
}

.activity__main {
  padding: 32px 36px 64px;
  max-width: 1100px; width: 100%;
  margin: 0 auto; box-sizing: border-box;
}

.activity__intro { max-width: 720px; }
.activity__title {
  font-family: var(--hf-font-display);
  font-size: 44px; line-height: 1.05;
  letter-spacing: -0.02em;
  margin: 8px 0 16px; font-weight: 400;
}
.activity__title-italic { font-style: italic; color: var(--hf-ink-2); }
.activity__lead {
  font-size: 15px; line-height: 1.6;
  color: var(--hf-ink-2); margin: 0;
}

/* Stats */
.activity__stats {
  display: grid; grid-template-columns: repeat(4, 1fr);
  gap: 14px; margin-top: 28px;
}
@media (max-width: 960px) {
  .activity__stats { grid-template-columns: repeat(2, 1fr); }
}
.activity__stat { padding: 16px; }
.activity__stat-value {
  font-size: 32px; line-height: 1; margin: 4px 0 6px;
}
.activity__stat-value.is-warn { color: var(--hf-warn); }
.activity__stat-sub { font-size: 11px; color: var(--hf-muted); }

/* Panel scaffold */
.activity__panel {
  margin-top: 36px;
  padding: 20px;
  border: 1px solid var(--hf-line-2);
  border-radius: var(--hf-radius-md);
  background: var(--hf-paper);
}
.activity__panel-head {
  display: flex; align-items: baseline; justify-content: space-between;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--hf-line);
  padding-bottom: 8px;
}
.activity__panel-title {
  font-family: var(--hf-font-display);
  font-size: 22px; letter-spacing: -0.01em;
  font-weight: 400; margin: 0;
}
.activity__panel-sub { font-size: 11px; color: var(--hf-muted); }

/* Recent feed */
.activity__feed { list-style: none; margin: 0; padding: 0; }
.activity__feed-row {
  display: grid;
  grid-template-columns: 180px 1fr auto;
  gap: 16px; align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid var(--hf-line);
  font-size: 13px;
}
.activity__feed-row:last-child { border-bottom: none; }
.activity__feed-ts { font-size: 11px; color: var(--hf-muted); }
.activity__feed-name { color: var(--hf-ink); }
.activity__feed-loc {
  font-size: 11px; color: var(--hf-muted);
  letter-spacing: 0.04em; text-transform: lowercase;
}

/* Groups */
.activity__groups { display: flex; flex-direction: column; gap: 18px; }
.activity__group {
  border: 1px solid var(--hf-line);
  border-radius: var(--hf-radius);
  background: var(--hf-bg);
  padding: 12px;
}
.activity__group-head {
  display: flex; justify-content: space-between; align-items: baseline;
  padding: 4px 4px 8px;
}
.activity__group-title {
  font-family: var(--hf-font-body);
  font-size: 14px; font-weight: 500;
  margin: 0;
}
.activity__group-cat {
  font-size: 10px; color: var(--hf-muted);
  letter-spacing: 0.06em; text-transform: lowercase;
}

.activity__rows { list-style: none; margin: 0; padding: 0; }
.activity__row { border-top: 1px solid var(--hf-line); }
.activity__row[data-status="overdue"] {
  background: linear-gradient(90deg, rgba(212, 87, 47, 0.05), transparent 60%);
}
.activity__row-btn {
  width: 100%;
  display: flex; align-items: center; justify-content: space-between;
  background: transparent; border: none; cursor: pointer;
  padding: 10px 4px;
  font-family: var(--hf-font-body); font-size: 13px;
  color: var(--hf-ink); text-align: left;
}
.activity__row-btn:hover { background: var(--hf-paper); }
.activity__row-loc { font-weight: 500; }
.activity__row-meta {
  display: flex; align-items: center; gap: 12px;
  flex-wrap: wrap;
}
.activity__row-progress,
.activity__row-due {
  font-size: 11px; color: var(--hf-muted);
  letter-spacing: 0.04em;
}
.activity__row-chev {
  transition: transform 150ms var(--hf-ease);
}
.activity__row-chev.is-open { transform: rotate(90deg); }

.activity__dot {
  width: 8px; height: 8px; border-radius: 50%; display: inline-block;
}
.activity__dot.is-warn { background: var(--hf-warn); }
.activity__dot.is-good { background: var(--hf-good); }
.activity__dot.is-muted { background: var(--hf-muted); }
.activity__dot.is-default { background: var(--hf-ink-2); }

.activity__drill {
  padding: 10px 12px 14px;
  border-top: 1px dashed var(--hf-line);
  background: var(--hf-paper);
}
.activity__drill-state { font-size: 12px; color: var(--hf-muted); }
.activity__drill-error { color: var(--hf-warn); font-family: var(--hf-font-mono); margin: 4px 0 0; }
.activity__drill-runs { list-style: none; margin: 8px 0 0; padding: 0; }
.activity__drill-run {
  display: flex; justify-content: space-between; align-items: center;
  padding: 6px 0;
  font-size: 12px;
}
.activity__drill-ts { color: var(--hf-muted); }
.activity__drill-meta { display: flex; align-items: center; gap: 8px; }
.activity__drill-flagged { color: var(--hf-warn); }

/* States */
.activity__loading,
.activity__error,
.activity__empty {
  margin-top: 36px;
  padding: 24px;
  border: 1px dashed var(--hf-line-2);
  border-radius: var(--hf-radius-md);
  text-align: center;
  background: var(--hf-paper);
}
.activity__error-msg,
.activity__empty-msg {
  margin: 8px 0 16px;
  color: var(--hf-ink-2); font-size: 13px;
}
.activity__error-msg { color: var(--hf-warn); font-family: var(--hf-font-mono); }

.activity__footer {
  margin-top: 48px;
  padding-top: 16px;
  border-top: 1px solid var(--hf-line);
  color: var(--hf-muted); font-size: 11px;
}
</style>

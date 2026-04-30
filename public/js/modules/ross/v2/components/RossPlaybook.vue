<script setup>
// Playbook — the rules and procedures Ross runs against.
//
// Concierge-first IA: this is a deeper destination reachable from the
// home, not a sibling top-level tab. Read-only in this PR — list view
// of workflows (grouped by category) + templates. Edit / create lands
// in subsequent Phase 4 PRs (Builder consolidation).
//
// Reframing note: "workflows" / "templates" in the data model are the
// AI agent's behavioural ruleset. The copy reflects that. The CFs and
// shapes are unchanged from v1.
import { onMounted, computed } from 'vue'
import { usePlaybookStore } from '../playbook-store.js'
import {
  HfIcon, HfChip, HfCard, HfButton, HfLogo,
} from '/js/design-system/hifi/index.js'

const store = usePlaybookStore()
onMounted(() => { if (!store.workflows.length) store.load() })

const loading = computed(() => store.loading.workflows || store.loading.templates)
const error = computed(() => store.error)
const workflows = computed(() => store.workflows)
const templates = computed(() => store.templates)
const byCategory = computed(() => store.workflowsByCategory)

// Category order is intentional: compliance first (highest stakes),
// maintenance last (lowest). Unknown categories fall to the end.
const CATEGORY_ORDER = ['compliance', 'operations', 'finance', 'hr', 'maintenance', 'growth']
const CATEGORY_LABELS = {
  compliance: 'Compliance',
  operations: 'Operations',
  finance: 'Finance',
  hr: 'People & HR',
  maintenance: 'Maintenance',
  growth: 'Growth',
  uncategorised: 'Other',
}
const orderedCategoryKeys = computed(() => {
  const present = Object.keys(byCategory.value)
  const ordered = CATEGORY_ORDER.filter((k) => present.includes(k))
  const tail = present.filter((k) => !CATEGORY_ORDER.includes(k))
  return [...ordered, ...tail]
})

const recurrenceLabel = {
  once: 'one-off',
  daily: 'daily',
  weekly: 'weekly',
  monthly: 'monthly',
  quarterly: 'quarterly',
  annually: 'yearly',
}

function statusTone(status) {
  if (status === 'overdue') return 'warn'
  if (status === 'completed') return 'good'
  return 'default'
}

function backToHome() {
  window.location.href = '/ross.html'
}
</script>

<template>
  <div class="playbook">
    <!-- Header strip -->
    <header class="playbook__head">
      <button class="playbook__back" @click="backToHome">
        <HfIcon name="arrow" :size="14" />
        <span>Back to Ross</span>
      </button>
      <div class="playbook__head-meta">
        <HfLogo :size="18" />
        <span class="hf-mono playbook__head-mono">playbook · governance</span>
      </div>
    </header>

    <main class="playbook__main">
      <section class="playbook__intro">
        <div class="hf-eyebrow">
          <HfIcon name="sparkle" :size="11" color="var(--hf-accent)" />
          Ross's playbook
        </div>
        <h1 class="playbook__title">
          The rules I follow,<br />
          <span class="playbook__title-italic">and the procedures I run against.</span>
        </h1>
        <p class="playbook__lead">
          Workflows here govern how Ross watches your venues and what gets escalated.
          Today they're walked by your team; soon I'll execute them automatically and
          flag anything that drifts. Edit thresholds, recurrence, and assignments below.
        </p>
      </section>

      <!-- Stats -->
      <div class="playbook__stats">
        <HfCard :padded="false" class="playbook__stat">
          <div class="hf-eyebrow">Active workflows</div>
          <div class="hf-num playbook__stat-value">{{ store.activeCount }}</div>
          <div class="hf-mono playbook__stat-sub">across your venues</div>
        </HfCard>
        <HfCard :padded="false" class="playbook__stat">
          <div class="hf-eyebrow">Overdue</div>
          <div class="hf-num playbook__stat-value" :class="{ 'is-warn': store.overdueCount > 0 }">
            {{ store.overdueCount }}
          </div>
          <div class="hf-mono playbook__stat-sub">need attention</div>
        </HfCard>
        <HfCard :padded="false" class="playbook__stat">
          <div class="hf-eyebrow">Templates</div>
          <div class="hf-num playbook__stat-value">{{ templates.length }}</div>
          <div class="hf-mono playbook__stat-sub">reusable patterns</div>
        </HfCard>
      </div>

      <!-- Workflows by category -->
      <section v-if="loading" class="playbook__loading">
        <div class="hf-eyebrow">Loading playbook…</div>
      </section>

      <section v-else-if="error" class="playbook__error">
        <div class="hf-eyebrow">Could not load</div>
        <p class="playbook__error-msg">{{ error }}</p>
        <HfButton variant="ghost" @click="store.load()">Retry</HfButton>
      </section>

      <section v-else-if="workflows.length === 0" class="playbook__empty">
        <div class="hf-eyebrow">No workflows yet</div>
        <p class="playbook__empty-msg">
          You haven't published any workflows for me to follow. Pick a template below
          and instantiate it at a venue, or build a new one from scratch.
        </p>
      </section>

      <section v-else class="playbook__categories">
        <div
          v-for="catKey in orderedCategoryKeys" :key="catKey"
          class="playbook__category"
        >
          <header class="playbook__cat-head">
            <h2 class="playbook__cat-title">{{ CATEGORY_LABELS[catKey] || catKey }}</h2>
            <span class="hf-mono playbook__cat-count">
              {{ byCategory[catKey].length }}
              workflow{{ byCategory[catKey].length === 1 ? '' : 's' }}
            </span>
          </header>
          <ul class="playbook__workflow-list">
            <li
              v-for="w in byCategory[catKey]" :key="w.workflowId"
              class="playbook__workflow"
              :data-status="w.status"
            >
              <div class="playbook__workflow-row">
                <div class="playbook__workflow-body">
                  <h3 class="playbook__workflow-name">{{ w.name }}</h3>
                  <p v-if="w.description" class="playbook__workflow-desc">{{ w.description }}</p>
                </div>
                <div class="playbook__workflow-meta">
                  <HfChip :tone="statusTone(w.status)">
                    <template #leading>
                      <span class="playbook__dot" :class="`is-${statusTone(w.status)}`" />
                    </template>
                    {{ w.status || 'active' }}
                  </HfChip>
                  <span class="hf-mono playbook__workflow-recur">
                    {{ recurrenceLabel[w.recurrence] || w.recurrence }}
                  </span>
                  <span v-if="w.locationName" class="hf-mono playbook__workflow-loc">{{ w.locationName }}</span>
                </div>
              </div>
            </li>
          </ul>
        </div>
      </section>

      <!-- Templates strip -->
      <section v-if="templates.length" class="playbook__templates">
        <header class="playbook__cat-head">
          <h2 class="playbook__cat-title">Templates</h2>
          <span class="hf-mono playbook__cat-count">
            reusable patterns Ross can instantiate
          </span>
        </header>
        <div class="playbook__template-grid">
          <HfCard
            v-for="t in templates" :key="t.id"
            :padded="false"
            class="playbook__template"
          >
            <div class="hf-eyebrow">{{ t.category || 'general' }}</div>
            <h3 class="playbook__template-name">{{ t.name }}</h3>
            <p v-if="t.description" class="playbook__template-desc">{{ t.description }}</p>
            <div class="hf-mono playbook__template-meta">
              {{ recurrenceLabel[t.recurrence] || t.recurrence }} ·
              {{ Array.isArray(t.tasks) ? t.tasks.length : 0 }}
              task{{ (t.tasks?.length || 0) === 1 ? '' : 's' }}
            </div>
          </HfCard>
        </div>
      </section>

      <footer class="playbook__footer">
        <p class="hf-mono">
          Workflows + templates are the procedures Ross will run against once the agent
          is online. Edit / create flows ship in the next phase.
        </p>
      </footer>
    </main>
  </div>
</template>

<style scoped>
.playbook {
  width: 100%; min-height: 100vh;
  background: var(--hf-bg);
  display: flex; flex-direction: column;
}

.playbook__head {
  padding: 14px 28px;
  border-bottom: 1px solid var(--hf-line);
  display: flex; align-items: center; justify-content: space-between;
}
.playbook__back {
  display: inline-flex; align-items: center; gap: 6px;
  background: transparent; border: none; cursor: pointer;
  color: var(--hf-ink-2);
  font-family: var(--hf-font-body); font-size: 12px;
  padding: 4px 8px; border-radius: 4px;
}
.playbook__back :deep(svg) { transform: rotate(180deg); }
.playbook__back:hover { color: var(--hf-ink); background: var(--hf-paper); }
.playbook__head-meta {
  display: flex; align-items: center; gap: 10px;
}
.playbook__head-mono {
  font-size: 11px;
  letter-spacing: 0.14em;
  color: var(--hf-muted);
  text-transform: uppercase;
}

.playbook__main {
  padding: 32px 36px 64px;
  max-width: 1100px;
  width: 100%;
  margin: 0 auto;
  box-sizing: border-box;
}

.playbook__intro { max-width: 720px; }
.playbook__title {
  font-family: var(--hf-font-display);
  font-size: 44px; line-height: 1.05;
  letter-spacing: -0.02em;
  margin: 8px 0 16px;
  font-weight: 400;
}
.playbook__title-italic { font-style: italic; color: var(--hf-ink-2); }
.playbook__lead {
  font-size: 15px; line-height: 1.6;
  color: var(--hf-ink-2);
  margin: 0;
}

/* Stats row */
.playbook__stats {
  display: grid; grid-template-columns: repeat(3, 1fr);
  gap: 14px; margin-top: 28px;
}
@media (max-width: 720px) {
  .playbook__stats { grid-template-columns: 1fr; }
}
.playbook__stat { padding: 16px; }
.playbook__stat-value {
  font-size: 32px; line-height: 1; margin: 4px 0 6px;
}
.playbook__stat-value.is-warn { color: var(--hf-warn); }
.playbook__stat-sub {
  font-size: 11px; color: var(--hf-muted);
}

/* Categories */
.playbook__categories { margin-top: 36px; }
.playbook__category { margin-top: 28px; }
.playbook__category:first-child { margin-top: 0; }
.playbook__cat-head {
  display: flex; align-items: baseline; justify-content: space-between;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--hf-line);
  padding-bottom: 8px;
}
.playbook__cat-title {
  font-family: var(--hf-font-display);
  font-size: 22px; letter-spacing: -0.01em;
  font-weight: 400;
  margin: 0;
}
.playbook__cat-count {
  font-size: 11px; color: var(--hf-muted);
  letter-spacing: 0.06em;
}

.playbook__workflow-list {
  list-style: none; margin: 0; padding: 0;
}
.playbook__workflow {
  border-bottom: 1px solid var(--hf-line);
  padding: 14px 0;
}
.playbook__workflow:last-child { border-bottom: none; }
.playbook__workflow[data-status="overdue"] {
  background: linear-gradient(90deg, rgba(212, 87, 47, 0.04), transparent 60%);
  padding-left: 12px; margin-left: -12px;
  border-left: 2px solid var(--hf-warn);
}

.playbook__workflow-row {
  display: flex; align-items: flex-start; gap: 16px;
  flex-wrap: wrap;
}
.playbook__workflow-body { flex: 1; min-width: 240px; }
.playbook__workflow-name {
  font-family: var(--hf-font-body);
  font-size: 15px; font-weight: 500;
  margin: 0;
}
.playbook__workflow-desc {
  font-size: 13px; color: var(--hf-ink-2);
  margin: 4px 0 0;
  max-width: 640px;
}
.playbook__workflow-meta {
  display: flex; align-items: center; gap: 12px;
  flex-wrap: wrap;
}
.playbook__workflow-recur,
.playbook__workflow-loc {
  font-size: 11px; color: var(--hf-muted);
  letter-spacing: 0.06em;
  text-transform: lowercase;
}

.playbook__dot {
  width: 8px; height: 8px; border-radius: 50%; display: inline-block;
}
.playbook__dot.is-warn { background: var(--hf-warn); }
.playbook__dot.is-good { background: var(--hf-good); }
.playbook__dot.is-default { background: var(--hf-ink-2); }

/* Templates */
.playbook__templates { margin-top: 44px; }
.playbook__template-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 14px;
}
.playbook__template { padding: 16px; }
.playbook__template-name {
  font-family: var(--hf-font-display);
  font-size: 17px; letter-spacing: -0.005em;
  font-weight: 400;
  margin: 6px 0 4px;
}
.playbook__template-desc {
  font-size: 13px; color: var(--hf-ink-2);
  margin: 0 0 10px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.playbook__template-meta {
  font-size: 11px; color: var(--hf-muted);
  letter-spacing: 0.06em;
}

/* States */
.playbook__loading,
.playbook__error,
.playbook__empty {
  margin-top: 36px;
  padding: 24px;
  border: 1px dashed var(--hf-line-2);
  border-radius: var(--hf-radius-md);
  text-align: center;
  background: var(--hf-paper);
}
.playbook__error-msg,
.playbook__empty-msg {
  margin: 8px 0 16px;
  color: var(--hf-ink-2);
  font-size: 13px;
}
.playbook__error-msg { color: var(--hf-warn); font-family: var(--hf-font-mono); }

.playbook__footer {
  margin-top: 48px;
  padding-top: 16px;
  border-top: 1px solid var(--hf-line);
  color: var(--hf-muted);
  font-size: 11px;
}
</style>

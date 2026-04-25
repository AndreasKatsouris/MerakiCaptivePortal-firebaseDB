<script setup>
// Receipts & Ops Inbox — 3-column: sidebar nav / inbox list / receipt detail.
// Receipt image is a CSS-rendered invoice mock that will be replaced by a
// real scanned/PDF preview in A7.1.
import { onMounted, computed } from 'vue'
import { useReceiptsInboxStore } from '../store.js'
import {
  HfIcon, HfChip, HfCard, HfButton, HfLogo, HfNavItem,
} from '/js/design-system/hifi/index.js'

const store = useReceiptsInboxStore()
onMounted(async () => {
  if (!store.inbox)  await store.loadInbox()
  if (!store.detail) await store.loadDetail()
})

const inbox  = computed(() => store.inbox)
const detail = computed(() => store.detail)

const nav = [
  { label: 'ROSS v2',   icon: 'bolt',  href: '/ross.html' },
  { label: 'Overview',  icon: 'chart', href: '/group-overview-v2.html' },
  { label: 'Guests',    icon: 'users', href: '/guests-v2.html' },
  { label: 'Queue',     icon: 'clock', href: '/queue-v2.html' },
  { label: 'Analytics', icon: 'line',  href: '/analytics-v2.html' },
  { label: 'Food cost', icon: 'leaf',  href: '/food-cost-v2.html' },
  { label: 'Receipts',  icon: 'cart',  active: true },
  { label: 'Campaigns', icon: 'send',  href: '/campaigns-v2.html' },
  { label: 'Settings',  icon: 'gear',  href: '/admin-dashboard.html' },
]
</script>

<template>
  <div class="receipts">
    <!-- Sidebar -->
    <aside class="receipts__sidebar">
      <HfLogo :size="20" />
      <div class="receipts__nav">
        <HfNavItem v-for="n in nav" :key="n.label"
          :label="n.label" :icon="n.icon" :href="n.href" :active="!!n.active" />
      </div>
    </aside>

    <!-- Inbox list -->
    <section class="receipts__inbox" v-if="inbox">
      <header class="receipts__inbox-head">
        <div class="receipts__inbox-title-row">
          <h2 class="receipts__inbox-title">Receipts</h2>
          <span class="hf-mono receipts__inbox-count">{{ inbox.pendingCount }} pending</span>
        </div>
        <div class="receipts__inbox-filters">
          <button
            v-for="f in inbox.filters" :key="f.id"
            :class="['receipts__filter', { 'is-active': store.filter === f.id }]"
            @click="store.setFilter(f.id)"
            :aria-pressed="store.filter === f.id"
          >{{ f.label }}</button>
        </div>
      </header>

      <div class="receipts__inbox-scroll">
        <button
          v-for="r in inbox.rows" :key="r.id"
          :class="['receipts__item', { 'is-active': r.id === store.selectedId }]"
          @click="store.selectReceipt(r.id)"
          :aria-pressed="r.id === store.selectedId"
        >
          <div class="receipts__item-row">
            <div class="receipts__item-source">
              <span v-if="r.flagged" class="receipts__flag-dot" aria-label="Flagged" />
              {{ r.source }}
            </div>
            <div class="hf-num receipts__item-amount">{{ r.amount }}</div>
          </div>
          <div class="receipts__item-meta-row">
            <div class="hf-mono receipts__item-received">{{ r.receivedAt }}</div>
            <HfChip class="receipts__item-kind">{{ r.kind }}</HfChip>
          </div>
        </button>
        <div v-if="inbox.rows.length === 0" class="receipts__inbox-empty">Nothing in this view.</div>
      </div>
    </section>

    <!-- Detail -->
    <main class="receipts__detail" v-if="detail">
      <header class="receipts__detail-head">
        <div>
          <div class="hf-eyebrow">{{ detail.header.eyebrow }}</div>
          <h1 class="receipts__detail-title">
            {{ detail.header.vendor }}
            <span class="receipts__detail-amount"> — {{ detail.header.amount }}</span>
          </h1>
        </div>
        <div class="receipts__detail-actions">
          <HfButton
            v-for="a in detail.header.actions" :key="a.id"
            :variant="a.variant" size="sm"
          >
            <template v-if="a.icon" #leading><HfIcon :name="a.icon" :size="13" /></template>
            {{ a.label }}
          </HfButton>
        </div>
      </header>

      <div class="receipts__detail-grid">
        <!-- Receipt image (CSS mock) -->
        <div class="receipts__image-wrap">
          <div class="receipts__image-paper">
            <div class="receipts__image-title">{{ detail.image.title }}</div>
            <div class="receipts__image-meta">{{ detail.image.meta }}</div>
            <ul class="receipts__image-lines">
              <li v-for="(l, i) in detail.image.lines" :key="i" :class="{ 'is-last': i === detail.image.lines.length - 1 }">
                <span>{{ l.label }}</span><span>{{ l.price }}</span>
              </li>
            </ul>
            <div class="receipts__image-total">
              <span>TOTAL</span><span>{{ detail.image.total }}</span>
            </div>
          </div>
        </div>

        <!-- Extraction + observation + matching -->
        <div class="receipts__extraction">
          <HfCard :padded="false" class="receipts__panel">
            <div class="hf-eyebrow receipts__panel-eyebrow">
              <HfIcon name="sparkle" :size="11" color="var(--hf-accent-2)" />
              {{ detail.extracted.eyebrow }}
            </div>
            <dl class="receipts__fields">
              <template v-for="f in detail.extracted.fields" :key="f.k">
                <dt class="hf-mono receipts__field-key">{{ f.k }}</dt>
                <dd class="receipts__field-value">
                  {{ f.v }}
                  <HfChip v-if="f.editable" class="receipts__field-change">change</HfChip>
                </dd>
              </template>
            </dl>
          </HfCard>

          <HfCard :padded="false" class="receipts__observation">
            <div class="hf-eyebrow receipts__observation-eyebrow">
              <HfIcon name="sparkle" :size="11" color="var(--hf-accent-2)" />
              {{ detail.observation.eyebrow }}
            </div>
            <p class="receipts__observation-text">
              <template v-for="(part, i) in detail.observation.parts" :key="i">
                <strong v-if="part.type === 'strong'">{{ part.value }}</strong>
                <template v-else>{{ part.value }}</template>
              </template>
            </p>
            <HfButton size="sm" class="receipts__observation-btn">{{ detail.observation.action }}</HfButton>
          </HfCard>

          <HfCard :padded="false" class="receipts__panel">
            <div class="hf-eyebrow">{{ detail.matching.eyebrow }}</div>
            <div class="receipts__match">
              <HfIcon name="check" :size="16" color="var(--hf-good)" />
              <div class="receipts__match-body">
                Matched to PO <strong>{{ detail.matching.poNumber }}</strong>
                <div class="hf-mono receipts__match-meta">{{ detail.matching.confidence }}</div>
              </div>
              <a class="receipts__match-link">{{ detail.matching.viewLink }}</a>
            </div>
          </HfCard>
        </div>
      </div>
    </main>

    <div v-else class="receipts__loading"><div class="hf-eyebrow">Loading…</div></div>
  </div>
</template>

<style scoped>
.receipts {
  width: 100%; min-height: 100vh;
  display: grid;
  grid-template-columns: 220px 360px 1fr;
  background: var(--hf-bg);
}
@media (max-width: 1200px) { .receipts { grid-template-columns: 320px 1fr; } .receipts__sidebar { display: none; } }
@media (max-width: 720px)  { .receipts { grid-template-columns: 1fr; } .receipts__inbox { display: none; } }

.receipts__sidebar {
  background: var(--hf-bg2);
  border-right: 1px solid var(--hf-line);
  padding: 20px 16px;
}
.receipts__nav { margin-top: 20px; display: flex; flex-direction: column; gap: 2px; }

/* Inbox */
.receipts__inbox {
  border-right: 1px solid var(--hf-line);
  background: var(--hf-paper);
  display: flex; flex-direction: column;
  min-height: 100vh;
}
.receipts__inbox-head {
  padding: 18px 20px;
  border-bottom: 1px solid var(--hf-line);
}
.receipts__inbox-title-row { display: flex; justify-content: space-between; align-items: baseline; }
.receipts__inbox-title {
  font-family: var(--hf-font-display);
  font-size: 22px; margin: 0; font-weight: 400;
  letter-spacing: -0.01em;
}
.receipts__inbox-count { font-size: 10px; color: var(--hf-muted); }
.receipts__inbox-filters { display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap; }
.receipts__filter {
  padding: 3px 10px; font-size: 11px;
  border-radius: 999px; border: 1px solid var(--hf-line-2);
  background: var(--hf-paper); color: var(--hf-ink-2);
  cursor: pointer; font-family: var(--hf-font-body);
}
.receipts__filter:hover { border-color: var(--hf-ink-2); }
.receipts__filter.is-active { background: var(--hf-ink); color: var(--hf-bg); border-color: var(--hf-ink); }

.receipts__inbox-scroll { overflow: auto; flex: 1; }
.receipts__inbox-empty { padding: 24px 20px; color: var(--hf-muted); font-size: 13px; text-align: center; }

.receipts__item {
  display: block;
  padding: 14px 20px;
  border-bottom: 1px solid var(--hf-line);
  background: transparent;
  border-left: 2px solid transparent;
  border-top: none; border-right: none;
  cursor: pointer;
  width: 100%;
  text-align: left;
  font-family: var(--hf-font-body);
  transition: background var(--hf-transition);
}
.receipts__item:hover { background: var(--hf-bg); }
.receipts__item.is-active {
  background: var(--hf-bg2);
  border-left-color: var(--hf-ink);
}
.receipts__item-row { display: flex; justify-content: space-between; align-items: baseline; }
.receipts__item-source {
  font-size: 14px; font-weight: 500;
  display: flex; align-items: center; gap: 6px;
}
.receipts__flag-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--hf-warn);
  display: inline-block;
}
.receipts__item-amount { font-size: 15px; }
.receipts__item-meta-row { display: flex; justify-content: space-between; align-items: center; margin-top: 4px; }
.receipts__item-received { font-size: 10px; color: var(--hf-muted); }
.receipts__item-kind :deep(.hf-chip),
.receipts__item-kind.hf-chip {
  font-size: 10px; padding: 1px 6px;
}

/* Detail */
.receipts__detail { padding: 24px 32px 48px; overflow: auto; min-width: 0; }
.receipts__detail-head {
  display: flex; justify-content: space-between; align-items: flex-start;
  gap: 16px; flex-wrap: wrap;
}
.receipts__detail-title {
  font-family: var(--hf-font-display);
  font-size: 32px; margin: 4px 0 0;
  font-weight: 400; letter-spacing: -0.01em;
}
.receipts__detail-amount { color: var(--hf-muted); font-style: italic; font-size: 24px; }
.receipts__detail-actions { display: flex; gap: 8px; flex-wrap: wrap; }

.receipts__detail-grid {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 20px; margin-top: 24px;
}
@media (max-width: 960px) { .receipts__detail-grid { grid-template-columns: 1fr; } }

/* Receipt image mock */
.receipts__image-wrap {
  aspect-ratio: 3 / 4;
  border: 1px solid var(--hf-line);
  border-radius: var(--hf-radius-md);
  background: var(--hf-paper);
  overflow: hidden;
}
.receipts__image-paper {
  height: 100%;
  padding: 30px;
  background: repeating-linear-gradient(180deg, var(--hf-paper) 0 22px, #f2ecd8 22px 23px);
  position: relative;
}
.receipts__image-title {
  font-family: var(--hf-font-mono);
  font-size: 12px; color: var(--hf-ink);
  text-align: center; letter-spacing: 0.1em;
}
.receipts__image-meta {
  font-family: var(--hf-font-mono);
  font-size: 10px; color: var(--hf-muted);
  text-align: center; margin-top: 4px;
}
.receipts__image-lines {
  list-style: none; padding: 0;
  margin: 20px 0 0;
  font-family: var(--hf-font-mono);
  font-size: 11px; color: var(--hf-ink-2);
  line-height: 1.8;
}
.receipts__image-lines li {
  display: flex; justify-content: space-between;
  padding: 4px 0;
  border-bottom: 1px dashed var(--hf-line-2);
}
.receipts__image-lines li.is-last { border-bottom: none; }
.receipts__image-total {
  margin-top: 14px; padding-top: 8px;
  border-top: 2px solid var(--hf-ink);
  display: flex; justify-content: space-between;
  font-family: var(--hf-font-mono); font-size: 12px;
}

/* Extraction column */
.receipts__extraction { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.receipts__panel { padding: 18px; }
.receipts__panel-eyebrow,
.receipts__observation-eyebrow {
  display: flex; align-items: center; gap: 6px;
}

.receipts__fields {
  display: grid; grid-template-columns: 120px 1fr;
  gap: 10px 16px;
  margin: 12px 0 0;
  font-size: 13px;
}
.receipts__fields dt, .receipts__fields dd { margin: 0; }
.receipts__field-key { color: var(--hf-muted); }
.receipts__field-value { display: flex; align-items: center; gap: 6px; }
.receipts__field-change :deep(.hf-chip),
.receipts__field-change.hf-chip {
  font-size: 10px;
  padding: 1px 6px;
  cursor: pointer;
}

/* Observation (amber-tinted) */
.receipts__observation {
  padding: 18px;
  background: #fcf7e7;
  border-color: rgba(200, 154, 58, 0.34);
}
.receipts__observation-eyebrow { color: var(--hf-accent-2); }
.receipts__observation-text {
  font-size: 13.5px; color: var(--hf-ink-2);
  line-height: 1.55; margin: 8px 0 0;
}
.receipts__observation-text strong { color: var(--hf-ink); font-weight: 600; }
.receipts__observation-btn { margin-top: 10px; }

/* PO matching */
.receipts__match {
  margin-top: 10px; padding: 12px;
  background: var(--hf-bg);
  border-radius: var(--hf-radius);
  display: flex; align-items: center; gap: 10px;
}
.receipts__match-body { flex: 1; font-size: 13px; min-width: 0; }
.receipts__match-meta { font-size: 10px; color: var(--hf-muted); margin-top: 2px; }
.receipts__match-link { font-size: 11px; color: var(--hf-accent-2); font-family: var(--hf-font-mono); cursor: pointer; }

.receipts__loading {
  min-height: 100vh; display: grid; place-items: center;
  background: var(--hf-bg);
  grid-column: 1 / -1;
}
</style>

<script setup>
// Guests — 3-column: searchable list · profile detail · Ross right rail.
import { onMounted, computed } from 'vue'
import { useGuestsStore } from '../store.js'
import {
  HfIcon, HfChip, HfCard, HfButton, HfAvatar, HfInput, HfKbd, HfBarChart,
} from '/js/design-system/hifi/index.js'

const store = useGuestsStore()
onMounted(async () => {
  if (!store.list) await store.loadList()
  if (!store.profile) await store.loadProfile()
})

const list    = computed(() => store.list)
const profile = computed(() => store.profile)

function onSearch(v) { store.setQuery(v) }
</script>

<template>
  <div class="guests">
    <!-- List column -->
    <aside class="guests__list">
      <div class="guests__list-head">
        <div class="guests__list-title-row">
          <h2 class="guests__list-title">Guests</h2>
          <span v-if="list" class="hf-mono guests__list-count">{{ new Intl.NumberFormat('en-ZA').format(list.total) }}</span>
        </div>
        <HfInput :model-value="store.query" @update:model-value="onSearch" placeholder="Search name, phone, email">
          <template #leading><HfIcon name="search" :size="14" color="var(--hf-muted)" /></template>
          <template #trailing><HfKbd>⌘F</HfKbd></template>
        </HfInput>
        <div v-if="list" class="guests__list-filters">
          <button
            v-for="f in list.filters" :key="f.id"
            :class="['guests__filter', { 'is-active': store.filter === f.id }]"
            @click="store.setFilter(f.id)"
            :aria-pressed="store.filter === f.id"
          >{{ f.label }}</button>
        </div>
      </div>
      <div class="guests__list-scroll" v-if="list">
        <div v-if="list.rows.length === 0" class="guests__list-empty">No guests match this view.</div>
        <button
          v-for="g in list.rows" :key="g.id"
          :class="['guests__list-row', { 'is-active': g.id === store.selectedId }]"
          @click="store.selectGuest(g.id)"
          :aria-pressed="g.id === store.selectedId"
        >
          <HfAvatar :initials="g.initials" :size="34" />
          <div class="guests__list-row-body">
            <div class="guests__list-row-name">{{ g.name }}</div>
            <div class="hf-mono guests__list-row-summary">{{ g.summary }}</div>
          </div>
        </button>
      </div>
    </aside>

    <!-- Detail column -->
    <main class="guests__detail" v-if="profile">
      <header class="guests__profile-head">
        <HfAvatar :initials="profile.initials" :size="84" :tone="profile.tone" />
        <div class="guests__profile-head-body">
          <div class="guests__profile-head-meta">
            <HfChip :tone="profile.chip.tone">
              <template #leading><HfIcon :name="profile.chip.icon" :size="11" /></template>
              {{ profile.chip.label }}
            </HfChip>
            <span class="hf-mono guests__profile-head-since">{{ profile.memberSince }}</span>
          </div>
          <h1 class="guests__profile-name">{{ profile.name }}</h1>
          <div class="guests__profile-contact">
            <span><HfIcon name="mail" :size="12" /> {{ profile.email }}</span>
            <span><HfIcon name="phone" :size="12" /> {{ profile.phone }}</span>
            <span>{{ profile.venueNote }}</span>
          </div>
        </div>
        <div class="guests__profile-actions">
          <HfButton variant="ghost">
            <template #leading><HfIcon name="mail" :size="13" /></template>
            Message
          </HfButton>
          <HfButton variant="ghost">
            <template #leading><HfIcon name="cal" :size="13" /></template>
            Book
          </HfButton>
          <HfButton>
            <template #leading><HfIcon name="sparkle" :size="13" /></template>
            Ask Ross
          </HfButton>
        </div>
      </header>

      <div class="guests__kpis">
        <HfCard v-for="k in profile.kpis" :key="k.key" :padded="false" class="guests__kpi">
          <div class="hf-eyebrow">{{ k.label }}</div>
          <div class="hf-num guests__kpi-value">{{ k.value }}</div>
          <div class="hf-mono guests__kpi-meta">{{ k.meta }}</div>
        </HfCard>
      </div>

      <HfCard :padded="false" class="guests__rhythm">
        <div class="guests__panel-head">
          <h3 class="guests__panel-title guests__panel-title--sm">Visit rhythm</h3>
          <span class="hf-mono guests__panel-sub">last 24 weeks</span>
        </div>
        <HfBarChart
          :data="profile.visitRhythm" :height="80"
          :accent-index="profile.visitRhythmAccentIndex"
          :show-axes="false" :show-tooltip="false"
          title="Visit rhythm"
        />
      </HfCard>

      <HfCard :padded="false" class="guests__history">
        <div class="guests__panel-head">
          <h3 class="guests__panel-title guests__panel-title--sm">Recent visits</h3>
          <a class="guests__panel-link">view all 22 →</a>
        </div>
        <div
          v-for="(v, i) in profile.recentVisits" :key="i"
          class="guests__visit"
          :class="{ 'guests__visit--last': i === profile.recentVisits.length - 1 }"
        >
          <div class="hf-mono guests__visit-date">{{ v.date }}</div>
          <div class="guests__visit-venue">{{ v.venue }}</div>
          <div class="guests__visit-body">
            <div class="guests__visit-label">{{ v.label }}</div>
            <div v-if="v.note" class="guests__visit-note">— {{ v.note }}</div>
          </div>
          <div class="hf-num guests__visit-amount">{{ v.amount }}</div>
        </div>
      </HfCard>
    </main>

    <!-- Right rail -->
    <aside class="guests__rail" v-if="profile">
      <div class="hf-eyebrow guests__rail-eyebrow">
        <HfIcon name="sparkle" :size="11" color="var(--hf-accent-2)" />
        <span>&nbsp; Ross · about {{ profile.name.split(' ')[0] }}</span>
      </div>
      <HfCard :padded="false" class="guests__ross-card">
        <div class="guests__ross-headline">{{ profile.ross.headline }}</div>
        <p class="guests__ross-detail">{{ profile.ross.detail }}</p>
        <HfButton size="sm" class="guests__ross-btn">{{ profile.ross.action }}</HfButton>
      </HfCard>

      <div class="hf-eyebrow guests__rail-section">Preferences (learned)</div>
      <div class="guests__prefs">
        <HfChip v-for="p in profile.preferences" :key="p">{{ p }}</HfChip>
      </div>

      <div class="hf-eyebrow guests__rail-section">Allergies & notes</div>
      <HfCard :padded="false" class="guests__allergy">
        <div class="guests__allergy-primary">{{ profile.allergies.primary }}</div>
        <div class="guests__allergy-detail">{{ profile.allergies.detail }}</div>
      </HfCard>

      <div class="hf-eyebrow guests__rail-section">Relationships</div>
      <div class="guests__relationships">
        <div v-for="r in profile.relationships" :key="r.name" class="guests__relationship">
          <HfAvatar :initials="r.initials" :size="28" />
          <div>
            <div class="guests__relationship-name">{{ r.name }}</div>
            <div class="hf-mono guests__relationship-meta">{{ r.relation }}</div>
          </div>
        </div>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.guests {
  width: 100%; min-height: 100vh;
  display: grid;
  grid-template-columns: 260px 1fr 320px;
  background: var(--hf-bg);
}
@media (max-width: 1100px) {
  .guests { grid-template-columns: 240px 1fr; }
  .guests__rail { display: none; }
}
@media (max-width: 720px) {
  .guests { grid-template-columns: 1fr; }
  .guests__list { display: none; }
}

/* List column */
.guests__list {
  border-right: 1px solid var(--hf-line);
  background: var(--hf-paper);
  display: flex; flex-direction: column;
  min-height: 100vh;
}
.guests__list-head {
  padding: 18px 16px 12px;
  border-bottom: 1px solid var(--hf-line);
}
.guests__list-title-row { display: flex; justify-content: space-between; align-items: baseline; }
.guests__list-title {
  font-family: var(--hf-font-display);
  font-size: 22px; margin: 0; font-weight: 400;
  letter-spacing: -0.01em;
}
.guests__list-count { font-size: 10px; color: var(--hf-muted); }
.guests__list-head :deep(.hf-input) { margin-top: 10px; padding: 6px 10px; }
.guests__list-filters { display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap; }
.guests__filter {
  padding: 3px 10px; font-size: 11px;
  border-radius: 999px; border: 1px solid var(--hf-line-2);
  background: var(--hf-paper); color: var(--hf-ink-2);
  cursor: pointer; font-family: var(--hf-font-body);
}
.guests__filter:hover { border-color: var(--hf-ink-2); }
.guests__filter.is-active { background: var(--hf-ink); color: var(--hf-bg); border-color: var(--hf-ink); }

.guests__list-scroll { overflow: auto; flex: 1; }
.guests__list-empty { padding: 24px 16px; color: var(--hf-muted); font-size: 13px; text-align: center; }
.guests__list-row {
  display: flex; gap: 10px; padding: 12px 16px; align-items: center;
  background: transparent;
  border-left: 2px solid transparent;
  border-bottom: 1px solid var(--hf-line);
  border-top: none; border-right: none;
  cursor: pointer;
  width: 100%;
  text-align: left;
  font-family: var(--hf-font-body);
  transition: background var(--hf-transition);
}
.guests__list-row:hover { background: var(--hf-bg); }
.guests__list-row.is-active {
  background: var(--hf-bg2);
  border-left-color: var(--hf-ink);
}
.guests__list-row-body { flex: 1; min-width: 0; }
.guests__list-row-name { font-size: 13px; font-weight: 500; }
.guests__list-row-summary {
  font-size: 10px; color: var(--hf-muted);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

/* Detail column */
.guests__detail { padding: 28px 36px 48px; min-width: 0; overflow-x: hidden; }
.guests__profile-head {
  display: flex; align-items: center; gap: 18px;
  flex-wrap: wrap;
}
.guests__profile-head-body { flex: 1; min-width: 260px; }
.guests__profile-head-meta { display: flex; gap: 6px; align-items: center; }
.guests__profile-head-since { font-size: 11px; color: var(--hf-muted); }
.guests__profile-name {
  font-family: var(--hf-font-display);
  font-size: 40px; letter-spacing: -0.015em;
  margin: 2px 0; font-weight: 400;
}
.guests__profile-contact {
  font-size: 13px; color: var(--hf-ink-2);
  display: flex; gap: 14px; flex-wrap: wrap;
}
.guests__profile-contact span { display: inline-flex; align-items: center; gap: 4px; }
.guests__profile-actions { display: flex; gap: 8px; flex-wrap: wrap; }

.guests__kpis {
  display: grid; grid-template-columns: repeat(4, 1fr);
  gap: 14px; margin-top: 24px;
}
@media (max-width: 960px) { .guests__kpis { grid-template-columns: repeat(2, 1fr); } }
.guests__kpi { padding: 16px; }
.guests__kpi-value { font-size: 28px; margin: 2px 0; line-height: 1; }
.guests__kpi-meta { font-size: 10px; color: var(--hf-muted); }

.guests__rhythm, .guests__history { padding: 20px; margin-top: 14px; }
.guests__panel-head {
  display: flex; justify-content: space-between; align-items: baseline;
  margin-bottom: 12px;
}
.guests__panel-title {
  font-family: var(--hf-font-display); font-size: 20px; margin: 0;
  font-weight: 400; letter-spacing: -0.01em;
}
.guests__panel-sub { font-size: 11px; color: var(--hf-muted); }
.guests__panel-link {
  font-size: 12px; color: var(--hf-accent-2);
  font-family: var(--hf-font-mono);
  cursor: pointer;
}

.guests__visit {
  display: grid;
  grid-template-columns: 84px 128px 1fr 80px;
  gap: 14px; padding: 12px 0;
  border-bottom: 1px solid var(--hf-line);
  align-items: start;
}
.guests__visit--last { border-bottom: none; }
@media (max-width: 640px) {
  .guests__visit { grid-template-columns: 1fr 1fr; }
  .guests__visit-body { grid-column: 1 / -1; }
}
.guests__visit-date { font-size: 11px; color: var(--hf-muted); }
.guests__visit-venue { font-size: 13px; }
.guests__visit-label { font-size: 13px; }
.guests__visit-note {
  font-size: 12px; color: var(--hf-accent-2);
  margin-top: 2px; font-style: italic;
}
.guests__visit-amount { font-size: 15px; text-align: right; }

/* Right rail */
.guests__rail {
  border-left: 1px solid var(--hf-line);
  padding: 24px 20px;
  background: var(--hf-bg2);
  overflow: auto;
  min-height: 100vh;
}
.guests__rail-eyebrow {
  display: flex; align-items: center;
}
.guests__rail-section { margin-top: 20px; display: block; }

.guests__ross-card {
  padding: 14px;
  margin-top: 8px;
  border-color: rgba(200, 154, 58, 0.34);
}
.guests__ross-headline {
  font-family: var(--hf-font-display);
  font-size: 18px; line-height: 1.3;
}
.guests__ross-detail {
  font-size: 12px; color: var(--hf-ink-2);
  margin: 6px 0 0; line-height: 1.5;
}
.guests__ross-btn { margin-top: 10px; }

.guests__prefs { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }

.guests__allergy { padding: 12px; margin-top: 8px; }
.guests__allergy-primary { font-size: 12.5px; color: var(--hf-warn); font-weight: 500; }
.guests__allergy-detail { font-size: 12px; color: var(--hf-ink-2); margin-top: 4px; line-height: 1.5; }

.guests__relationships { margin-top: 8px; }
.guests__relationship {
  display: flex; gap: 10px; padding: 8px 0; align-items: center;
}
.guests__relationship-name { font-size: 12.5px; }
.guests__relationship-meta { font-size: 10px; color: var(--hf-muted); }
</style>

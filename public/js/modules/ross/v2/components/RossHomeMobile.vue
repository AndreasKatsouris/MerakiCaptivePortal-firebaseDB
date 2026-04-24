<script setup>
// Ross home — mobile (single column, bottom nav, Ask Ross pill).
// Reuses the same store/feed as the desktop view; renders a compressed
// card per story card without the sidecar KPIs.
import { onMounted, computed } from 'vue'
import { useRossStore } from '../store.js'
import {
  HfIcon, HfChip, HfAvatar, HfLogo, HfSparkline,
} from '/js/design-system/hifi/index.js'

const store = useRossStore()
onMounted(() => { if (!store.feed) store.loadHome() })

const feed = computed(() => store.feed)

const bottomNav = [
  { icon: 'bolt', active: true, label: 'Ross' },
  { icon: 'chart', label: 'Overview' },
  { icon: 'users', label: 'Guests' },
  { icon: 'clock', label: 'Queue' },
  { icon: 'user',  label: 'You' },
]

const chipFor = (c) => ({
  tone: c.chip.tone,
  label: c.chip.label,
  icon: c.chip.icon,
})
</script>

<template>
  <div class="ross-mobile" v-if="feed">
    <div class="ross-mobile__status">
      <span>{{ new Intl.DateTimeFormat('en-ZA',{hour:'numeric',minute:'2-digit'}).format(new Date()) }}</span>
      <span class="hf-mono ross-mobile__signal">•••• 5G ▮▮▮</span>
    </div>

    <div class="ross-mobile__scroll">
      <div class="ross-mobile__topbar">
        <HfLogo :size="18" />
        <HfAvatar initials="MA" :size="30" />
      </div>

      <div class="ross-mobile__greeting">
        <div class="hf-eyebrow">{{ feed.dateLine }}</div>
        <h1>
          {{ feed.headline.greeting }}<br />
          <span class="ross-mobile__greeting-italic">{{ feed.headline.subtitle }}</span>
        </h1>
        <div class="ross-mobile__lead">{{ feed.headline.lead }}</div>
      </div>

      <div class="ross-mobile__cards">
        <article
          v-for="c in feed.cards" :key="c.id"
          class="ross-mobile__card"
          :class="{ 'ross-mobile__card--warn': c.tone === 'warn' }"
        >
          <HfChip :tone="chipFor(c).tone">
            <template #leading>
              <span v-if="chipFor(c).tone === 'warn'" class="ross-mobile__dot" />
              <HfIcon v-else-if="chipFor(c).icon" :name="chipFor(c).icon" :size="11" />
            </template>
            {{ chipFor(c).label }}
          </HfChip>
          <div class="ross-mobile__card-head">{{ c.headline }}</div>
          <HfSparkline
            v-if="c.sidecar.kind === 'kpi-spark'"
            :data="c.sidecar.trend" :height="34"
            :stroke="c.sidecar.color" :fill="c.sidecar.color"
          />
          <div class="hf-mono ross-mobile__card-meta">
            <template v-if="c.sidecar.kind === 'kpi-spark'">Target 28% · 3 days running</template>
            <template v-else-if="c.sidecar.kind === 'donut'">$2,180 avg LTV · 28% projected return</template>
            <template v-else-if="c.sidecar.kind === 'kpi-bars'">Patio promo driving it</template>
          </div>
        </article>
      </div>
    </div>

    <div class="ross-mobile__ask">
      <HfIcon name="sparkle" :size="16" color="var(--hf-accent)" />
      <span class="ross-mobile__ask-placeholder">Ask Ross anything…</span>
      <HfIcon name="bolt" :size="14" color="var(--hf-accent)" />
    </div>

    <nav class="ross-mobile__nav">
      <button
        v-for="(n, i) in bottomNav" :key="i"
        :class="['ross-mobile__nav-btn', { 'is-active': n.active }]"
        :aria-label="n.label"
      >
        <HfIcon :name="n.icon" :size="20" />
      </button>
    </nav>
  </div>

  <div v-else class="ross-mobile__loading">
    <div class="hf-eyebrow">Loading Ross…</div>
  </div>
</template>

<style scoped>
.ross-mobile {
  width: 100%;
  min-height: 100vh;
  background: var(--hf-bg);
  display: flex; flex-direction: column;
  overflow: hidden;
}
.ross-mobile__status {
  display: flex; justify-content: space-between;
  padding: 12px 20px 4px;
  font-size: 12px; font-weight: 600;
}
.ross-mobile__signal { font-size: 10px; color: var(--hf-muted); }

.ross-mobile__scroll { flex: 1; overflow: auto; padding: 16px 20px 0; }

.ross-mobile__topbar {
  display: flex; justify-content: space-between; align-items: center;
}

.ross-mobile__greeting { margin-top: 20px; }
.ross-mobile__greeting h1 {
  font-family: var(--hf-font-display);
  font-size: 32px; line-height: 1.05;
  letter-spacing: -0.02em;
  margin: 4px 0;
  font-weight: 400;
}
.ross-mobile__greeting-italic { font-style: italic; color: var(--hf-muted); }
.ross-mobile__lead { font-size: 13px; color: var(--hf-ink-2); }

.ross-mobile__cards {
  display: flex; flex-direction: column; gap: 10px;
  margin-top: 18px; padding-bottom: 24px;
}
.ross-mobile__card {
  background: var(--hf-paper);
  border: 1px solid var(--hf-line);
  border-radius: var(--hf-radius-md);
  padding: 14px;
}
.ross-mobile__card--warn { border-color: rgba(176, 85, 58, 0.4); }
.ross-mobile__card-head {
  font-family: var(--hf-font-display);
  font-size: 18px; line-height: 1.2;
  margin-top: 8px;
}
.ross-mobile__card-meta { font-size: 10px; color: var(--hf-muted); margin-top: 6px; }
.ross-mobile__dot {
  width: 6px; height: 6px; border-radius: 50%; display: inline-block;
  background: var(--hf-warn);
}

.ross-mobile__ask {
  margin: 0 16px 8px;
  padding: 10px 14px;
  background: var(--hf-ink);
  color: var(--hf-bg);
  border-radius: 26px;
  display: flex; align-items: center; gap: 10px;
}
.ross-mobile__ask-placeholder { font-size: 13px; flex: 1; color: #aaa; }

.ross-mobile__nav {
  display: flex; justify-content: space-around;
  padding: 10px 0 16px;
  border-top: 1px solid var(--hf-line);
  background: var(--hf-paper);
}
.ross-mobile__nav-btn {
  padding: 8px;
  background: none; border: none; cursor: pointer;
  color: var(--hf-muted);
}
.ross-mobile__nav-btn.is-active { color: var(--hf-ink); }
.ross-mobile__nav-btn:focus-visible { outline: 2px solid var(--hf-accent); outline-offset: 2px; border-radius: 4px; }

.ross-mobile__loading {
  width: 100%; min-height: 100vh;
  display: grid; place-items: center;
  background: var(--hf-bg);
}
</style>

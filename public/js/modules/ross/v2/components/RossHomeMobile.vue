<script setup>
// Ross home — mobile (single column, bottom nav, Ask Ross pill).
// Reuses the same store/feed as the desktop view; renders a compressed
// card per story card without the sidecar KPIs.
import { onMounted, onUnmounted, computed, ref } from 'vue'
import { useRossStore } from '../store.js'
import {
  HfIcon, HfChip, HfAvatar, HfLogo, HfSparkline,
} from '/js/design-system/hifi/index.js'
import { auth, onAuthStateChanged } from '/js/config/firebase-config.js'
import RossAskModal from './RossAskModal.vue'

const store = useRossStore()
// Always reload on mount (see RossHomeDesktop.vue for rationale).
onMounted(() => { store.loadHome() })

// Ask Ross modal — same real modal as desktop, NOT a stub.
const askModal = ref(null)
function openAsk() { askModal.value && askModal.value.open('') }

const feed = computed(() => store.feed)

const currentUser = ref(auth.currentUser)
const unsubAuth = onAuthStateChanged(auth, (u) => { currentUser.value = u })
onUnmounted(() => { try { unsubAuth?.() } catch (_) { /* noop */ } })

const userInitials = computed(() => {
  const src = currentUser.value?.displayName || currentUser.value?.email || ''
  const parts = src.split(/[\s@.]+/).filter(Boolean)
  if (parts.length === 0) return '·'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
})

// Mirrors the desktop sidebar nav in RossHomeDesktop.vue. Each item
// carries an href so the bottom-nav icon is actually navigable —
// previously rendered as decorative <button> elements with no click
// handler (operator-flagged on PR #58 preview). The 'Ross' entry is
// always active here because this component only mounts on the home
// tab; navigating to Playbook/Activity/People swaps to a different
// RossHome.vue view via the popstate listener.
const bottomNav = [
  { icon: 'bolt',  active: true, label: 'Ross',     href: '/ross.html' },
  { icon: 'check', label: 'Playbook',                href: '/ross.html?tab=playbook' },
  { icon: 'line',  label: 'Activity',                href: '/ross.html?tab=activity' },
  { icon: 'users', label: 'People',                  href: '/ross.html?tab=people' },
]

const chipFor = (c) => ({
  tone: c.chip.tone,
  label: c.chip.label,
  icon: c.chip.icon,
})

// Card footer meta text. The desktop view uses dedicated sidecar
// components per sidecar.kind (kpi-spark / donut / kpi-bars) that
// surface every field; mobile collapses to a single line of context.
// Previously hardcoded strings ("Target 28% · 3 days running", etc.)
// were prototype debris from the original Hi-Fi mock and showed up
// on every live workflow card — operator caught on PR #79 preview.
function cardMeta(c) {
  const s = c?.sidecar
  if (!s) return ''
  if (s.kind === 'kpi-spark') {
    const target = s.target ? String(s.target) : ''
    const eyebrow = s.eyebrow ? String(s.eyebrow) : ''
    return [eyebrow, target].filter(Boolean).join(' · ')
  }
  if (s.kind === 'donut') {
    const label = s.label != null ? String(s.label) : ''
    const sub = s.sub ? String(s.sub) : ''
    return [label, sub].filter(Boolean).join(' · ')
  }
  if (s.kind === 'kpi-bars') {
    const eyebrow = s.eyebrow ? String(s.eyebrow) : ''
    const delta = s.delta?.label ? String(s.delta.label) : ''
    return [eyebrow, delta].filter(Boolean).join(' · ')
  }
  return ''
}
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
        <HfAvatar :initials="userInitials" :size="30" />
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
          <div class="hf-mono ross-mobile__card-meta">{{ cardMeta(c) }}</div>
        </article>
      </div>
    </div>

    <div
      class="ross-mobile__ask"
      role="button"
      tabindex="0"
      aria-label="Ask Ross"
      @click="openAsk"
      @keydown.enter="openAsk"
      @keydown.space.prevent="openAsk"
    >
      <HfIcon name="sparkle" :size="16" color="var(--hf-accent)" />
      <span class="ross-mobile__ask-placeholder">Ask Ross anything…</span>
      <HfIcon name="bolt" :size="14" color="var(--hf-accent)" />
    </div>

    <nav class="ross-mobile__nav">
      <a
        v-for="(n, i) in bottomNav" :key="i"
        :href="n.href"
        :class="['ross-mobile__nav-btn', { 'is-active': n.active }]"
        :aria-label="n.label"
        :aria-current="n.active ? 'page' : undefined"
      >
        <HfIcon :name="n.icon" :size="20" />
      </a>
    </nav>
  </div>

  <div v-else class="ross-mobile__loading">
    <div class="hf-eyebrow">Loading Ross…</div>
  </div>

  <!-- Hoisted outside the feed v-if — modal must be available even during cold-start. -->
  <RossAskModal ref="askModal" />
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
  cursor: pointer;
}
.ross-mobile__ask:focus-visible { outline: 2px solid var(--hf-accent); outline-offset: 2px; }
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
  /* selector now matches an <a> tag — strip default link styling */
  text-decoration: none;
  display: inline-flex; align-items: center; justify-content: center;
}
.ross-mobile__nav-btn.is-active { color: var(--hf-ink); }
.ross-mobile__nav-btn:focus-visible { outline: 2px solid var(--hf-accent); outline-offset: 2px; border-radius: 4px; }

.ross-mobile__loading {
  width: 100%; min-height: 100vh;
  display: grid; place-items: center;
  background: var(--hf-bg);
}
</style>

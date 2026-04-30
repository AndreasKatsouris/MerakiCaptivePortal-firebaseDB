<script setup>
// Ross home — desktop 3-column editorial layout.
// Left: venue nav. Center: greeting + 3 story cards. Right: Ask Ross +
// live venue strip + Ross suggestions.
import { onMounted, computed } from 'vue'
import { useRossStore } from '../store.js'
import {
  HfIcon, HfChip, HfCard, HfButton, HfAvatar, HfLogo, HfNavItem, HfKbd,
  HfSparkline, HfLineChart, HfBarChart, HfDonut,
} from '/js/design-system/hifi/index.js'
import { seededLine } from '../content.js'

const store = useRossStore()
onMounted(() => { if (!store.feed) store.loadHome() })

const navSections = [
  { eyebrow: 'Today', items: [
    { label: 'Ross',     icon: 'bolt',  active: true },
    { label: 'Overview', icon: 'chart' },
    { label: 'Queue',    icon: 'clock' },
  ]},
  { eyebrow: 'Guests', items: [
    { label: 'Profiles',  icon: 'user'  },
    { label: 'Segments',  icon: 'users' },
    { label: 'Campaigns', icon: 'send'  },
  ]},
  { eyebrow: 'Operations', items: [
    { label: 'Analytics',   icon: 'line' },
    { label: 'Food cost',   icon: 'leaf' },
    { label: 'Receipts',    icon: 'cart' },
    { label: 'Forecasting', icon: 'sparkle' },
  ]},
]

const tones = {
  good:   'var(--hf-good)',
  warn:   'var(--hf-warn)',
  accent: 'var(--hf-accent)',
  muted:  'var(--hf-muted)',
}

const cardBorder = (tone) => tone === 'warn' ? 'var(--hf-warn)' : 'var(--hf-line)'
const cardBorderOpacity = (tone) => tone === 'warn' ? 0.4 : 1

const feed = computed(() => store.feed)
const sidebar = computed(() => store.sidebar)
</script>

<template>
  <div class="ross-home" v-if="feed && sidebar">
    <!-- Sidebar -->
    <aside class="ross-home__sidebar">
      <HfLogo :size="20" />
      <div class="hf-mono ross-home__hq">Group HQ · 4 venues</div>

      <template v-for="(sec, si) in navSections" :key="si">
        <div class="hf-eyebrow ross-home__nav-eyebrow">{{ sec.eyebrow }}</div>
        <HfNavItem
          v-for="it in sec.items" :key="it.label"
          :label="it.label" :icon="it.icon" :active="!!it.active"
        />
      </template>

      <div class="ross-home__profile">
        <HfAvatar initials="MA" :size="28" />
        <div class="ross-home__profile-text">
          <div>Maya Alvarez</div>
          <div class="hf-mono ross-home__profile-role">Group Ops</div>
        </div>
        <HfIcon name="gear" :size="14" color="var(--hf-muted)" />
      </div>
    </aside>

    <!-- Main -->
    <main class="ross-home__main">
      <header class="ross-home__header">
        <div>
          <div class="hf-eyebrow">{{ feed.dateLine }}</div>
          <h1 class="ross-home__greeting">
            {{ feed.headline.greeting }}<br />
            <span class="ross-home__subtitle">{{ feed.headline.subtitle }}</span>
          </h1>
          <p class="ross-home__lead">{{ feed.headline.lead }}</p>
        </div>
        <div class="ross-home__header-actions">
          <HfButton variant="ghost">
            <template #leading><HfIcon name="cal" :size="14" /></template>
            {{ new Intl.DateTimeFormat('en-ZA', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date()) }}
          </HfButton>
          <HfButton>
            <template #leading><HfIcon name="sparkle" :size="14" /></template>
            Ask Ross
          </HfButton>
        </div>
      </header>

      <div class="ross-home__cards">
        <article
          v-for="c in feed.cards" :key="c.id"
          class="ross-home__story"
          :style="{
            borderColor: cardBorder(c.tone),
            borderOpacity: cardBorderOpacity(c.tone),
          }"
        >
          <div class="ross-home__story-body">
            <div class="ross-home__story-meta">
              <HfChip :tone="c.chip.tone">
                <template #leading>
                  <span v-if="c.chip.tone === 'warn'" class="ross-home__dot" :style="{ background: tones.warn }" />
                  <HfIcon v-else-if="c.chip.icon" :name="c.chip.icon" :size="12" />
                </template>
                {{ c.chip.label }}
              </HfChip>
              <span class="hf-mono ross-home__story-eyebrow">{{ c.eyebrow }}</span>
            </div>
            <h3 class="ross-home__story-headline">{{ c.headline }}</h3>
            <p class="ross-home__story-detail" v-html="c.detail" />
            <div class="ross-home__story-actions">
              <HfButton v-for="a in c.actions" :key="a.id" :variant="a.variant">
                {{ a.label }}
                <template #trailing v-if="a.trailing">
                  <HfIcon :name="a.trailing" :size="13" />
                </template>
              </HfButton>
              <span v-if="c.footnote" class="hf-mono ross-home__story-footnote">{{ c.footnote }}</span>
            </div>
          </div>

          <aside class="ross-home__story-sidecar">
            <template v-if="c.sidecar.kind === 'kpi-spark'">
              <div class="hf-eyebrow">{{ c.sidecar.eyebrow }}</div>
              <div class="ross-home__story-value" :style="{ color: c.sidecar.color }">
                {{ c.sidecar.value }}<span class="ross-home__story-unit">{{ c.sidecar.unit }}</span>
              </div>
              <div class="hf-mono ross-home__story-target">{{ c.sidecar.target }}</div>
              <HfSparkline
                :data="c.sidecar.trend" :height="46"
                :stroke="c.sidecar.color" :fill="c.sidecar.color"
              />
            </template>
            <template v-else-if="c.sidecar.kind === 'donut'">
              <HfDonut
                :value="c.sidecar.value" :size="110"
                :color="c.sidecar.color"
                :label="c.sidecar.label" :sub="c.sidecar.sub"
              />
            </template>
            <template v-else-if="c.sidecar.kind === 'kpi-bars'">
              <div class="hf-eyebrow">{{ c.sidecar.eyebrow }}</div>
              <div class="ross-home__story-value">{{ c.sidecar.value }}</div>
              <div class="hf-mono ross-home__story-delta ross-home__story-delta--good">{{ c.sidecar.delta.label }}</div>
              <HfBarChart
                :data="c.sidecar.bars" :height="46"
                :accent-index="c.sidecar.accentIndex" :showAxes="false" :showTooltip="false"
              />
            </template>
          </aside>
        </article>
      </div>

      <div class="ross-home__jumps">
        <div class="hf-eyebrow">Or jump to</div>
        <HfChip v-for="q in feed.quickJumps" :key="q">{{ q }}</HfChip>
      </div>
    </main>

    <!-- Right rail -->
    <aside class="ross-home__rail">
      <section class="ross-home__ask">
        <div class="hf-grain" />
        <div class="ross-home__ask-head">
          <HfIcon name="sparkle" :size="14" color="var(--hf-accent)" />
          <span class="ross-home__ask-eyebrow">Ask Ross</span>
          <HfKbd>⌘K</HfKbd>
        </div>
        <blockquote class="ross-home__ask-prompt">{{ sidebar.askRoss.prompt }}</blockquote>
        <div class="ross-home__ask-recent">
          <div class="hf-mono ross-home__ask-recent-head">recent answers</div>
          <div v-for="r in sidebar.askRoss.recent" :key="r" class="ross-home__ask-recent-line">{{ r }}</div>
        </div>
      </section>

      <section class="ross-home__section">
        <div class="ross-home__section-head">
          <div class="hf-eyebrow">Live · all venues</div>
          <span class="hf-mono ross-home__section-meta">● updated 2s ago</span>
        </div>
        <div class="ross-home__venues">
          <div v-for="v in sidebar.venues" :key="v.name" class="ross-home__venue">
            <span class="ross-home__venue-dot" :style="{ background: tones[v.tone], boxShadow: `0 0 0 3px ${tones[v.tone]}22` }" />
            <div class="ross-home__venue-body">
              <div class="ross-home__venue-name">{{ v.name }}</div>
              <div class="hf-mono ross-home__venue-meta">{{ v.primary }} · {{ v.secondary }}</div>
            </div>
            <div v-if="v.seed > 0" class="ross-home__venue-spark">
              <HfSparkline :data="seededLine(v.seed)" :height="18" :stroke="tones[v.tone]" />
            </div>
          </div>
        </div>
      </section>

      <section class="ross-home__section">
        <div class="hf-eyebrow">Ross suggests</div>
        <div class="ross-home__suggestions">
          <HfCard
            v-for="s in sidebar.suggestions" :key="s.id"
            :padded="false"
            class="ross-home__suggestion"
            :class="{ 'is-illustrative': s.illustrative }"
          >
            <div class="ross-home__suggestion-text">{{ s.text }}</div>
            <div class="ross-home__suggestion-foot">
              <a v-if="s.href" :href="s.href" class="ross-home__suggestion-action">{{ s.action }} →</a>
              <a v-else class="ross-home__suggestion-action">{{ s.action }} →</a>
              <span v-if="s.illustrative" class="hf-mono ross-home__illustrative-tag">preview</span>
            </div>
          </HfCard>
        </div>
      </section>
    </aside>
  </div>

  <div v-else class="ross-home__loading">
    <div class="hf-eyebrow">Loading Ross…</div>
  </div>
</template>

<style scoped>
.ross-home {
  width: 100%; min-height: 100vh;
  display: grid;
  grid-template-columns: 220px 1fr 340px;
  background: var(--hf-bg);
  overflow: hidden;
}

/* Sidebar */
.ross-home__sidebar {
  background: var(--hf-bg2);
  border-right: 1px solid var(--hf-line);
  padding: 20px 16px;
  display: flex; flex-direction: column; gap: 2px;
}
.ross-home__hq {
  font-size: 10px; color: var(--hf-muted);
  margin: 4px 0 20px; padding-left: 28px;
}
.ross-home__nav-eyebrow { padding: 8px 10px 4px; }
.ross-home__nav-eyebrow:not(:first-of-type) { padding-top: 16px; }
.ross-home__profile {
  margin-top: auto;
  padding-top: 16px;
  border-top: 1px solid var(--hf-line);
  display: flex; align-items: center; gap: 10px;
  padding-left: 10px; padding-right: 10px;
}
.ross-home__profile-text { font-size: 12px; flex: 1; }
.ross-home__profile-role { font-size: 10px; color: var(--hf-muted); }

/* Main column */
.ross-home__main {
  overflow: auto;
  padding: 32px 40px 48px;
}
.ross-home__header { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; }
.ross-home__greeting {
  font-family: var(--hf-font-display);
  font-size: 52px; line-height: 1;
  letter-spacing: -0.02em;
  margin: 6px 0 8px;
  max-width: 620px;
  font-weight: 400;
}
.ross-home__subtitle { color: var(--hf-muted); font-style: italic; }
.ross-home__lead {
  font-size: 14px; color: var(--hf-ink-2);
  max-width: 520px; line-height: 1.5;
  margin: 0;
}
.ross-home__header-actions { display: flex; gap: 8px; flex-shrink: 0; }

/* Story cards */
.ross-home__cards {
  display: flex; flex-direction: column; gap: 14px;
  margin-top: 32px;
}
.ross-home__story {
  background: var(--hf-paper);
  border: 1px solid var(--hf-line);
  border-radius: var(--hf-radius-md);
  overflow: hidden;
  display: grid;
  grid-template-columns: 1fr 220px;
}
.ross-home__story-body { padding: 20px 24px; }
.ross-home__story-meta { display: flex; align-items: center; gap: 8px; }
.ross-home__story-eyebrow { font-size: 11px; color: var(--hf-muted); }
.ross-home__story-headline {
  font-family: var(--hf-font-display);
  font-size: 26px; line-height: 1.15;
  margin: 10px 0 6px;
  font-weight: 400;
  letter-spacing: -0.01em;
}
.ross-home__story-detail {
  font-size: 13.5px; color: var(--hf-ink-2);
  line-height: 1.55; max-width: 500px;
  margin: 0;
}
.ross-home__story-actions {
  display: flex; align-items: center; gap: 8px;
  margin-top: 16px; flex-wrap: wrap;
}
.ross-home__story-footnote {
  font-size: 11px; color: var(--hf-muted);
  margin-left: auto;
}
.ross-home__story-sidecar {
  background: var(--hf-bg2);
  padding: 18px;
  border-left: 1px solid var(--hf-line);
  display: flex; flex-direction: column; justify-content: center; align-items: center;
}
.ross-home__story-value {
  font-family: var(--hf-font-display);
  font-feature-settings: "tnum", "lnum";
  font-size: 38px;
  letter-spacing: -0.02em;
  line-height: 1;
}
.ross-home__story-unit { font-size: 20px; color: var(--hf-muted); margin-left: 2px; }
.ross-home__story-target, .ross-home__story-delta { font-size: 10px; color: var(--hf-muted); margin: 4px 0 6px; }
.ross-home__story-delta--good { color: var(--hf-good); }

/* Quick jump row */
.ross-home__jumps {
  margin-top: 28px;
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
}

/* Right rail */
.ross-home__rail {
  border-left: 1px solid var(--hf-line);
  background: var(--hf-paper);
  padding: 24px 20px;
  overflow: auto;
}
.ross-home__ask {
  background: var(--hf-ink);
  color: var(--hf-bg);
  padding: 18px;
  border-radius: var(--hf-radius-md);
  position: relative; overflow: hidden;
}
.ross-home__ask-head {
  display: flex; align-items: center; gap: 8px; margin-bottom: 10px;
}
.ross-home__ask-eyebrow {
  font-family: var(--hf-font-mono);
  font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase;
  color: #aaa;
}
.ross-home__ask-head :deep(.hf-kbd) {
  margin-left: auto; color: #bbb; border-color: #333; background: transparent;
}
.ross-home__ask-prompt {
  font-family: var(--hf-font-display);
  font-size: 18px; line-height: 1.25;
  font-style: italic;
  margin: 0;
  color: var(--hf-bg);
}
.ross-home__ask-recent {
  margin-top: 14px; padding-top: 12px;
  border-top: 1px solid #2a2620;
}
.ross-home__ask-recent-head {
  font-size: 10px; color: #888; margin-bottom: 6px;
}
.ross-home__ask-recent-line {
  font-size: 12.5px; color: #ddd; padding: 3px 0;
}

.ross-home__section { margin-top: 24px; }
.ross-home__section-head {
  display: flex; justify-content: space-between; align-items: baseline;
}
.ross-home__section-meta { font-size: 10px; color: var(--hf-good); }

.ross-home__venue {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid var(--hf-line);
}
.ross-home__venue-dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
.ross-home__venue-body { flex: 1; min-width: 0; }
.ross-home__venue-name { font-size: 13px; font-weight: 500; }
.ross-home__venue-meta { font-size: 10px; color: var(--hf-muted); }
.ross-home__venue-spark { width: 54px; flex-shrink: 0; }

.ross-home__suggestions { margin-top: 8px; display: flex; flex-direction: column; gap: 8px; }
.ross-home__suggestion-foot {
  display: flex; align-items: center; justify-content: space-between;
  margin-top: 4px;
}
.ross-home__suggestion.is-illustrative {
  border-style: dashed;
  background: var(--hf-paper);
}
.ross-home__illustrative-tag {
  font-size: 9px;
  color: var(--hf-muted);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  padding: 1px 6px;
  border: 1px solid var(--hf-line-2);
  border-radius: 3px;
}
.ross-home__suggestion { padding: 12px; background: var(--hf-bg); }
.ross-home__suggestion-text { font-size: 12.5px; line-height: 1.4; }
.ross-home__suggestion-action {
  font-size: 11px; color: var(--hf-accent-2);
  text-decoration: none;
  font-family: var(--hf-font-mono);
  margin-top: 4px; display: inline-block;
  cursor: pointer;
}

.ross-home__loading {
  width: 100%; min-height: 100vh;
  display: grid; place-items: center;
  background: var(--hf-bg);
}

.ross-home__dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
</style>

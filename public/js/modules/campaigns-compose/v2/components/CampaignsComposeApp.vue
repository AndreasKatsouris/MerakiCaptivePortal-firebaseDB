<script setup>
// Campaigns Compose — sidebar + composition surface + projection rail.
// Message body is rendered from structured parts (no v-html). The
// Instrument-Serif body + pale yellow token highlight mirror an email
// editor aesthetic without being an actual WYSIWYG.
import { onMounted, computed } from 'vue'
import { useCampaignsComposeStore } from '../store.js'
import {
  HfIcon, HfChip, HfCard, HfButton, HfAvatar, HfLogo, HfNavItem,
} from '/js/design-system/hifi/index.js'

const store = useCampaignsComposeStore()
onMounted(() => { if (!store.data) store.load() })

const data = computed(() => store.data)

const nav = [
  { label: 'ROSS v2',    icon: 'bolt',    href: '/ross.html' },
  { label: 'Overview',   icon: 'chart',   href: '/group-overview-v2.html' },
  { label: 'Guests',     icon: 'users',   href: '/guests-v2.html' },
  { label: 'Queue',      icon: 'clock',   href: '/queue-v2.html' },
  { label: 'Analytics',  icon: 'line',    href: '/analytics-v2.html' },
  { label: 'Food cost',  icon: 'leaf',    href: '/food-cost-v2.html' },
  { label: 'Campaigns',  icon: 'send',    active: true },
  { label: 'Settings',   icon: 'gear',    href: '/admin-dashboard.html' },
]

const impactTone = {
  good: 'var(--hf-good)',
  warn: 'var(--hf-warn)',
  default: 'var(--hf-ink)',
}
const resultTone = {
  good: 'var(--hf-good)',
  ink:  'var(--hf-ink)',
  warn: 'var(--hf-warn)',
}
</script>

<template>
  <div class="campaigns" v-if="data">
    <aside class="campaigns__sidebar">
      <HfLogo :size="20" />
      <div class="campaigns__nav">
        <HfNavItem v-for="n in nav" :key="n.label"
          :label="n.label" :icon="n.icon" :href="n.href" :active="!!n.active" />
      </div>
    </aside>

    <main class="campaigns__main">
      <header class="campaigns__header">
        <div>
          <div class="hf-eyebrow">{{ data.header.eyebrow }}</div>
          <h1 class="campaigns__title">{{ data.header.title }}</h1>
        </div>
        <div class="campaigns__header-actions">
          <HfButton
            v-for="a in data.header.actions" :key="a.id"
            :variant="a.variant" size="sm"
          >
            <template v-if="a.icon" #leading><HfIcon :name="a.icon" :size="13" /></template>
            {{ a.label }}
          </HfButton>
        </div>
      </header>

      <div class="campaigns__row">
        <!-- Composition column -->
        <div class="campaigns__compose">
          <!-- Audience -->
          <HfCard :padded="false" class="campaigns__panel">
            <div class="campaigns__panel-head">
              <div class="hf-eyebrow">01 · Audience</div>
              <a class="campaigns__panel-link">{{ data.audience.editLink }}</a>
            </div>
            <div class="campaigns__audience">
              <div class="hf-num campaigns__audience-count">{{ data.audience.count }}</div>
              <div class="campaigns__audience-body">
                <div class="campaigns__audience-name">{{ data.audience.name }}</div>
                <div class="hf-mono campaigns__audience-criteria">{{ data.audience.criteria }}</div>
              </div>
              <div class="campaigns__audience-avatars">
                <HfAvatar v-for="i in data.audience.previewAvatars" :key="i" :initials="i" :size="28" />
                <HfChip>+{{ data.audience.overflowCount }}</HfChip>
              </div>
            </div>
          </HfCard>

          <!-- Message -->
          <HfCard :padded="false" class="campaigns__panel">
            <div class="campaigns__panel-head">
              <div class="hf-eyebrow">02 · Message · {{ store.activeChannel === 'email' ? 'Email' : store.activeChannel === 'sms' ? 'SMS' : 'WhatsApp' }}</div>
              <div class="campaigns__channels">
                <button
                  v-for="c in data.message.channels" :key="c.id"
                  :class="['campaigns__channel', { 'is-active': store.activeChannel === c.id }]"
                  @click="store.setChannel(c.id)"
                  :aria-pressed="store.activeChannel === c.id"
                >{{ c.label }}</button>
              </div>
            </div>

            <article class="campaigns__preview">
              <div class="hf-mono campaigns__preview-label">Subject</div>
              <h2 class="campaigns__preview-subject">
                <template v-for="(p, i) in data.message.subjectParts" :key="i">
                  <span v-if="p.type === 'token'" class="campaigns__token">{{ p.value }}</span>
                  <template v-else>{{ p.value }}</template>
                </template>
              </h2>
              <div class="campaigns__preview-body">
                <p
                  v-for="(para, i) in data.message.body" :key="i"
                  :class="{ 'is-italic': para.italic, 'is-muted': para.muted }"
                >
                  <template v-for="(part, j) in para.parts" :key="j">
                    <strong v-if="part.type === 'strong'">{{ part.value }}</strong>
                    <template v-else>{{ part.value }}</template>
                  </template>
                </p>
              </div>
              <div class="campaigns__preview-ctas">
                <HfButton
                  v-for="b in data.message.ctaButtons" :key="b.id"
                  :variant="b.variant" size="sm"
                >{{ b.label }}</HfButton>
              </div>
            </article>

            <div class="campaigns__ross-tools">
              <HfChip v-for="t in data.message.rossTools" :key="t.id">
                <template #leading>
                  <HfIcon v-if="t.icon" :name="t.icon" :size="11" />
                </template>
                {{ t.label }}
              </HfChip>
            </div>
          </HfCard>

          <!-- Timing -->
          <HfCard :padded="false" class="campaigns__panel">
            <div class="hf-eyebrow">03 · Timing</div>
            <div class="campaigns__timing">
              <div class="campaigns__timing-body">
                <div class="campaigns__timing-headline">{{ data.timing.headline }}</div>
                <div class="hf-mono campaigns__timing-caption">{{ data.timing.caption }}</div>
              </div>
              <div class="campaigns__timing-options">
                <button
                  v-for="o in data.timing.options" :key="o.id"
                  :class="['campaigns__timing-chip', { 'is-active': store.activeTiming === o.id, 'is-accent': o.tone === 'accent' }]"
                  @click="store.setTiming(o.id)"
                  :aria-pressed="store.activeTiming === o.id"
                >
                  <HfIcon v-if="o.id === 'ross'" name="sparkle" :size="11" />
                  {{ o.label }}
                </button>
              </div>
            </div>
          </HfCard>
        </div>

        <!-- Right rail: projections + notes + recent -->
        <div class="campaigns__rail">
          <HfCard :padded="false" class="campaigns__panel">
            <div class="hf-eyebrow">Projected impact</div>
            <div class="campaigns__impact">
              <div v-for="m in data.impact" :key="m.key" class="campaigns__impact-tile">
                <div class="hf-num campaigns__impact-value" :style="{ color: impactTone[m.tone] }">{{ m.value }}</div>
                <div class="hf-mono campaigns__impact-caption">{{ m.caption }}</div>
              </div>
            </div>
          </HfCard>

          <section class="campaigns__notes">
            <div class="hf-grain" />
            <div class="hf-eyebrow campaigns__notes-eyebrow">
              <HfIcon name="sparkle" :size="11" color="var(--hf-accent)" />
              Ross notes
            </div>
            <ul class="campaigns__notes-list">
              <li v-for="(n, i) in data.notes" :key="i">{{ n }}</li>
            </ul>
          </section>

          <HfCard :padded="false" class="campaigns__panel">
            <div class="hf-eyebrow">Recent campaigns</div>
            <ul class="campaigns__recent">
              <li v-for="c in data.recent" :key="c.id">
                <div class="campaigns__recent-body">
                  <div class="campaigns__recent-name">{{ c.name }}</div>
                  <div class="hf-mono campaigns__recent-sent">{{ c.sent }}</div>
                </div>
                <div class="hf-mono campaigns__recent-result" :style="{ color: resultTone[c.tone] }">{{ c.result }}</div>
              </li>
            </ul>
          </HfCard>
        </div>
      </div>
    </main>
  </div>

  <div v-else class="campaigns__loading"><div class="hf-eyebrow">Loading…</div></div>
</template>

<style scoped>
.campaigns {
  width: 100%; min-height: 100vh;
  display: grid; grid-template-columns: 220px 1fr;
  background: var(--hf-bg);
}
@media (max-width: 720px) { .campaigns { grid-template-columns: 1fr; } .campaigns__sidebar { display: none; } }

.campaigns__sidebar {
  background: var(--hf-bg2);
  border-right: 1px solid var(--hf-line);
  padding: 20px 16px;
}
.campaigns__nav { margin-top: 20px; display: flex; flex-direction: column; gap: 2px; }

.campaigns__main { padding: 28px 36px 48px; min-width: 0; }

.campaigns__header {
  display: flex; justify-content: space-between; align-items: flex-end;
  gap: 16px; flex-wrap: wrap;
}
.campaigns__title {
  font-family: var(--hf-font-display);
  font-size: 40px; letter-spacing: -0.015em;
  margin: 4px 0 0; font-weight: 400;
}
.campaigns__header-actions { display: flex; gap: 8px; flex-wrap: wrap; }

.campaigns__row {
  display: grid; grid-template-columns: 1fr 380px;
  gap: 20px; margin-top: 24px;
}
@media (max-width: 1100px) { .campaigns__row { grid-template-columns: 1fr; } }

.campaigns__compose { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.campaigns__rail    { display: flex; flex-direction: column; gap: 14px; min-width: 0; }

.campaigns__panel { padding: 20px; }
.campaigns__panel-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
.campaigns__panel-link { font-size: 11px; color: var(--hf-accent-2); font-family: var(--hf-font-mono); cursor: pointer; }

/* Audience */
.campaigns__audience {
  display: flex; align-items: center; gap: 14px;
  margin-top: 10px; flex-wrap: wrap;
}
.campaigns__audience-count { font-size: 44px; line-height: 1; }
.campaigns__audience-body { min-width: 0; }
.campaigns__audience-name { font-family: var(--hf-font-display); font-size: 20px; letter-spacing: -0.01em; }
.campaigns__audience-criteria { font-size: 11px; color: var(--hf-muted); }
.campaigns__audience-avatars {
  margin-left: auto;
  display: flex; gap: 4px; align-items: center;
  flex-wrap: wrap;
}

/* Channel chips */
.campaigns__channels { display: flex; gap: 6px; }
.campaigns__channel {
  padding: 3px 10px; font-size: 11px;
  border-radius: 999px; border: 1px solid var(--hf-line-2);
  background: var(--hf-paper); color: var(--hf-ink-2);
  cursor: pointer; font-family: var(--hf-font-body);
}
.campaigns__channel:hover { border-color: var(--hf-ink-2); }
.campaigns__channel.is-active { background: var(--hf-ink); color: var(--hf-bg); border-color: var(--hf-ink); }

/* Message preview */
.campaigns__preview {
  margin-top: 14px;
  border: 1px solid var(--hf-line);
  border-radius: var(--hf-radius-md);
  padding: 20px 24px;
  background: var(--hf-bg);
}
.campaigns__preview-label { font-size: 10px; color: var(--hf-muted); }
.campaigns__preview-subject {
  font-family: var(--hf-font-display);
  font-size: 24px; letter-spacing: -0.01em;
  margin: 2px 0 16px; font-weight: 400; line-height: 1.15;
}
.campaigns__token {
  color: var(--hf-accent-2);
  background: rgba(200, 154, 58, 0.14);
  padding: 0 4px;
  border-radius: 2px;
}
.campaigns__preview-body {
  font-family: 'Instrument Serif', Georgia, serif;
  font-size: 14px; line-height: 1.7;
  color: var(--hf-ink-2);
}
.campaigns__preview-body p { margin: 0 0 12px; }
.campaigns__preview-body p:last-child { margin-bottom: 0; }
.campaigns__preview-body p.is-italic { font-style: italic; }
.campaigns__preview-body p.is-muted  { color: var(--hf-muted); }
.campaigns__preview-ctas { display: flex; gap: 8px; margin-top: 20px; flex-wrap: wrap; }

.campaigns__ross-tools { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }

/* Timing */
.campaigns__timing {
  display: flex; gap: 20px; margin-top: 10px;
  align-items: center; flex-wrap: wrap;
}
.campaigns__timing-body { min-width: 0; }
.campaigns__timing-headline { font-family: var(--hf-font-display); font-size: 22px; letter-spacing: -0.01em; }
.campaigns__timing-caption { font-size: 11px; color: var(--hf-good); }
.campaigns__timing-options { margin-left: auto; display: flex; gap: 6px; flex-wrap: wrap; }
.campaigns__timing-chip {
  padding: 3px 10px;
  font-size: 11px;
  border-radius: 999px;
  border: 1px solid var(--hf-line-2);
  background: var(--hf-paper);
  color: var(--hf-ink-2);
  cursor: pointer; font-family: var(--hf-font-body);
  display: inline-flex; align-items: center; gap: 6px;
}
.campaigns__timing-chip:hover { border-color: var(--hf-ink-2); }
.campaigns__timing-chip.is-accent {
  color: var(--hf-accent-2);
  border-color: var(--hf-accent);
  background: transparent;
}
.campaigns__timing-chip.is-active.is-accent {
  background: var(--hf-accent); color: var(--hf-ink); border-color: var(--hf-accent);
}
.campaigns__timing-chip.is-active:not(.is-accent) {
  background: var(--hf-ink); color: var(--hf-bg); border-color: var(--hf-ink);
}

/* Rail */
.campaigns__impact {
  display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 10px;
}
.campaigns__impact-value { font-size: 28px; line-height: 1; }
.campaigns__impact-caption { font-size: 10px; color: var(--hf-muted); margin-top: 4px; }

.campaigns__notes {
  position: relative; overflow: hidden;
  background: var(--hf-ink);
  color: var(--hf-bg);
  padding: 20px;
  border-radius: var(--hf-radius-md);
}
.campaigns__notes-eyebrow { color: var(--hf-accent); display: flex; align-items: center; gap: 6px; }
.campaigns__notes-list {
  margin: 10px 0 0; padding-left: 18px;
  font-size: 13px; line-height: 1.6; color: #ddd;
  position: relative; z-index: 1;
}
.campaigns__notes-list li + li { margin-top: 4px; }

.campaigns__recent { list-style: none; margin: 10px 0 0; padding: 0; }
.campaigns__recent li {
  display: flex; gap: 10px; padding: 10px 0;
  border-bottom: 1px solid var(--hf-line);
  align-items: center;
}
.campaigns__recent li:last-child { border-bottom: none; }
.campaigns__recent-body { flex: 1; min-width: 0; }
.campaigns__recent-name { font-size: 13px; }
.campaigns__recent-sent { font-size: 10px; color: var(--hf-muted); }
.campaigns__recent-result { font-size: 11px; }

.campaigns__loading {
  min-height: 100vh; display: grid; place-items: center;
  background: var(--hf-bg);
}
</style>

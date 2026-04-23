<script setup>
// Queue & Floor — 3-column: waitlist · live floor map · service metrics.
// Subscribes on mount, unsubscribes on unmount. Floor tiles are
// percentage-positioned over an SVG grid so the plan rescales with the
// viewport.
import { onMounted, onBeforeUnmount, computed } from 'vue'
import { useQueueFloorStore } from '../store.js'
import {
  HfIcon, HfChip, HfCard, HfButton, HfSparkline, HfBarChart,
} from '/js/design-system/hifi/index.js'

const store = useQueueFloorStore()
onMounted(() => store.start())
onBeforeUnmount(() => store.stop())

const data = computed(() => store.data)

const statusToken = {
  seated:  { bg: 'var(--hf-paper)',   border: 'var(--hf-ink)',    color: 'var(--hf-ink)'     },
  open:    { bg: 'var(--hf-bg2)',     border: 'var(--hf-line-2)', color: 'var(--hf-muted)'   },
  turning: { bg: '#fcefe7',           border: 'var(--hf-accent)', color: 'var(--hf-accent-2)' },
  bar:     { bg: 'var(--hf-paper)',   border: 'var(--hf-ink)',    color: 'var(--hf-ink)'     },
}
function styleFor(t) {
  const tok = statusToken[t.status] || statusToken.open
  return {
    left: `${t.x}%`,
    top:  `${t.y}%`,
    background: tok.bg,
    border: `${t.flagged ? '2px' : '1px'} solid ${t.flagged ? 'var(--hf-warn)' : tok.border}`,
    color: tok.color,
    boxShadow: t.flagged ? '0 0 0 4px rgba(176, 85, 58, 0.09)' : '0 1px 3px rgba(0, 0, 0, 0.04)',
  }
}
function tableSubtext(t) {
  if (t.status === 'open')    return 'OPEN'
  if (t.status === 'turning') return 'TURNING'
  return t.occupancy
}
</script>

<template>
  <div class="queue-floor" v-if="data">
    <!-- Waitlist column -->
    <aside class="queue-floor__waitlist">
      <div class="queue-floor__waitlist-head">
        <div class="queue-floor__waitlist-title-row">
          <h2 class="queue-floor__title">Waitlist</h2>
          <HfChip tone="warn">{{ data.waitlist.length }} waiting · {{ data.waitlist[0]?.waitMin }}m</HfChip>
        </div>
        <HfButton size="sm" class="queue-floor__add">
          <template #leading><HfIcon name="plus" :size="13" /></template>
          Add party
        </HfButton>
      </div>
      <div class="queue-floor__waitlist-scroll">
        <HfCard
          v-for="p in data.waitlist" :key="p.id"
          :padded="false"
          class="queue-floor__party"
          :class="{ 'is-next': p.next }"
        >
          <div class="queue-floor__party-head">
            <div class="queue-floor__party-name-row">
              <span class="queue-floor__party-name">{{ p.name }}</span>
              <span class="hf-mono queue-floor__party-meta">· party of {{ p.size }}</span>
              <HfIcon v-if="p.vip" name="star" :size="11" color="var(--hf-accent)" />
            </div>
            <span class="hf-mono queue-floor__party-wait">{{ p.waitMin }}m</span>
          </div>
          <div v-if="p.note" class="queue-floor__party-note">{{ p.note }}</div>
          <div class="queue-floor__party-actions">
            <HfButton size="sm" class="queue-floor__party-btn">Seat</HfButton>
            <HfButton variant="ghost" size="sm" class="queue-floor__party-btn">Ping</HfButton>
            <span class="hf-mono queue-floor__party-quoted">quoted {{ p.quote }}</span>
          </div>
        </HfCard>
      </div>
    </aside>

    <!-- Floor map -->
    <main class="queue-floor__main">
      <header class="queue-floor__main-head">
        <div>
          <div class="hf-eyebrow queue-floor__live-eyebrow">
            {{ data.venue.name }} · live
            <span class="queue-floor__freshness" :title="`Last updated ${store.freshness}`">● {{ store.freshness }}</span>
          </div>
          <h1 class="queue-floor__main-title">Floor</h1>
          <div class="hf-mono queue-floor__main-sub">
            {{ data.venue.counts.tables }} tables ·
            {{ data.venue.counts.seated }} seated ·
            {{ data.venue.counts.open }} open ·
            {{ data.venue.counts.turning }} turning
          </div>
        </div>
        <div class="queue-floor__zones">
          <button
            v-for="z in data.venue.zones" :key="z.id"
            :class="['queue-floor__zone', { 'is-active': z.active }]"
            @click="store.setZone(z.id)"
            :aria-pressed="z.active"
          >{{ z.label }}</button>
        </div>
      </header>

      <div class="queue-floor__plan">
        <svg class="queue-floor__plan-svg" viewBox="0 0 100 70" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <pattern id="qf-grid" width="4" height="4" patternUnits="userSpaceOnUse">
              <path d="M 4 0 L 0 0 0 4" fill="none" stroke="var(--hf-line)" stroke-width="0.1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#qf-grid)" />
          <path d="M5,5 L95,5 L95,30 L85,30 L85,55 L5,55 Z" fill="none" stroke="var(--hf-ink-2)" stroke-width="0.4" opacity="0.4" />
          <rect x="60" y="60" width="30" height="5" fill="var(--hf-ink)" opacity="0.08" rx="1" />
          <text x="75" y="63.5" font-size="2.2" fill="var(--hf-muted)" text-anchor="middle" style="font-family: var(--hf-font-mono)">BAR</text>
        </svg>

        <div
          v-for="t in data.tables" :key="t.id"
          class="queue-floor__table"
          :class="{ 'is-flagged': t.flagged }"
          :style="styleFor(t)"
          :aria-label="`Table ${t.id}, ${t.status}${t.occupancy ? ', occupancy ' + t.occupancy : ''}${t.seatedFor ? ', seated for ' + t.seatedFor : ''}`"
        >
          <div class="queue-floor__table-id">{{ t.id }}</div>
          <div class="hf-mono queue-floor__table-sub">{{ tableSubtext(t) }}</div>
          <div v-if="t.seatedFor" class="hf-mono queue-floor__table-time" :class="{ 'is-flagged': t.flagged }">{{ t.seatedFor }}</div>
        </div>

        <!-- Ross annotation -->
        <div class="queue-floor__ross">
          <div class="hf-eyebrow queue-floor__ross-eyebrow">
            <HfIcon name="sparkle" :size="11" color="var(--hf-accent)" />
            {{ data.ross.eyebrow }}
          </div>
          <div class="queue-floor__ross-text">
            <template v-for="(part, i) in data.ross.parts" :key="i">
              <strong v-if="part.type === 'strong'">{{ part.value }}</strong>
              <template v-else>{{ part.value }}</template>
            </template>
          </div>
          <div class="queue-floor__ross-actions">
            <HfButton
              v-for="a in data.ross.actions" :key="a.id"
              :variant="a.variant" size="sm"
              :class="{ 'queue-floor__ghost-on-dark': a.variant === 'ghost' }"
            >{{ a.label }}</HfButton>
          </div>
        </div>
      </div>
    </main>

    <!-- Right rail: service metrics + tonight -->
    <aside class="queue-floor__rail">
      <div class="hf-eyebrow">Service metrics</div>
      <HfCard v-for="m in data.metrics" :key="m.key" :padded="false" class="queue-floor__metric">
        <div class="queue-floor__metric-head">
          <span class="queue-floor__metric-label">{{ m.label }}</span>
          <span class="hf-mono queue-floor__metric-delta" :class="m.good ? 'is-good' : 'is-warn'">{{ m.delta }}</span>
        </div>
        <div class="hf-num queue-floor__metric-value">{{ m.value }}</div>
        <HfSparkline
          :data="m.trend" :height="24"
          :stroke="m.good ? 'var(--hf-good)' : 'var(--hf-warn)'"
          :fill="m.good ? 'var(--hf-good)' : 'var(--hf-warn)'"
        />
      </HfCard>

      <div class="hf-eyebrow queue-floor__tonight-eyebrow">{{ data.tonight.window }}</div>
      <HfCard :padded="false" class="queue-floor__tonight">
        <div class="queue-floor__tonight-summary">{{ data.tonight.summary }}</div>
        <div class="hf-mono queue-floor__tonight-peak">{{ data.tonight.peak }}</div>
        <HfBarChart
          :data="data.tonight.bookingsByHour" :height="40"
          :show-axes="false" :show-tooltip="false"
          title="Tonight bookings by hour"
        />
      </HfCard>
    </aside>
  </div>

  <div v-else class="queue-floor__loading"><div class="hf-eyebrow">Loading floor…</div></div>
</template>

<style scoped>
.queue-floor {
  width: 100%; min-height: 100vh;
  display: grid;
  grid-template-columns: 300px 1fr 280px;
  background: var(--hf-bg);
}
@media (max-width: 1100px) {
  .queue-floor { grid-template-columns: 260px 1fr; }
  .queue-floor__rail { display: none; }
}
@media (max-width: 720px) {
  .queue-floor { grid-template-columns: 1fr; }
  .queue-floor__waitlist { display: none; }
}

/* Waitlist */
.queue-floor__waitlist {
  border-right: 1px solid var(--hf-line);
  background: var(--hf-paper);
  display: flex; flex-direction: column;
  min-height: 100vh;
}
.queue-floor__waitlist-head {
  padding: 18px 16px 12px;
  border-bottom: 1px solid var(--hf-line);
}
.queue-floor__waitlist-title-row { display: flex; justify-content: space-between; align-items: baseline; }
.queue-floor__title {
  font-family: var(--hf-font-display);
  font-size: 22px; margin: 0; font-weight: 400;
  letter-spacing: -0.01em;
}
.queue-floor__add { margin-top: 10px; width: 100%; justify-content: center; }
.queue-floor__waitlist-scroll {
  overflow: auto; padding: 12px;
  display: flex; flex-direction: column; gap: 8px;
}

.queue-floor__party { padding: 12px; }
.queue-floor__party.is-next {
  background: var(--hf-bg2);
  border-color: rgba(26, 24, 18, 0.2);
}
.queue-floor__party-head { display: flex; justify-content: space-between; align-items: baseline; }
.queue-floor__party-name-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.queue-floor__party-name { font-family: var(--hf-font-display); font-size: 17px; }
.queue-floor__party-meta { font-size: 11px; color: var(--hf-muted); }
.queue-floor__party-wait { font-size: 11px; color: var(--hf-warn); }
.queue-floor__party-note { font-size: 11px; color: var(--hf-muted); margin-top: 4px; }
.queue-floor__party-actions { display: flex; gap: 6px; margin-top: 8px; align-items: center; }
.queue-floor__party-btn :deep(.hf-btn), .queue-floor__party-btn.hf-btn {
  font-size: 11px !important; padding: 3px 8px !important;
}
.queue-floor__party-quoted { font-size: 10px; color: var(--hf-muted); margin-left: auto; }

/* Main floor area */
.queue-floor__main {
  padding: 20px;
  overflow: hidden;
  display: flex; flex-direction: column;
  min-width: 0;
}
.queue-floor__main-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.queue-floor__live-eyebrow { display: flex; align-items: center; gap: 8px; }
.queue-floor__freshness { color: var(--hf-good); font-size: 10px; letter-spacing: 0; text-transform: none; font-family: var(--hf-font-mono); }
.queue-floor__main-title {
  font-family: var(--hf-font-display);
  font-size: 32px; margin: 2px 0 0;
  font-weight: 400; letter-spacing: -0.015em;
}
.queue-floor__main-sub { font-size: 12px; color: var(--hf-muted); margin-top: 2px; }
.queue-floor__zones { display: flex; gap: 6px; flex-wrap: wrap; }
.queue-floor__zone {
  padding: 3px 10px; font-size: 11px;
  border-radius: 999px; border: 1px solid var(--hf-line-2);
  background: var(--hf-paper); color: var(--hf-ink-2);
  cursor: pointer; font-family: var(--hf-font-body);
}
.queue-floor__zone:hover { border-color: var(--hf-ink-2); }
.queue-floor__zone.is-active { background: var(--hf-ink); color: var(--hf-bg); border-color: var(--hf-ink); }

/* Floor plan */
.queue-floor__plan {
  flex: 1; margin-top: 16px;
  background: var(--hf-paper);
  border: 1px solid var(--hf-line);
  border-radius: var(--hf-radius-lg);
  position: relative;
  overflow: hidden;
  min-height: 360px;
}
.queue-floor__plan-svg { position: absolute; inset: 0; width: 100%; height: 100%; }

.queue-floor__table {
  position: absolute;
  transform: translate(-50%, -50%);
  border-radius: var(--hf-radius-md);
  padding: 8px 12px;
  min-width: 72px;
  text-align: center;
  transition: border-color 150ms, box-shadow 200ms;
}
.queue-floor__table-id { font-family: var(--hf-font-display); font-size: 16px; line-height: 1; }
.queue-floor__table-sub { font-size: 9px; color: var(--hf-muted); margin-top: 3px; }
.queue-floor__table-time { font-size: 9px; color: var(--hf-muted); }
.queue-floor__table-time.is-flagged { color: var(--hf-warn); }

.queue-floor__ross {
  position: absolute; right: 24px; bottom: 24px;
  max-width: 260px;
  background: var(--hf-ink); color: var(--hf-bg);
  border: 1px solid var(--hf-ink);
  border-radius: var(--hf-radius-md);
  padding: 12px;
}
.queue-floor__ross-eyebrow { color: var(--hf-accent); display: flex; align-items: center; gap: 6px; }
.queue-floor__ross-text { font-size: 13px; margin-top: 4px; line-height: 1.4; }
.queue-floor__ross-text strong { color: var(--hf-bg); font-weight: 600; }
.queue-floor__ross-actions { display: flex; gap: 6px; margin-top: 8px; }
.queue-floor__ghost-on-dark :deep(.hf-btn),
.queue-floor__ghost-on-dark.hf-btn {
  color: var(--hf-bg) !important;
  border-color: #333 !important;
  background: transparent !important;
}

/* Right rail */
.queue-floor__rail {
  border-left: 1px solid var(--hf-line);
  background: var(--hf-paper);
  padding: 20px;
  overflow: auto;
  min-height: 100vh;
}
.queue-floor__metric { padding: 14px; margin-top: 10px; }
.queue-floor__metric-head { display: flex; justify-content: space-between; align-items: baseline; }
.queue-floor__metric-label { font-size: 12px; color: var(--hf-muted); }
.queue-floor__metric-delta { font-size: 10px; }
.queue-floor__metric-delta.is-good { color: var(--hf-good); }
.queue-floor__metric-delta.is-warn { color: var(--hf-warn); }
.queue-floor__metric-value { font-size: 26px; line-height: 1; margin: 2px 0 6px; }

.queue-floor__tonight-eyebrow { margin-top: 22px; }
.queue-floor__tonight { padding: 12px; margin-top: 8px; }
.queue-floor__tonight-summary { font-size: 12.5px; }
.queue-floor__tonight-peak { font-size: 10px; color: var(--hf-muted); margin-top: 4px; margin-bottom: 8px; }

.queue-floor__loading {
  min-height: 100vh; display: grid; place-items: center;
  background: var(--hf-bg);
}
</style>

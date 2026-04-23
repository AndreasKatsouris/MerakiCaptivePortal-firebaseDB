<script setup>
// Ross's first-run hello: three surprising findings on an inked stage.
// On "Show me everything" → continues to the existing business-data
// wizard at /onboarding-wizard.html (preserving the wizard as-is).
import { onMounted, computed } from 'vue'
import { useRossStore } from '../store.js'
import { HfIcon, HfButton, HfLogo } from '/js/design-system/hifi/index.js'

const store = useRossStore()
onMounted(() => { if (!store.findings) store.loadFindings() })

const data = computed(() => store.findings)

const stepTotal = 5
const stepCurrent = 3

function onContinue() {
  window.location.href = '/onboarding-wizard.html'
}
function onTour() {
  // Tour is not yet built — keep the button until the tour flow ships.
  window.location.href = '/onboarding-wizard.html?tour=1'
}
</script>

<template>
  <div class="ross-hello" :class="{ 'ross-hello--ready': !!data }">
    <div class="hf-grain ross-hello__grain" />
    <div class="ross-hello__glow" />

    <div class="ross-hello__inner" v-if="data">
      <header class="ross-hello__head">
        <HfLogo :size="22" color="var(--hf-bg)" />
        <span class="hf-mono ross-hello__step">STEP {{ stepCurrent }} OF {{ stepTotal }} · RESTAURANT SETUP</span>
      </header>

      <section class="ross-hello__intro">
        <div class="hf-eyebrow ross-hello__eyebrow">
          <HfIcon name="sparkle" :size="11" color="var(--hf-accent)" />
          {{ data.intro.eyebrow }}
        </div>
        <h1 class="ross-hello__headline">
          {{ data.intro.headline }}<br />
          <span class="ross-hello__headline-italic">{{ data.intro.subline }}</span>
        </h1>
        <p class="ross-hello__lead">{{ data.intro.lead }}</p>
      </section>

      <div class="ross-hello__findings">
        <article
          v-for="f in data.findings" :key="f.id"
          class="ross-hello__finding"
          :class="{ 'ross-hello__finding--accent': f.accent }"
        >
          <div class="hf-mono ross-hello__finding-num">{{ f.id }}</div>
          <div class="ross-hello__finding-headline">{{ f.headline }}</div>
          <div class="ross-hello__finding-detail">{{ f.detail }}</div>
        </article>
      </div>

      <div class="ross-hello__actions">
        <HfButton variant="accent" @click="onContinue">
          Show me everything
          <template #trailing><HfIcon name="arrow" :size="14" /></template>
        </HfButton>
        <button class="ross-hello__ghost-btn" @click="onTour">Take the tour first</button>

        <div class="ross-hello__progress" aria-hidden="true">
          <div
            v-for="i in stepTotal" :key="i"
            class="ross-hello__progress-bar"
            :class="{ 'is-filled': i <= stepCurrent }"
          />
        </div>
      </div>
    </div>

    <div v-else class="ross-hello__loading hf-eyebrow">Ross is reading your data…</div>
  </div>
</template>

<style scoped>
.ross-hello {
  width: 100%; min-height: 100vh;
  background: var(--hf-ink);
  color: var(--hf-bg);
  display: flex; align-items: center; justify-content: center;
  position: relative; overflow: hidden;
  padding: 24px;
}
.ross-hello__grain { opacity: 0.08; }
.ross-hello__glow {
  position: absolute; inset: 0; pointer-events: none;
  background:
    radial-gradient(circle at 20% 30%, rgba(200, 154, 58, 0.20), transparent 50%),
    radial-gradient(circle at 80% 70%, rgba(200, 154, 58, 0.08), transparent 45%);
}

.ross-hello__inner {
  width: 100%; max-width: 720px;
  padding: 48px;
  position: relative; z-index: 1;
}
@media (max-width: 720px) {
  .ross-hello__inner { padding: 24px 4px; }
}

.ross-hello__head {
  display: flex; align-items: center; gap: 12px;
}
.ross-hello__step {
  font-size: 10px; color: #888;
  letter-spacing: 0.14em; margin-left: auto;
}

.ross-hello__intro { margin-top: 56px; }
.ross-hello__eyebrow {
  color: var(--hf-accent);
  display: flex; align-items: center; gap: 6px;
}
.ross-hello__headline {
  font-family: var(--hf-font-display);
  font-size: 64px; line-height: 1;
  letter-spacing: -0.025em;
  margin: 14px 0 18px;
  font-weight: 400;
  color: var(--hf-bg);
}
.ross-hello__headline-italic { font-style: italic; color: #d6cfbd; }
.ross-hello__lead {
  font-size: 17px; line-height: 1.6;
  color: #c9c4b3; max-width: 560px;
  margin: 0;
}
@media (max-width: 720px) {
  .ross-hello__headline { font-size: 40px; }
  .ross-hello__lead { font-size: 15px; }
}

.ross-hello__findings {
  display: grid; grid-template-columns: repeat(3, 1fr);
  gap: 18px; margin-top: 40px;
}
@media (max-width: 720px) {
  .ross-hello__findings { grid-template-columns: 1fr; }
}
.ross-hello__finding {
  padding-top: 12px;
  border-top: 1px solid #444;
  color: #e8e3d5;
}
.ross-hello__finding--accent { border-top-color: var(--hf-accent); color: var(--hf-accent); }
.ross-hello__finding-num {
  font-size: 10px; color: currentColor; letter-spacing: 0.14em;
}
.ross-hello__finding-headline {
  font-size: 15px; margin-top: 8px; line-height: 1.4;
  color: currentColor;
}
.ross-hello__finding-detail {
  font-size: 13px; color: #aea89a; line-height: 1.5;
  margin-top: 8px;
}
.ross-hello__finding--accent .ross-hello__finding-detail { color: rgba(200, 154, 58, 0.75); }

.ross-hello__actions {
  display: flex; align-items: center; gap: 14px;
  margin-top: 48px; flex-wrap: wrap;
}
.ross-hello__ghost-btn {
  background: transparent;
  color: var(--hf-bg);
  border: 1px solid #444;
  padding: 12px 20px;
  border-radius: var(--hf-radius);
  font-size: 13px;
  font-family: var(--hf-font-body);
  cursor: pointer;
  transition: border-color 150ms var(--hf-ease);
}
.ross-hello__ghost-btn:hover { border-color: #777; }

.ross-hello__progress {
  margin-left: auto; display: flex; gap: 6px;
}
.ross-hello__progress-bar { width: 24px; height: 2px; background: #333; border-radius: 1px; }
.ross-hello__progress-bar.is-filled { background: var(--hf-accent); }

.ross-hello__loading {
  color: var(--hf-muted);
  font-size: 12px;
}
</style>

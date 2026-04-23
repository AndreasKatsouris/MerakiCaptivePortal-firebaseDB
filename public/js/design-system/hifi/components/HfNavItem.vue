<script setup>
// Sidebar navigation row. Renders as <a> when `href` is given, otherwise <button>.
import { computed } from 'vue'

const props = defineProps({
  label:  { type: String, required: true },
  icon:   { type: String, default: null },
  href:   { type: String, default: null },
  active: { type: Boolean, default: false },
  badge:  { type: [String, Number], default: null },
})

const tag = computed(() => props.href ? 'a' : 'button')
</script>

<template>
  <component
    :is="tag"
    :href="href || undefined"
    :class="['hf-nav-item', { 'hf-nav-item--active': active }]"
    :aria-current="active ? 'page' : undefined"
  >
    <span v-if="icon || $slots.icon" class="hf-nav-item__icon">
      <slot name="icon">
        <HfIcon v-if="icon" :name="icon" :size="16" />
      </slot>
    </span>
    <span class="hf-nav-item__label">{{ label }}</span>
    <span v-if="badge !== null" class="hf-nav-item__badge">{{ badge }}</span>
  </component>
</template>

<script>
import HfIcon from './HfIcon.vue'
export default { components: { HfIcon } }
</script>

<style scoped>
.hf-nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  font-size: 13px;
  color: var(--hf-ink-2);
  border-radius: var(--hf-radius);
  cursor: pointer;
  letter-spacing: 0.005em;
  font-family: var(--hf-font-body);
  border: none;
  background: transparent;
  width: 100%;
  text-align: left;
  text-decoration: none;
  transition: background var(--hf-transition), color var(--hf-transition);
}
.hf-nav-item:hover { background: var(--hf-bg); }
.hf-nav-item:focus-visible { outline: 2px solid var(--hf-accent); outline-offset: 1px; }
.hf-nav-item--active, .hf-nav-item--active:hover {
  background: var(--hf-ink);
  color: var(--hf-bg);
}
.hf-nav-item__label { flex: 1; }
.hf-nav-item__badge {
  font-family: var(--hf-font-mono);
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--hf-line);
  color: var(--hf-muted);
}
.hf-nav-item--active .hf-nav-item__badge {
  background: rgba(247, 244, 236, 0.15);
  color: var(--hf-bg);
}
</style>

<script setup>
// Custom listbox — replaces the native <select> so the dropdown panel
// honours --hf-* tokens (the native panel is OS-rendered and ignores
// the design system). Implements WAI-ARIA combobox/listbox semantics:
//   - Space / Enter / ArrowDown on trigger opens the panel
//   - ArrowUp/ArrowDown move focus across options
//   - Home/End jump to first/last
//   - Enter / Space selects the active option, closes the panel
//   - Escape closes without changing the value
//   - Click-outside closes
//   - aria-expanded / aria-activedescendant track state for SR users
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  modelValue:  { type: [String, Number, null], default: '' },
  options:     { type: Array, default: () => [] },
  placeholder: { type: String, default: 'Select…' },
  disabled:    { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])

const open       = ref(false)
const activeIdx  = ref(-1)
const rootEl     = ref(null)
const panelEl    = ref(null)
const id         = `hf-select-${Math.random().toString(36).slice(2, 9)}`

const selectedOption = computed(() =>
  props.options.find(o => o.value === props.modelValue) || null
)
const labelText = computed(() =>
  selectedOption.value ? selectedOption.value.label : props.placeholder
)

function toggle() {
  if (props.disabled) return
  open.value ? close() : openPanel()
}

function openPanel() {
  open.value = true
  // Land focus on the currently-selected option, or the first option if
  // nothing is selected yet — better than starting at -1, which would
  // require an extra ArrowDown to begin keyboard navigation.
  const initialIdx = props.options.findIndex(o => o.value === props.modelValue)
  activeIdx.value = initialIdx >= 0 ? initialIdx : 0
  nextTick(() => scrollActiveIntoView())
}

function close() {
  open.value = false
  activeIdx.value = -1
}

function pick(i) {
  const opt = props.options[i]
  if (!opt) return
  emit('update:modelValue', opt.value)
  close()
}

function move(delta) {
  if (!props.options.length) return
  if (!open.value) { openPanel(); return }
  const next = (activeIdx.value + delta + props.options.length) % props.options.length
  activeIdx.value = next
  nextTick(() => scrollActiveIntoView())
}

function scrollActiveIntoView() {
  if (!panelEl.value) return
  const el = panelEl.value.querySelector(`[data-idx="${activeIdx.value}"]`)
  if (el && typeof el.scrollIntoView === 'function') {
    el.scrollIntoView({ block: 'nearest' })
  }
}

function onKeydown(e) {
  if (props.disabled) return
  switch (e.key) {
    case 'ArrowDown': e.preventDefault(); move(1); break
    case 'ArrowUp':   e.preventDefault(); move(-1); break
    case 'Home':      if (open.value) { e.preventDefault(); activeIdx.value = 0; nextTick(scrollActiveIntoView) } break
    case 'End':       if (open.value) { e.preventDefault(); activeIdx.value = props.options.length - 1; nextTick(scrollActiveIntoView) } break
    case 'Enter':
    case ' ':
      e.preventDefault()
      open.value ? pick(activeIdx.value) : openPanel()
      break
    case 'Escape':
      if (open.value) { e.preventDefault(); close() }
      break
    case 'Tab':
      if (open.value) close()
      break
  }
}

function onDocClick(e) {
  if (!open.value) return
  if (rootEl.value && !rootEl.value.contains(e.target)) close()
}

onMounted(() => document.addEventListener('mousedown', onDocClick))
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocClick))

// Reset when options change so an active index past the end can't linger.
watch(() => props.options.length, () => {
  if (activeIdx.value >= props.options.length) activeIdx.value = -1
})
</script>

<template>
  <div ref="rootEl" class="hf-select" :class="{ 'hf-select--open': open, 'hf-select--disabled': disabled }">
    <button
      type="button"
      class="hf-select__trigger"
      role="combobox"
      :aria-expanded="open"
      :aria-controls="id + '-panel'"
      :aria-activedescendant="open && activeIdx >= 0 ? `${id}-opt-${activeIdx}` : null"
      :aria-haspopup="'listbox'"
      :disabled="disabled"
      @click="toggle"
      @keydown="onKeydown"
    >
      <span class="hf-select__label" :class="{ 'hf-select__label--placeholder': !selectedOption }">
        {{ labelText }}
      </span>
      <span class="hf-select__chevron" :class="{ 'hf-select__chevron--open': open }" aria-hidden="true">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </span>
    </button>

    <ul
      v-show="open"
      :id="id + '-panel'"
      ref="panelEl"
      class="hf-select__panel"
      role="listbox"
    >
      <li
        v-for="(opt, i) in options"
        :key="opt.value"
        :id="`${id}-opt-${i}`"
        :data-idx="i"
        role="option"
        :aria-selected="opt.value === modelValue"
        class="hf-select__option"
        :class="{
          'hf-select__option--active':   i === activeIdx,
          'hf-select__option--selected': opt.value === modelValue,
        }"
        @mousedown.prevent="pick(i)"
        @mouseenter="activeIdx = i"
      >
        <span class="hf-select__option-label">{{ opt.label }}</span>
        <span v-if="opt.value === modelValue" class="hf-select__option-check" aria-hidden="true">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12l5 5L20 7" />
          </svg>
        </span>
      </li>
      <li v-if="!options.length" class="hf-select__empty">No options</li>
    </ul>
  </div>
</template>

<style scoped>
.hf-select {
  position: relative;
  display: block;
  font-family: var(--hf-font-body);
}
.hf-select--disabled { opacity: 0.5; pointer-events: none; }

.hf-select__trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--hf-line-2);
  border-radius: var(--hf-radius);
  background: var(--hf-paper);
  font: inherit;
  font-size: 13px;
  line-height: 1.2;
  color: var(--hf-ink);
  text-align: left;
  cursor: pointer;
  transition: border-color var(--hf-transition), background var(--hf-transition);
}
.hf-select__trigger:hover { border-color: var(--hf-ink-2); }
.hf-select__trigger:focus-visible { outline: 2px solid var(--hf-accent); outline-offset: 2px; }
.hf-select--open .hf-select__trigger { border-color: var(--hf-ink); }

.hf-select__label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hf-select__label--placeholder { color: var(--hf-muted); }

.hf-select__chevron {
  display: inline-flex;
  color: var(--hf-muted);
  transition: transform var(--hf-transition), color var(--hf-transition);
}
.hf-select__chevron--open { transform: rotate(180deg); color: var(--hf-ink); }

.hf-select__panel {
  position: absolute;
  z-index: 50;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  margin: 0;
  padding: 4px;
  list-style: none;
  background: var(--hf-paper);
  border: 1px solid var(--hf-line-2);
  border-radius: var(--hf-radius-md);
  box-shadow: var(--hf-shadow-2);
  max-height: 240px;
  overflow-y: auto;
}

.hf-select__option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 10px;
  border-radius: var(--hf-radius-sm);
  cursor: pointer;
  font-size: 13px;
  color: var(--hf-ink);
  line-height: 1.2;
}
.hf-select__option--active   { background: var(--hf-bg2); }
.hf-select__option--selected { color: var(--hf-ink); }
.hf-select__option--selected.hf-select__option--active { background: var(--hf-bg); }

.hf-select__option-check { color: var(--hf-accent); display: inline-flex; }
.hf-select__option-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.hf-select__empty {
  padding: 10px 12px;
  font-size: 13px;
  color: var(--hf-muted);
  text-align: center;
}
</style>

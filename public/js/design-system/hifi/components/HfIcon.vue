<script setup>
// 1.5px stroke icon set, ported from public/hifi/kit.jsx `Ico` component.
// Add new icons here — keep the 24x24 viewBox convention.
import { computed } from 'vue'

const props = defineProps({
  name:  { type: String, required: true },
  size:  { type: [Number, String], default: 16 },
  color: { type: String, default: 'currentColor' },
  stroke:{ type: [Number, String], default: 1.5 },
})

const paths = {
  search:   '<circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/>',
  bell:     '<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4l2-2Z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  user:     '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
  users:    '<circle cx="9" cy="8" r="3.5"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3 3-5 6-5s6 2 6 5"/><path d="M15 20c0-2 2-4 5-3.5"/>',
  chart:    '<path d="M4 20h16"/><path d="M7 16V10"/><path d="M12 16V6"/><path d="M17 16V13"/>',
  line:     '<path d="M4 18V6"/><path d="M4 18h16"/><path d="M5 15l5-5 4 3 5-7"/>',
  bolt:     '<path d="M13 3 4 14h7l-1 7 9-11h-7l1-7Z"/>',
  clock:    '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  cal:      '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 10h16"/><path d="M9 3v4"/><path d="M15 3v4"/>',
  cart:     '<path d="M3 4h2l2 12h11l2-8H6"/><circle cx="9" cy="20" r="1.3"/><circle cx="17" cy="20" r="1.3"/>',
  route:    '<circle cx="6" cy="6" r="2"/><circle cx="18" cy="18" r="2"/><path d="M8 6h6a4 4 0 0 1 4 4v0a4 4 0 0 1-4 4h-4a4 4 0 0 0-4 4"/>',
  gear:     '<circle cx="12" cy="12" r="3"/><path d="M19.4 15A1.7 1.7 0 0 0 20 14l1-.8a9 9 0 0 0 0-2.4L20 10a1.7 1.7 0 0 0-.6-1l.3-1.2a9 9 0 0 0-2-2l-1.2.3a1.7 1.7 0 0 0-1-.6L14 4.4a9 9 0 0 0-2.4 0L10.8 5.4a1.7 1.7 0 0 0-1 .6L8.6 5.7a9 9 0 0 0-2 2l.3 1.2a1.7 1.7 0 0 0-.6 1L5.3 10.8a9 9 0 0 0 0 2.4L6.3 14a1.7 1.7 0 0 0 .6 1l-.3 1.2a9 9 0 0 0 2 2l1.2-.3a1.7 1.7 0 0 0 1 .6l.8 1.1a9 9 0 0 0 2.4 0l.8-1.1a1.7 1.7 0 0 0 1-.6l1.2.3a9 9 0 0 0 2-2l-.3-1.2Z"/>',
  send:     '<path d="m4 12 16-8-7 16-2-7Z"/><path d="m4 12 9 1"/>',
  plus:     '<path d="M12 5v14"/><path d="M5 12h14"/>',
  arrow:    '<path d="M5 12h14"/><path d="m14 6 6 6-6 6"/>',
  up:       '<path d="M12 19V5"/><path d="m6 11 6-6 6 6"/>',
  down:     '<path d="M12 5v14"/><path d="m6 13 6 6 6-6"/>',
  check:    '<path d="m5 12 5 5L20 7"/>',
  x:        '<path d="m6 6 12 12"/><path d="m6 18 12-12"/>',
  star:     '<path d="m12 3 2.8 6.2 6.7.6-5 4.6 1.5 6.6L12 17.8 6 21l1.5-6.6-5-4.6 6.7-.6Z"/>',
  sparkle:  '<path d="M12 3v4"/><path d="M12 17v4"/><path d="M3 12h4"/><path d="M17 12h4"/><path d="m6 6 2 2"/><path d="m16 16 2 2"/><path d="m6 18 2-2"/><path d="m16 8 2-2"/>',
  fire:     '<path d="M12 3c1 3 5 5 4 10a5 5 0 0 1-10 0c0-3 2-4 3-7 .5 1.5 1 2 2 2.5Z"/>',
  menu:     '<path d="M3 6h18"/><path d="M3 12h18"/><path d="M3 18h18"/>',
  filter:   '<path d="M4 5h16"/><path d="M7 12h10"/><path d="M10 19h4"/>',
  cmd:      '<path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6Z"/>',
  wine:     '<path d="M8 4h8l-1 6a3 3 0 0 1-6 0L8 4Z"/><path d="M12 13v7"/><path d="M9 20h6"/>',
  coffee:   '<path d="M5 10h12v4a5 5 0 0 1-10 0v-4Z"/><path d="M17 12h2a2 2 0 0 1 0 4h-2"/><path d="M8 4v2"/><path d="M12 4v2"/>',
  bed:      '<path d="M3 18v-8h13a4 4 0 0 1 4 4v4"/><path d="M3 14h17"/><circle cx="7" cy="12" r="1.5"/>',
  phone:    '<path d="M5 4h4l2 5-2 1a12 12 0 0 0 5 5l1-2 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"/>',
  mail:     '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 7 9-7"/>',
  dot:      '<circle cx="12" cy="12" r="3"/>',
  ellipsis: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  leaf:     '<path d="M20 4c-2 10-8 14-14 14 0-6 4-12 14-14Z"/><path d="M5 19l8-8"/>',
}

const inner = computed(() => paths[props.name] || paths.dot)
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    :stroke="color"
    :stroke-width="stroke"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    v-html="inner"
  />
</template>

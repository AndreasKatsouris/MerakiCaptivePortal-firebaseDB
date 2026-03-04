<template>
  <div :class="cn('rounded-lg border bg-card text-card-foreground shadow-sm', $attrs.class)">
    <slot />
  </div>
</template>

<script setup>
import { cn } from '../../js/shared/utils-v2.js'

defineProps({
  class: {
    type: String,
    default: ''
  }
})
</script>
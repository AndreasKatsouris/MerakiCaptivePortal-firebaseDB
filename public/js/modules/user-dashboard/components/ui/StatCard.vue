<template>
  <div class="dashboard-card stat-card" :class="{ locked: locked }" :title="locked ? 'Upgrade to access analytics' : ''" @click="locked && $emit('upgrade')">
    <h3>{{ value }}</h3>
    <p>{{ label }}</p>
  </div>
</template>

<script>
export default {
  name: 'StatCard',
  props: {
    value: { type: [String, Number], default: 0 },
    label: { type: String, required: true },
    locked: { type: Boolean, default: false }
  },
  emits: ['upgrade']
}
</script>

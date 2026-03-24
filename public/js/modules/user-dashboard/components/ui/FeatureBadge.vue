<template>
  <span
    class="feature-badge"
    :class="{ locked: !hasAccess }"
    :title="hasAccess ? `${name} enabled` : `Upgrade to access ${name}`"
    :style="{ cursor: hasAccess ? 'default' : 'pointer' }"
    @click="!hasAccess && $emit('upgrade', featureId)"
  >
    <i class="fas" :class="icon" style="margin-right: 4px;"></i>{{ name }}
  </span>
</template>

<script>
export default {
  name: 'FeatureBadge',
  props: {
    featureId: { type: String, required: true },
    name: { type: String, required: true },
    icon: { type: String, required: true },
    hasAccess: { type: Boolean, default: false }
  },
  emits: ['upgrade']
}
</script>

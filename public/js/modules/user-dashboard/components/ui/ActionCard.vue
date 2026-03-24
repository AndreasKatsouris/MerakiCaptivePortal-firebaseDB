<template>
  <a
    href="#"
    class="action-card"
    :class="{ locked: locked }"
    @click.prevent="handleClick"
  >
    <i class="fas" :class="icon"></i>
    <h6>{{ title }}</h6>
    <p>{{ locked ? 'Upgrade to unlock' : description }}</p>
  </a>
</template>

<script>
export default {
  name: 'ActionCard',
  props: {
    icon: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    locked: { type: Boolean, default: false },
    href: { type: String, default: null },
    actionType: { type: String, default: null },
    featureId: { type: String, default: null }
  },
  emits: ['action', 'upgrade'],
  methods: {
    handleClick() {
      if (this.locked) {
        this.$emit('upgrade', this.featureId)
        return
      }
      if (this.actionType) {
        this.$emit('action', this.actionType)
        return
      }
      if (this.href) {
        window.location.href = this.href
      }
    }
  }
}
</script>

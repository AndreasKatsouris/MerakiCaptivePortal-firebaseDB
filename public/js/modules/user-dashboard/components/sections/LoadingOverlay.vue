<template>
  <div v-if="visible" class="page-loading-overlay" :class="{ hidden: hiding }">
    <div class="loading-content">
      <div class="loading-spinner"></div>
      <div class="loading-text">Loading Dashboard</div>
      <div class="loading-subtext">Fetching your data...</div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'LoadingOverlay',
  props: {
    isLoading: { type: Boolean, default: true }
  },
  data() {
    return {
      visible: true,
      hiding: false
    }
  },
  watch: {
    isLoading(newVal) {
      if (!newVal) {
        this.hiding = true
        setTimeout(() => { this.visible = false }, 300)
      }
    }
  }
}
</script>

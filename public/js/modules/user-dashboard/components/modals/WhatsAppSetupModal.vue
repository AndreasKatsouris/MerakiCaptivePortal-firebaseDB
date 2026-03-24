<template>
  <div v-if="show" class="modal fade show d-block" tabindex="-1" style="background: rgba(0,0,0,0.5);">
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Setup WhatsApp Messaging</h5>
          <button type="button" class="btn-close" @click="$emit('close')"></button>
        </div>
        <div class="modal-body text-start">
          <p><strong>Location:</strong> {{ locationName }}</p>
          <p class="text-muted mb-3">This will enable WhatsApp messaging for this location. You can manage WhatsApp numbers from the admin dashboard.</p>
          <div class="alert alert-info">
            <i class="fas fa-info-circle me-2"></i>
            <strong>Note:</strong> You need to have WhatsApp numbers configured in your admin dashboard first.
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" @click="$emit('close')">Cancel</button>
          <button type="button" class="btn btn-success" @click="openAdmin">
            <i class="fab fa-whatsapp me-1"></i>Open Admin Dashboard
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'WhatsAppSetupModal',
  props: {
    show: { type: Boolean, default: false },
    locationName: { type: String, default: '' }
  },
  emits: ['close'],
  methods: {
    openAdmin() {
      window.open('/admin_tools/whatsapp-management.html', '_blank')
      this.$emit('close')
    }
  }
}
</script>

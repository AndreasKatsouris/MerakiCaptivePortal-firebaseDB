<template>
  <div v-if="show" class="modal fade show d-block" tabindex="-1" style="background: rgba(0,0,0,0.5);">
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">{{ title }}</h5>
          <button type="button" class="btn-close" @click="$emit('close')"></button>
        </div>
        <div class="modal-body text-start">
          <p class="mb-3">{{ message }}</p>
          <div class="row" v-if="showPlans">
            <div class="col-md-6">
              <div class="card">
                <div class="card-body text-center">
                  <h6>Starter Plan</h6>
                  <p class="small">1 WhatsApp Number<br>1,000 messages/month</p>
                </div>
              </div>
            </div>
            <div class="col-md-6">
              <div class="card">
                <div class="card-body text-center">
                  <h6>Professional Plan</h6>
                  <p class="small">3 WhatsApp Numbers<br>5,000 messages/month</p>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" @click="$emit('close')">Maybe Later</button>
          <button type="button" class="btn btn-primary" @click="upgrade">
            <i class="fas fa-arrow-up me-1"></i>Upgrade Now
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'UpgradePromptModal',
  props: {
    show: { type: Boolean, default: false },
    title: { type: String, default: 'Upgrade Required' },
    message: { type: String, default: 'This feature is not available in your current plan.' },
    showPlans: { type: Boolean, default: false },
    upgradeUrl: { type: String, default: '/user-subscription.html' }
  },
  emits: ['close'],
  methods: {
    upgrade() {
      window.location.href = this.upgradeUrl
    }
  }
}
</script>

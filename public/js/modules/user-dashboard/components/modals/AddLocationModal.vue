<template>
  <div v-if="show" class="modal fade show d-block" tabindex="-1" style="background: rgba(0,0,0,0.5);">
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Add New Location</h5>
          <button type="button" class="btn-close" @click="close"></button>
        </div>
        <div class="modal-body">
          <form @submit.prevent="save">
            <div class="mb-3">
              <label for="locationName" class="form-label">Location Name</label>
              <input type="text" class="form-control" id="locationName" v-model="form.name" required>
            </div>
            <div class="mb-3">
              <label for="locationAddress" class="form-label">Address</label>
              <input type="text" class="form-control" id="locationAddress" v-model="form.address" required>
            </div>
            <div class="mb-3">
              <label for="locationPhone" class="form-label">Phone Number</label>
              <input type="tel" class="form-control" id="locationPhone" v-model="form.phone" required>
            </div>
            <div class="mb-3">
              <label for="locationType" class="form-label">Location Type</label>
              <select class="form-select" id="locationType" v-model="form.type" required>
                <option value="">Select Type</option>
                <option v-for="t in locationTypes" :key="t.value" :value="t.value">{{ t.label }}</option>
              </select>
            </div>
            <div class="mb-3">
              <label for="locationTimezone" class="form-label">Timezone</label>
              <select class="form-select" id="locationTimezone" v-model="form.timezone" required>
                <option v-for="tz in timezones" :key="tz.value" :value="tz.value">{{ tz.label }}</option>
              </select>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" @click="close">Cancel</button>
          <button type="button" class="btn btn-primary" :disabled="saving" @click="save">
            <span>{{ saving ? 'Saving...' : 'Save Location' }}</span>
            <span v-if="saving" class="spinner-border spinner-border-sm ms-2"></span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { LOCATION_TYPES, TIMEZONES } from '../../constants/dashboard.constants.js'

export default {
  name: 'AddLocationModal',
  props: {
    show: { type: Boolean, default: false }
  },
  emits: ['close', 'save'],
  data() {
    return {
      saving: false,
      form: {
        name: '',
        address: '',
        phone: '',
        type: '',
        timezone: 'Africa/Johannesburg'
      }
    }
  },
  computed: {
    locationTypes() { return LOCATION_TYPES },
    timezones() { return TIMEZONES }
  },
  watch: {
    show(val) {
      if (val) this.resetForm()
    }
  },
  methods: {
    resetForm() {
      this.form = {
        name: '',
        address: '',
        phone: '',
        type: '',
        timezone: 'Africa/Johannesburg'
      }
      this.saving = false
    },
    async save() {
      if (!this.form.name || !this.form.address || !this.form.phone || !this.form.type) {
        return
      }
      this.saving = true
      try {
        this.$emit('save', { ...this.form })
      } finally {
        this.saving = false
      }
    },
    close() {
      this.$emit('close')
    }
  }
}
</script>

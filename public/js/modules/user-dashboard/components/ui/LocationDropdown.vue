<template>
  <li class="nav-item dropdown location-selector">
    <button
      class="btn dropdown-toggle"
      type="button"
      data-bs-toggle="dropdown"
      aria-expanded="false"
    >
      <i class="fas fa-map-marker-alt"></i>
      <span>{{ selectedLabel }}</span>
    </button>
    <ul class="dropdown-menu">
      <li>
        <a
          class="dropdown-item"
          :class="{ active: selectedId === 'all' }"
          href="#"
          @click.prevent="select('all')"
        >
          <i class="fas fa-globe me-2"></i>All Locations
        </a>
      </li>
      <li v-if="locations.length"><hr class="dropdown-divider"></li>
      <li v-for="loc in locations" :key="loc.id">
        <a
          class="dropdown-item"
          :class="{ active: selectedId === loc.id }"
          href="#"
          @click.prevent="select(loc.id)"
        >
          <i class="fas fa-store me-2"></i>{{ loc.name }}
        </a>
      </li>
      <li><hr class="dropdown-divider"></li>
      <li>
        <a class="dropdown-item text-primary" href="#locations">
          <i class="fas fa-cog me-2"></i>Manage Locations
        </a>
      </li>
    </ul>
  </li>
</template>

<script>
export default {
  name: 'LocationDropdown',
  props: {
    locations: { type: Array, default: () => [] },
    selectedId: { type: String, default: 'all' }
  },
  emits: ['select'],
  computed: {
    selectedLabel() {
      if (this.selectedId === 'all') return 'All Locations'
      const loc = this.locations.find(l => l.id === this.selectedId)
      return loc ? loc.name : 'All Locations'
    }
  },
  methods: {
    select(locationId) {
      this.$emit('select', locationId)
    }
  }
}
</script>

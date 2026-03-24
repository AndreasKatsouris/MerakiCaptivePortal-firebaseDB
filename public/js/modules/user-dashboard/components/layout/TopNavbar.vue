<template>
  <nav class="navbar navbar-expand-lg navbar-light fixed-top">
    <div class="container-fluid">
      <a class="navbar-brand" href="#">
        <i class="fas fa-bolt me-2"></i>Sparks Hospitality
      </a>
      <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
        <span class="navbar-toggler-icon"></span>
      </button>
      <div class="collapse navbar-collapse" id="navbarNav">
        <ul class="navbar-nav ms-auto">
          <LocationDropdown
            :locations="locations"
            :selected-id="selectedLocationId"
            @select="$emit('location-change', $event)"
          />
          <SearchBox v-model="localSearch" />
          <NotificationDropdown />
          <!-- User Profile -->
          <li class="nav-item dropdown user-profile-dropdown">
            <a class="dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown" aria-expanded="false">
              <i class="fas fa-user-circle me-1"></i>
              <span>{{ displayName }}</span>
            </a>
            <ul class="dropdown-menu dropdown-menu-end">
              <li><a class="dropdown-item" href="#profile"><i class="fas fa-user me-2"></i>Profile</a></li>
              <li><a class="dropdown-item" href="user-subscription.html"><i class="fas fa-crown me-2"></i>Subscription</a></li>
              <li><a class="dropdown-item" href="#settings"><i class="fas fa-cog me-2"></i>Settings</a></li>
              <li><hr class="dropdown-divider"></li>
              <li><a class="dropdown-item" href="#" @click.prevent="$emit('logout')"><i class="fas fa-sign-out-alt me-2"></i>Logout</a></li>
            </ul>
          </li>
        </ul>
      </div>
    </div>
  </nav>
</template>

<script>
import LocationDropdown from '../ui/LocationDropdown.vue'
import SearchBox from '../ui/SearchBox.vue'
import NotificationDropdown from '../ui/NotificationDropdown.vue'

export default {
  name: 'TopNavbar',
  components: { LocationDropdown, SearchBox, NotificationDropdown },
  props: {
    displayName: { type: String, default: 'User' },
    locations: { type: Array, default: () => [] },
    selectedLocationId: { type: String, default: 'all' }
  },
  emits: ['logout', 'location-change', 'search'],
  data() {
    return { localSearch: '' }
  },
  watch: {
    localSearch(val) {
      this.$emit('search', val)
    }
  }
}
</script>

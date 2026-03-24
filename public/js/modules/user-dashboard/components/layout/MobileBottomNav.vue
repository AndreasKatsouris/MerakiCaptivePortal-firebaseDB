<template>
  <nav class="mobile-bottom-nav">
    <a
      v-for="item in navItems"
      :key="item.href"
      :href="item.href"
      class="nav-item"
      :class="{ active: isActive(item.href) }"
    >
      <i class="fas" :class="item.icon"></i>
      <span>{{ item.label }}</span>
    </a>
    <a href="#" class="nav-item mobile-menu-btn">
      <i class="fas fa-bars"></i>
      <span>Menu</span>
    </a>
  </nav>
</template>

<script>
import { MOBILE_NAV_ITEMS } from '../../constants/navigation.constants.js'

export default {
  name: 'MobileBottomNav',
  computed: {
    navItems() { return MOBILE_NAV_ITEMS }
  },
  methods: {
    isActive(href) {
      const currentPage = window.location.pathname.split('/').pop() || 'user-dashboard.html'
      return href === currentPage
    }
  }
}
</script>

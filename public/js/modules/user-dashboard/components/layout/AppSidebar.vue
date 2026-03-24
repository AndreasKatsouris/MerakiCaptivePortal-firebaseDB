<template>
  <nav id="sidebar" class="sidebar" :class="{ collapsed: collapsed }">
    <div class="sidebar-toggle" @click="$emit('toggle')" title="Toggle Sidebar">
      <i class="fas" :class="collapsed ? 'fa-chevron-right' : 'fa-chevron-left'"></i>
    </div>
    <div class="sidebar-header">
      <h4><i class="fas fa-bolt me-2"></i><span>Sparks</span></h4>
    </div>
    <ul class="nav flex-column sidebar-nav">
      <li class="nav-item" v-for="link in links" :key="link.href">
        <a :href="link.href" class="nav-link" :class="{ active: isActive(link.href) }">
          <i class="fas" :class="link.icon"></i>
          <span>{{ link.label }}</span>
        </a>
      </li>
    </ul>
  </nav>
</template>

<script>
import { SIDEBAR_LINKS } from '../../constants/navigation.constants.js'

export default {
  name: 'AppSidebar',
  props: {
    collapsed: { type: Boolean, default: false }
  },
  emits: ['toggle'],
  computed: {
    links() { return SIDEBAR_LINKS }
  },
  methods: {
    isActive(href) {
      const currentPage = window.location.pathname.split('/').pop() || 'user-dashboard.html'
      return href === currentPage
    }
  }
}
</script>

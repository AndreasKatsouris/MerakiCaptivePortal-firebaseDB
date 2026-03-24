<template>
  <li class="nav-item dropdown">
    <a
      class="notification-bell"
      href="#"
      role="button"
      data-bs-toggle="dropdown"
      aria-expanded="false"
    >
      <i class="fas fa-bell"></i>
      <span v-if="count > 0" class="badge">{{ count }}</span>
    </a>
    <ul class="dropdown-menu dropdown-menu-end" style="min-width: 300px;">
      <li class="dropdown-header d-flex justify-content-between align-items-center">
        <span>Notifications</span>
        <a href="#" class="text-primary" style="font-size: 0.85rem;" @click.prevent="markAllRead">Mark all read</a>
      </li>
      <li><hr class="dropdown-divider"></li>
      <li v-for="notification in notifications" :key="notification.id">
        <a class="dropdown-item" href="#">
          <div class="d-flex">
            <i class="fas" :class="[notification.icon, notification.iconColor]" style="margin-top: 3px; margin-right: 8px;"></i>
            <div>
              <strong>{{ notification.title }}</strong>
              <p class="mb-0 text-muted" style="font-size: 0.85rem;">{{ notification.message }}</p>
              <small class="text-muted">{{ notification.time }}</small>
            </div>
          </div>
        </a>
        <hr class="dropdown-divider">
      </li>
      <li class="text-center">
        <a href="#notifications" class="dropdown-item text-primary">View all notifications</a>
      </li>
    </ul>
  </li>
</template>

<script>
export default {
  name: 'NotificationDropdown',
  data() {
    return {
      count: 3,
      notifications: [
        {
          id: 1,
          icon: 'fa-users',
          iconColor: 'text-primary',
          title: 'New guest added to queue',
          message: 'Party of 4 at Main Restaurant',
          time: '5 minutes ago'
        },
        {
          id: 2,
          icon: 'fa-receipt',
          iconColor: 'text-success',
          title: 'Receipt processed',
          message: 'Reward issued to customer',
          time: '1 hour ago'
        },
        {
          id: 3,
          icon: 'fa-chart-line',
          iconColor: 'text-warning',
          title: 'Food cost alert',
          message: 'Costs above target this week',
          time: '3 hours ago'
        }
      ]
    }
  },
  methods: {
    markAllRead() {
      this.count = 0
    }
  }
}
</script>

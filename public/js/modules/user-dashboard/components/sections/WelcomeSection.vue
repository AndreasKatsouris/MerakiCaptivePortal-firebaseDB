<template>
  <div class="row mb-4">
    <div class="col">
      <h2>Welcome back, {{ userName }}!</h2>
      <p class="text-muted">Here's what's happening with your business today.</p>
    </div>
  </div>
</template>

<script>
export default {
  name: 'WelcomeSection',
  props: {
    userName: { type: String, default: 'User' }
  }
}
</script>

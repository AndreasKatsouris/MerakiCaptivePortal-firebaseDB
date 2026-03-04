<template>
  <div>
    <!-- Dialog Overlay -->
    <Teleport to="body">
      <div
        v-if="open"
        class="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm"
        @click="$emit('update:open', false)"
      ></div>
    </Teleport>

    <!-- Dialog Content -->
    <Teleport to="body">
      <div
        v-if="open"
        class="fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 sm:rounded-lg"
        @click.stop
      >
        <slot />
      </div>
    </Teleport>
  </div>
</template>

<script setup>
defineProps({
  open: {
    type: Boolean,
    default: false
  }
})

defineEmits(['update:open'])
</script>
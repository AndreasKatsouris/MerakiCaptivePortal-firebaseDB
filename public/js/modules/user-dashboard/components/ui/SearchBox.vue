<template>
  <li class="nav-item search-box d-none d-lg-block">
    <input
      type="text"
      class="form-control"
      placeholder="Search..."
      :value="modelValue"
      @input="$emit('update:modelValue', $event.target.value)"
    >
    <i class="fas fa-search"></i>
  </li>
</template>

<script>
export default {
  name: 'SearchBox',
  props: {
    modelValue: { type: String, default: '' }
  },
  emits: ['update:modelValue']
}
</script>

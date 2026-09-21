<script setup lang="ts">
defineProps<{ title: string; description?: string }>()
</script>

<template>
  <div class="page-heading">
    <div><h1>{{ title }}</h1><p v-if="description">{{ description }}</p></div>
    <div v-if="$slots.actions" class="page-actions"><slot name="actions" /></div>
  </div>
</template>

<style scoped>
.page-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; margin-bottom: 16px; }
h1 { margin: 0; color: var(--sa-text-primary); font-size: 20px; font-weight: 600; line-height: 1.35; }
p { margin: 5px 0 0; color: var(--sa-text-secondary); font-size: 13px; line-height: 1.5; }
.page-actions { display: flex; align-items: center; gap: 8px; }
</style>

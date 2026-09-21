<script setup lang="ts">
defineProps<{
  title: string
  description: string
  milestone: string
}>()
</script>

<template>
  <div class="placeholder">
    <h1 class="title">{{ title }}</h1>
    <div class="panel-card card">
      <p class="desc">{{ description }}</p>
      <n-tag size="small" type="warning">{{ milestone }} 实现</n-tag>
    </div>
  </div>
</template>

<style scoped>
.placeholder {
  max-width: 720px;
}
.title {
  margin: 0 0 16px;
  font-size: 18px;
  font-weight: 600;
}
.card {
  padding: 32px;
}
.desc {
  margin: 0 0 16px;
  color: var(--text-secondary);
}
</style>

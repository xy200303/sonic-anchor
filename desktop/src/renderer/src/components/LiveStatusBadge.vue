<script setup lang="ts">
import { computed } from 'vue'
import { useLiveStore } from '@renderer/stores/live'

const live = useLiveStore()

const MAP: Record<string, { label: string; color: string }> = {
  idle: { label: '未开播', color: 'var(--text-tertiary)' },
  ready: { label: '已就绪', color: 'var(--success)' },
  starting: { label: '连接中', color: 'var(--warning)' },
  live: { label: '直播中', color: 'var(--live-red)' },
  paused: { label: '人工接管中', color: 'var(--warning)' },
  ending: { label: '结束中', color: 'var(--warning)' },
  ended: { label: '已结束', color: 'var(--text-tertiary)' },
  error: { label: '异常', color: 'var(--danger)' }
}

const current = computed(() => MAP[live.state])
</script>

<template>
  <span class="badge">
    <span class="dot" :style="{ background: current.color }" />
    {{ current.label }}
  </span>
</template>

<style scoped>
.badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
</style>

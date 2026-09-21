<script setup lang="ts">
import { useAudioStore } from '@renderer/stores/audio'

const audio = useAudioStore()
</script>

<template>
  <div class="meter" aria-label="音频电平">
    <div class="bar" :style="{ width: `${Math.round(audio.levels.master * 100)}%` }" />
  </div>
</template>

<style scoped>
.meter {
  width: 80px;
  height: 6px;
  border-radius: 3px;
  background: var(--border-subtle);
  overflow: hidden;
}
.bar {
  height: 100%;
  background: var(--success);
  transition: width 120ms linear;
}
</style>

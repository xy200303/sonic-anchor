<script setup lang="ts">
import { computed } from 'vue'
import { useConfigStore } from '@renderer/stores/config'
import { useLiveStore } from '@renderer/stores/live'
import LiveStatusBadge from './LiveStatusBadge.vue'

const configStore = useConfigStore()
const live = useLiveStore()

const llmReady = computed(() => configStore.config.llm.apiKey.length > 0)
const ttsReady = computed(
  () => configStore.config.tts.mode === 'local' || configStore.config.tts.apiKey.length > 0
)
const streamReady = computed(
  () =>
    configStore.config.stream.mode === 'companion' ||
    (configStore.config.stream.serverUrl.length > 0 && configStore.config.stream.streamKey.length > 0)
)
</script>

<template>
  <footer class="status-bar">
    <div class="left">
      <LiveStatusBadge />
      <span class="item" :class="{ ok: live.stats.streaming }">
        推流引擎 {{ live.stats.streaming ? '运行中' : '未运行' }}
      </span>
    </div>
    <div class="right">
      <span class="item" :class="{ ok: streamReady }">
        推流{{ streamReady ? '已配置' : '未配置' }}
      </span>
      <span class="item" :class="{ ok: llmReady }"> LLM{{ llmReady ? '已配置' : '未配置' }} </span>
      <span class="item" :class="{ ok: ttsReady }"> TTS{{ ttsReady ? '已配置' : '未配置' }} </span>
      <span class="item muted"> 评论网关 · 待接入 </span>
    </div>
  </footer>
</template>

<style scoped>
.status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 36px;
  padding: 0 16px;
  border-top: 1px solid var(--border-subtle);
  background: var(--bg-base);
  font-size: 12px;
}
.left {
  display: flex;
  gap: 16px;
  align-items: center;
}
.right {
  display: flex;
  gap: 16px;
}
.item {
  color: var(--warning);
}
.item.ok {
  color: var(--success);
}
.item.muted {
  color: var(--text-tertiary);
}
</style>

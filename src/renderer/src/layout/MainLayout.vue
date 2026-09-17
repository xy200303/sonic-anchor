<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import SideNav from '@renderer/components/sidebar/SideNav.vue'
import StatusBar from '@renderer/components/StatusBar.vue'
import { navMenus } from '@renderer/config/nav'
import { useConfigStore } from '@renderer/stores/config'
import { usePlanStore } from '@renderer/stores/plan'
import { useLiveStore } from '@renderer/stores/live'
import { useFeedStore } from '@renderer/stores/feed'
import { useAudioStore } from '@renderer/stores/audio'
import { audioEngine } from '@renderer/audio/engine'
import { playbackScheduler } from '@renderer/audio/scheduler'

const route = useRoute()
const router = useRouter()
const configStore = useConfigStore()
const planStore = usePlanStore()
const live = useLiveStore()
const feed = useFeedStore()
const audio = useAudioStore()

const unsubs: (() => void)[] = []

onMounted(async () => {
  await configStore.load()
  // 场次依赖 config.live.activePlanId，须在配置加载后初始化
  await planStore.load()
  unsubs.push(
    window.api.onLiveStateChanged((state) => live.applyState(state)),
    window.api.onStreamStatsChanged((stats) => live.applyStats(stats)),
    window.api.onCommentBatch((batch) => feed.pushComments(batch)),
    window.api.onReplyQueueChanged((snapshot) => feed.applyQueue(snapshot)),
    window.api.onPanicStop(() => {
      audioEngine.panic()
      audio.setAiMuted(false)
    })
  )
  feed.applyQueue(await window.api.reply.queue())

  audioEngine.init({
    onLevels: (l) => audio.setLevels(l),
    onHumanSpeaking: (speaking) => {
      if (speaking) playbackScheduler.pause()
      else playbackScheduler.resume()
    }
  })

  // 已启用麦克风则接入混音总线（直推模式同时转发 PCM 进流）
  if (configStore.config.audio.micEnabled) {
    audioEngine
      .startMic(configStore.config.audio.micDeviceId, {
        autoYield: configStore.config.audio.autoYield,
        forwardPcm: configStore.config.stream.mode === 'direct'
      })
      .catch((err) => console.warn('[audio] 麦克风接入失败:', err))
  }
})

onBeforeUnmount(() => {
  unsubs.forEach((u) => u())
})

function onSelect(key: string): void {
  if (key.startsWith('/')) void router.push(key)
}
</script>

<template>
  <div class="layout">
    <SideNav
      :menus="navMenus"
      :active-key="route.path"
      brand-mark="AI"
      brand-name="直播助手"
      @select="onSelect"
    />
    <div class="main">
      <main class="content">
        <router-view />
      </main>
      <StatusBar />
    </div>
  </div>
</template>

<style scoped>
.layout {
  display: flex;
  height: 100%;
}
.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.content {
  flex: 1;
  overflow: auto;
  padding: 24px 32px;
  box-sizing: border-box;
}
</style>

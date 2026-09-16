<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { Script } from '@shared/ipc'
import { useConfigStore } from '@renderer/stores/config'
import { audioEngine } from '@renderer/audio/engine'
import { playbackScheduler } from '@renderer/audio/scheduler'

/**
 * 开播辅助控制条：BGM / 画面布局 / 话术播报。
 * 与直播状态无关的辅助操作集中在这里，主操作（开播/停播）留在控制台。
 */

const configStore = useConfigStore()

const scripts = ref<Script[]>([])
const activeScriptId = ref('')
const playing = ref(playbackScheduler.isRunning)
const bgmPlaying = ref(false)

onMounted(async () => {
  scripts.value = await window.api.script.list()
  bgmPlaying.value = audioEngine.bgmPlaying
})

async function pickBgm(): Promise<void> {
  const path = await window.api.dialog.pickFile('音频文件', ['mp3', 'wav', 'm4a', 'flac'])
  if (!path) return
  await configStore.save({ bgm: { path } })
  if (bgmPlaying.value) {
    audioEngine.startBgm(path, configStore.config.bgm.volume)
    void window.api.audioMixer.setBgm('start', path, configStore.config.bgm.volume)
  }
}

function toggleBgm(): void {
  if (bgmPlaying.value) {
    audioEngine.stopBgm()
    void window.api.audioMixer.setBgm('stop')
    bgmPlaying.value = false
  } else {
    const path = configStore.config.bgm.path
    if (!path) {
      void pickBgm()
      return
    }
    audioEngine.startBgm(path, configStore.config.bgm.volume)
    void window.api.audioMixer.setBgm('start', path, configStore.config.bgm.volume)
    bgmPlaying.value = true
  }
}

async function setBgmVolume(v: number): Promise<void> {
  await configStore.save({ bgm: { volume: v } })
  audioEngine.setBgmVolume(v)
  void window.api.audioMixer.setBgm('volume', undefined, v)
}

async function togglePlay(): Promise<void> {
  if (playing.value) {
    playbackScheduler.stop()
    playing.value = false
    return
  }
  if (!activeScriptId.value) return
  const res = await playbackScheduler.start(activeScriptId.value)
  if (res.ok) playing.value = true
}
</script>

<template>
  <div class="controls">
    <div class="group">
      <span class="label">BGM</span>
      <n-button size="small" @click="pickBgm">选择文件</n-button>
      <n-button size="small" :type="bgmPlaying ? 'warning' : 'default'" @click="toggleBgm">
        {{ bgmPlaying ? '停止' : '播放' }}
      </n-button>
      <n-slider
        :value="configStore.config.bgm.volume"
        :min="0"
        :max="1"
        :step="0.05"
        class="volume"
        @update:value="setBgmVolume"
      />
    </div>

    <div class="group">
      <span class="label">话术</span>
      <n-select
        v-model:value="activeScriptId"
        size="small"
        :options="scripts.map((s) => ({ label: s.title, value: s.id }))"
        placeholder="选择话术"
        class="script-select"
        :disabled="playing"
      />
      <n-button
        size="small"
        :type="playing ? 'error' : 'primary'"
        :disabled="!activeScriptId && !playing"
        @click="togglePlay"
      >
        {{ playing ? '停止播报' : '开始播报' }}
      </n-button>
    </div>
  </div>
</template>

<style scoped>
.controls {
  display: flex;
  gap: 24px;
  align-items: center;
  padding: 10px 14px;
  border-top: 1px solid var(--border-subtle);
}
.group {
  display: flex;
  align-items: center;
  gap: 8px;
}
.label {
  font-size: 12px;
  color: var(--text-tertiary);
}
.volume {
  width: 100px;
}
.script-select {
  width: 220px;
}
</style>

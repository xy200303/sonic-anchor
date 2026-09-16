import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { AudioLevels, NowPlaying } from '@shared/ipc'

/** 音频运行状态镜像（引擎/调度器写入，UI 订阅） */
export const useAudioStore = defineStore('audio', () => {
  const levels = ref<AudioLevels>({ tts: 0, master: 0 })
  const nowPlaying = ref<NowPlaying | null>(null)
  const aiMuted = ref(false)

  function setLevels(v: AudioLevels): void {
    levels.value = v
  }

  function setNowPlaying(v: NowPlaying | null): void {
    nowPlaying.value = v
  }

  function setAiMuted(v: boolean): void {
    aiMuted.value = v
  }

  return { levels, nowPlaying, aiMuted, setLevels, setNowPlaying, setAiMuted }
})

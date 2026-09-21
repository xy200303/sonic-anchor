import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { AudioLevels, NowPlaying } from '@shared/ipc'

/** 音频运行状态镜像（引擎/调度器写入，UI 订阅） */
export const useAudioStore = defineStore('audio', () => {
  const levels = ref<AudioLevels>({ tts: 0, master: 0 })
  const nowPlaying = ref<NowPlaying | null>(null)
  const aiMuted = ref(false)
  /** 话术轮播接下来要播的段落（提词器"接下来"区域用，调度器维护） */
  const upcomingSegments = ref<{ label: string; text: string }[]>([])

  function setLevels(v: AudioLevels): void {
    levels.value = v
  }

  function setNowPlaying(v: NowPlaying | null): void {
    nowPlaying.value = v
  }

  function setAiMuted(v: boolean): void {
    aiMuted.value = v
  }

  function setUpcomingSegments(v: { label: string; text: string }[]): void {
    upcomingSegments.value = v
  }

  return {
    levels,
    nowPlaying,
    aiMuted,
    upcomingSegments,
    setLevels,
    setNowPlaying,
    setAiMuted,
    setUpcomingSegments
  }
})

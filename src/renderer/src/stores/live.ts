import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  INITIAL_STREAM_STATS,
  type LiveState,
  type StreamStats
} from '@shared/ipc'

/**
 * 直播会话状态。主进程是唯一状态源，这里订阅事件快照；
 * UI 不自行推断状态，只做展示。
 */

const ALLOWED: Record<LiveState, LiveState[]> = {
  idle: ['ready', 'starting', 'error'],
  ready: ['starting', 'error'],
  starting: ['live', 'error'],
  live: ['paused', 'ending', 'error'],
  paused: ['live', 'ending', 'error'],
  ending: ['ended', 'error'],
  ended: ['ready', 'starting', 'error'],
  error: ['ready', 'starting', 'idle']
}

function formatDuration(totalSec: number): string {
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

export const useLiveStore = defineStore('live', () => {
  const state = ref<LiveState>('idle')
  const stats = ref<StreamStats>({ ...INITIAL_STREAM_STATS })

  const durationText = computed(() => formatDuration(stats.value.durationSec))

  function applyState(next: LiveState): void {
    if (next === state.value) return
    if (!ALLOWED[state.value].includes(next)) {
      // 主进程是状态源，异常迁移只告警不丢弃
      console.warn(`[live] 非预期状态迁移: ${state.value} -> ${next}`)
    }
    state.value = next
  }

  function applyStats(next: StreamStats): void {
    stats.value = next
  }

  return { state, stats, durationText, applyState, applyStats }
})

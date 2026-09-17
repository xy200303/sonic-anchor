<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useAudioStore } from '@renderer/stores/audio'
import { useFeedStore } from '@renderer/stores/feed'
import { audioEngine } from '@renderer/audio/engine'

/**
 * AI 播报提词器：当前播报全文 + 句级高亮 + 待播队列预览。
 * 句级进度为近似值——按各句字数占比均分整段音频时长（TTS 无逐字时间戳）。
 */

const audio = useAudioStore()
const feed = useFeedStore()

const current = computed(() => audio.nowPlaying)

// 按中文/英文标点切句，保留标点
const sentences = computed<string[]>(() => {
  const text = current.value?.text?.trim() ?? ''
  if (!text) return []
  return text.match(/[^。！？!?…;；]+[。！？!?…;；]*/g)?.filter((s) => s.trim().length > 0) ?? [text]
})

// 播放进度轮询（仅播报中启动）
const progress = ref(0)
let timer: number | null = null

watch(
  current,
  (v) => {
    progress.value = 0
    if (timer !== null) {
      clearInterval(timer)
      timer = null
    }
    if (v) {
      timer = window.setInterval(() => {
        progress.value = audioEngine.getTtsProgress() ?? progress.value
      }, 100)
    }
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  if (timer !== null) clearInterval(timer)
})

// 按字数加权均分时长，估算当前播到第几句
const activeIndex = computed(() => {
  const ss = sentences.value
  if (ss.length === 0) return -1
  const total = ss.reduce((a, s) => a + s.length, 0)
  const target = progress.value * total
  let acc = 0
  for (let i = 0; i < ss.length; i++) {
    acc += ss[i].length
    if (target <= acc) return i
  }
  return ss.length - 1
})

interface UpcomingEntry {
  key: string
  tag: string
  text: string
}

// 接下来：回复队列优先（与调度器一致），其次话术后续段落
const upcoming = computed<UpcomingEntry[]>(() => {
  const replies: UpcomingEntry[] = feed.replyItems
    .filter((r) => r.speak && ['generating', 'synthesizing', 'queued'].includes(r.status))
    .slice(0, 3)
    .map((r) => ({
      key: r.id,
      tag: `回复 @${r.author}`,
      text: r.replyText || '回复生成中…'
    }))
  const scripts: UpcomingEntry[] = audio.upcomingSegments
    .slice(0, Math.max(0, 4 - replies.length))
    .map((s, i) => ({ key: `seg-${i}-${s.label}`, tag: s.label, text: s.text }))
  return [...replies, ...scripts]
})
</script>

<template>
  <div class="teleprompter">
    <div class="tp-header">
      <span class="tp-title">AI 播报稿</span>
      <n-tag v-if="current" size="small" :bordered="false" class="tp-kind">
        {{ current.label }}
      </n-tag>
    </div>

    <div class="tp-body">
      <p v-if="sentences.length" class="tp-current">
        <span
          v-for="(s, i) in sentences"
          :key="i"
          class="sent"
          :class="{ done: i < activeIndex, active: i === activeIndex }"
          >{{ s }}</span
        >
      </p>
      <p v-else class="tp-idle">AI 空闲中 · 有评论回复或话术播报时，文字稿会显示在这里</p>

      <template v-if="upcoming.length">
        <div class="up-title">接下来</div>
        <div v-for="u in upcoming" :key="u.key" class="up-item">
          <span class="up-tag">{{ u.tag }}</span>
          <span class="up-text">{{ u.text }}</span>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.teleprompter {
  display: flex;
  flex-direction: column;
  height: 100%;
  border-radius: 8px;
  background: #0d0c0b;
  border: 1px solid var(--border-subtle);
  min-height: 0;
  overflow: hidden;
}
.tp-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-subtle);
}
.tp-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}
.tp-kind {
  background: rgba(196, 112, 63, 0.14);
  color: var(--brand);
}
.tp-body {
  padding: 10px 12px;
  overflow-y: auto;
  min-height: 0;
}
.tp-current {
  margin: 0;
  font-size: 14px;
  line-height: 1.8;
}
.sent {
  color: var(--text-tertiary);
  transition: color 0.2s;
}
.sent.done {
  color: var(--text-secondary);
}
.sent.active {
  color: var(--brand);
  font-weight: 500;
}
.tp-idle {
  margin: 0;
  color: var(--text-tertiary);
  font-size: 12px;
}
.up-title {
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px dashed var(--border-subtle);
  font-size: 11px;
  color: var(--text-tertiary);
}
.up-item {
  display: flex;
  gap: 8px;
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.5;
}
.up-tag {
  flex-shrink: 0;
  color: var(--text-tertiary);
}
.up-text {
  color: var(--text-secondary);
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
</style>

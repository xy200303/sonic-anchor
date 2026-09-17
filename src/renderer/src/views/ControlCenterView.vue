<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDialog, useMessage } from 'naive-ui'
import type { CommentEvent } from '@shared/ipc'
import { useLiveStore } from '@renderer/stores/live'
import { useAudioStore } from '@renderer/stores/audio'
import { useConfigStore } from '@renderer/stores/config'
import LiveStatusBadge from '@renderer/components/LiveStatusBadge.vue'
import StreamPreview from '@renderer/components/stream/StreamPreview.vue'
import Teleprompter from '@renderer/components/stream/Teleprompter.vue'
import CommentFeed from '@renderer/components/stream/CommentFeed.vue'
import ReplyQueue from '@renderer/components/stream/ReplyQueue.vue'
import BroadcastControls from '@renderer/components/stream/BroadcastControls.vue'
import AudioMeter from '@renderer/components/stream/AudioMeter.vue'
import { audioEngine } from '@renderer/audio/engine'
import { playbackScheduler } from '@renderer/audio/scheduler'

const live = useLiveStore()
const audio = useAudioStore()
const configStore = useConfigStore()
const message = useMessage()
const dialog = useDialog()

const starting = ref(false)

const canStart = computed(() => ['idle', 'ready', 'ended', 'error'].includes(live.state))
const isLive = computed(() => live.state === 'live')

// ---------- 开播 / 停播 ----------

async function start(): Promise<void> {
  starting.value = true
  try {
    const result = await window.api.stream.start()
    if (!result.ok && result.error) message.error(result.error.message, { duration: 6000 })
  } catch {
    message.error('开播请求失败，请查看日志')
  } finally {
    starting.value = false
  }
}

function confirmStop(): void {
  dialog.warning({
    title: '停止直播',
    content: `确定结束本场直播吗？已播时长 ${live.durationText}。`,
    positiveText: '停止直播',
    negativeText: '再播一会',
    onPositiveClick: async () => {
      playbackScheduler.stop()
      await window.api.stream.stop()
    }
  })
}

// ---------- 真人接管（按住说话） ----------

const takingOver = ref(false)
let adhocMic = false

async function takeoverStart(): Promise<void> {
  takingOver.value = true
  playbackScheduler.pause()
  audioEngine.setAiMuted(true)
  audio.setAiMuted(true)
  await window.api.audioControl.setAiMuted(true)
  // 接管即说话：麦克风未接入时自动拉起（设置里已开启则复用现有总线）
  if (!audioEngine.micActive) {
    try {
      await audioEngine.startMic('', {
        autoYield: false,
        forwardPcm: configStore.config.stream.mode === 'direct'
      })
      adhocMic = true
    } catch {
      message.warning('AI 已静音。要让声音进直播，请在「设置 → 音频」开启真人麦克风（伴侣模式也可直接用伴侣的麦克风）')
    }
  }
}

async function takeoverEnd(): Promise<void> {
  takingOver.value = false
  playbackScheduler.resume()
  audioEngine.setAiMuted(false)
  audio.setAiMuted(false)
  await window.api.audioControl.setAiMuted(false)
  if (adhocMic) {
    audioEngine.stopMic()
    adhocMic = false
  }
}

// ---------- 插话 / 手动回复 ----------

const interjectText = ref('')
const interjectOpen = ref(false)
const manualComment = ref<CommentEvent | null>(null)
const manualText = ref('')

async function submitInterject(): Promise<void> {
  const text = interjectText.value.trim()
  if (!text) return
  await window.api.reply.manual('manual', text)
  interjectText.value = ''
  interjectOpen.value = false
  message.success('插话已加入队列最前')
}

async function submitManual(): Promise<void> {
  const text = manualText.value.trim()
  if (!text || !manualComment.value) return
  await window.api.reply.manual(manualComment.value.id, text)
  manualComment.value = null
  manualText.value = ''
  message.success('回复已加入队列')
}

// ---------- 紧急停止 ----------

async function panic(): Promise<void> {
  playbackScheduler.stop()
  audioEngine.panic()
  await window.api.audioControl.panicStop()
  message.warning('已停止全部 AI 播报，推流保持运行')
}
</script>

<template>
  <div class="control">
    <div class="header">
      <h1 class="title">直播控制台</h1>
      <LiveStatusBadge />
      <n-tag v-if="live.stats.reconnecting" type="warning" size="small">
        断流重连中（第 {{ live.stats.reconnectAttempt }} 次）
      </n-tag>
      <n-tag v-if="audio.nowPlaying" type="info" size="small">
        正在播报：{{ audio.nowPlaying.label }}
      </n-tag>
      <AudioMeter class="meter" />
    </div>

    <div class="grid">
      <section class="panel-card preview">
        <StreamPreview />
        <div class="preview-meta">
          <span>{{ live.stats.bitrateKbps }} kbps</span>
          <span>丢帧 {{ live.stats.droppedFrames }}</span>
          <span class="mono-nums">时长 {{ live.durationText }}</span>
        </div>
        <Teleprompter class="tp-slot" />
      </section>

      <section class="panel-card column">
        <h2 class="column-title">实时评论流</h2>
        <CommentFeed @manual="manualComment = $event" />
      </section>

      <section class="panel-card column">
        <h2 class="column-title">AI 回复队列</h2>
        <ReplyQueue />
      </section>
    </div>

    <div class="actions">
      <n-button
        v-if="!isLive"
        type="primary"
        size="large"
        class="cta"
        :disabled="!canStart"
        :loading="starting || live.state === 'starting'"
        @click="start"
      >
        {{ live.state === 'error' ? '重新开播' : '开始直播' }}
      </n-button>
      <n-button v-else type="error" size="large" ghost class="cta" @click="confirmStop">
        停止直播
      </n-button>

      <n-button
        size="large"
        :type="takingOver ? 'warning' : 'default'"
        @mousedown="takeoverStart"
        @mouseup="takeoverEnd"
        @mouseleave="takingOver && takeoverEnd()"
      >
        {{ takingOver ? '正在接管…' : '接管说话（按住）' }}
      </n-button>

      <n-button size="large" @click="interjectOpen = true">插话</n-button>

      <n-button size="large" type="error" ghost @click="panic">紧急停止</n-button>
    </div>

    <BroadcastControls />

    <!-- 插话弹窗 -->
    <n-modal :show="interjectOpen" preset="card" title="插话" style="width: 460px" @update:show="interjectOpen = false">
      <n-input
        v-model:value="interjectText"
        type="textarea"
        :rows="3"
        placeholder="输入立即合成并插队播报的文字，如「欢迎刚进直播间的朋友」"
      />
      <div class="modal-actions">
        <n-button quaternary @click="interjectOpen = false">取消</n-button>
        <n-button type="primary" @click="submitInterject">插队播报</n-button>
      </div>
    </n-modal>

    <!-- 手动回复弹窗 -->
    <n-modal
      :show="!!manualComment"
      preset="card"
      :title="`回复 @${manualComment?.author ?? ''}`"
      style="width: 460px"
      @update:show="manualComment = null"
    >
      <p class="manual-question">评论：{{ manualComment?.content }}</p>
      <n-input v-model:value="manualText" type="textarea" :rows="3" placeholder="输入回复内容，将合成语音播报" />
      <div class="modal-actions">
        <n-button quaternary @click="manualComment = null">取消</n-button>
        <n-button type="primary" @click="submitManual">合成并播报</n-button>
      </div>
    </n-modal>
  </div>
</template>

<style scoped>
.control {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
}
.header {
  display: flex;
  align-items: center;
  gap: 12px;
}
.title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}
.meter {
  margin-left: auto;
}
.grid {
  display: grid;
  grid-template-columns: 1.2fr 1fr 1fr;
  gap: 16px;
  flex: 1;
  min-height: 0;
}
.preview {
  display: flex;
  flex-direction: column;
  padding: 12px;
  gap: 10px;
  min-height: 0;
}
.tp-slot {
  height: 220px;
  flex-shrink: 0;
}
.preview-meta {
  display: flex;
  gap: 16px;
  color: var(--text-tertiary);
  font-size: 12px;
}
.column {
  display: flex;
  flex-direction: column;
  padding: 16px;
  min-height: 0;
}
.column-title {
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 600;
}
.actions {
  display: flex;
  gap: 12px;
  padding-top: 4px;
}
.cta {
  min-width: 140px;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}
.manual-question {
  color: var(--text-secondary);
  font-size: 13px;
}
</style>

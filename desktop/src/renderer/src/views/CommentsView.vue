<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import type { CommentEvent, SessionSummary } from '@shared/ipc'

const sessions = ref<SessionSummary[]>([])
const activeSession = ref('')
const comments = ref<CommentEvent[]>([])
const intentFilter = ref<string>('all')

const INTENT_LABEL: Record<string, string> = {
  price: '问价',
  question: '提问',
  chitchat: '闲聊',
  spam: '无效',
  other: '其他'
}

async function loadSessions(): Promise<void> {
  const overview = await window.api.analytics.overview()
  sessions.value = overview.sessions
  if (sessions.value.length > 0 && !activeSession.value) {
    activeSession.value = sessions.value[0].id
  }
}

async function loadHistory(): Promise<void> {
  if (!activeSession.value) return
  comments.value = await window.api.comment.history(activeSession.value)
}

watch(activeSession, () => void loadHistory())
onMounted(() => void loadSessions())

function filtered(): CommentEvent[] {
  const list = intentFilter.value === 'all'
    ? comments.value
    : comments.value.filter((c) => c.intent === intentFilter.value)
  return list
}
</script>

<template>
  <div class="comments">
    <h1 class="title">评论与回复</h1>

    <div class="filters">
      <n-select
        v-model:value="activeSession"
        :options="sessions.map((s) => ({
          label: `${new Date(s.startedAt).toLocaleString('zh-CN')} · ${s.commentCount}条`,
          value: s.id
        }))"
        placeholder="选择场次"
        class="session-select"
      />
      <n-radio-group v-model:value="intentFilter" size="small">
        <n-radio-button value="all">全部</n-radio-button>
        <n-radio-button value="price">问价</n-radio-button>
        <n-radio-button value="question">提问</n-radio-button>
        <n-radio-button value="chitchat">闲聊</n-radio-button>
      </n-radio-group>
    </div>

    <div v-if="filtered().length === 0" class="empty">
      {{ activeSession ? '该场次暂无匹配评论' : '还没有直播场次数据' }}
    </div>

    <div v-else class="panel-card table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>时间</th>
            <th>用户</th>
            <th>评论内容</th>
            <th>意图</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in filtered()" :key="c.id">
            <td class="mono-nums">{{ new Date(c.ts).toLocaleTimeString('zh-CN', { hour12: false }) }}</td>
            <td>{{ c.author }}</td>
            <td class="content">{{ c.content }}</td>
            <td>
              <n-tag size="tiny">{{ INTENT_LABEL[c.intent ?? 'other'] }}</n-tag>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.comments {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
}
.title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}
.filters {
  display: flex;
  gap: 12px;
  align-items: center;
}
.session-select {
  width: 320px;
}
.empty {
  color: var(--text-tertiary);
  padding: 32px;
  text-align: center;
  border: 1px dashed var(--border-subtle);
  border-radius: 8px;
}
.table-wrap {
  flex: 1;
  overflow: auto;
  padding: 0;
}
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.table th {
  position: sticky;
  top: 0;
  background: var(--bg-surface);
  text-align: left;
  padding: 10px 12px;
  color: var(--text-tertiary);
  font-weight: 500;
  border-bottom: 1px solid var(--border-subtle);
}
.table td {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-subtle);
}
.content {
  max-width: 400px;
  word-break: break-all;
}
</style>

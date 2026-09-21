<script setup lang="ts">
import { ref } from 'vue'
import type { ReplyItem } from '@shared/ipc'
import { useFeedStore } from '@renderer/stores/feed'

const feed = useFeedStore()
const editing = ref<ReplyItem | null>(null)
const editText = ref('')

const STATUS_META: Record<string, { label: string; type: 'default' | 'info' | 'success' | 'warning' | 'error' }> = {
  generating: { label: '生成中', type: 'info' },
  synthesizing: { label: '合成中', type: 'info' },
  queued: { label: '待播报', type: 'warning' },
  playing: { label: '播报中', type: 'success' },
  failed: { label: '失败', type: 'error' }
}

function openEdit(item: ReplyItem): void {
  editing.value = item
  editText.value = item.replyText
}

function setAuto(v: boolean): void {
  void window.api.reply.setAuto(v)
}

function prioritize(id: string): void {
  void window.api.reply.action(id, 'prioritize')
}

function skip(id: string): void {
  void window.api.reply.action(id, 'skip')
}

async function submitEdit(): Promise<void> {
  if (!editing.value || !editText.value.trim()) return
  await window.api.reply.action(editing.value.id, 'prioritize', { replyText: editText.value.trim() })
  editing.value = null
}
</script>

<template>
  <div class="queue">
    <div class="head">
      <span>自动回复</span>
      <n-switch :value="feed.autoReplyEnabled" size="small" @update:value="setAuto" />
    </div>

    <div v-if="feed.replyItems.length === 0" class="empty">
      <p>暂无待播报回复</p>
    </div>

    <div v-else class="list">
      <div v-for="item in feed.replyItems" :key="item.id" class="item">
        <div class="meta">
          <n-tag size="tiny" :type="STATUS_META[item.status]?.type ?? 'default'">
            {{ STATUS_META[item.status]?.label ?? item.status }}
          </n-tag>
          <span class="author">@{{ item.author }}</span>
        </div>
        <div class="question">Q: {{ item.question }}</div>
        <div class="answer">A: {{ item.replyText || '…' }}</div>
        <div class="ops">
          <n-button text size="tiny" @click="prioritize(item.id)">置顶</n-button>
          <n-button text size="tiny" @click="openEdit(item)">改稿</n-button>
          <n-button text size="tiny" type="error" @click="skip(item.id)">跳过</n-button>
        </div>
      </div>
    </div>

    <n-modal :show="!!editing" preset="card" title="修改回复稿" style="width: 480px" @update:show="editing = null">
      <n-input v-model:value="editText" type="textarea" :rows="4" placeholder="将重新合成并置顶播报" />
      <div class="modal-actions">
        <n-button quaternary @click="editing = null">取消</n-button>
        <n-button type="primary" @click="submitEdit">重新合成并置顶</n-button>
      </div>
    </n-modal>
  </div>
</template>

<style scoped>
.queue {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-secondary);
}
.empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  border: 1px dashed var(--border-subtle);
  border-radius: 8px;
}
.list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.item {
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--bg-elevated);
  font-size: 12px;
}
.meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.author {
  color: var(--text-secondary);
}
.question {
  color: var(--text-tertiary);
  margin-bottom: 2px;
}
.answer {
  color: var(--text-primary);
  word-break: break-all;
}
.ops {
  display: flex;
  gap: 12px;
  margin-top: 4px;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}
</style>

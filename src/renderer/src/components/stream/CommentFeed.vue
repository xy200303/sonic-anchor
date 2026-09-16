<script setup lang="ts">
import type { CommentEvent } from '@shared/ipc'
import { useFeedStore } from '@renderer/stores/feed'

const emit = defineEmits<{ manual: [comment: CommentEvent] }>()
const feed = useFeedStore()

const INTENT_META: Record<string, { label: string; cls: string }> = {
  price: { label: '问价', cls: 'tag-price' },
  question: { label: '提问', cls: 'tag-question' },
  chitchat: { label: '闲聊', cls: 'tag-chitchat' },
  spam: { label: '无效', cls: 'tag-spam' },
  other: { label: '其他', cls: 'tag-other' }
}
</script>

<template>
  <div class="feed">
    <div v-if="feed.comments.length === 0" class="empty">
      <p>等待评论进入…</p>
    </div>
    <div v-else class="list">
      <div
        v-for="c in feed.comments"
        :key="c.id"
        class="item"
        :title="`点击生成手动回复`"
        @click="emit('manual', c)"
      >
        <div class="row1">
          <span class="author">{{ c.author }}</span>
          <span v-if="c.intent" class="tag" :class="INTENT_META[c.intent]?.cls">
            {{ INTENT_META[c.intent]?.label }}
          </span>
          <span class="time">{{ new Date(c.ts).toLocaleTimeString('zh-CN', { hour12: false }) }}</span>
        </div>
        <div class="content">{{ c.content }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.feed {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
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
  cursor: pointer;
  transition: background 150ms ease-out;
}
.item:hover {
  background: var(--border-subtle);
}
.row1 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 2px;
}
.author {
  font-weight: 500;
  font-size: 13px;
}
.tag {
  font-size: 11px;
  padding: 0 6px;
  border-radius: 4px;
  line-height: 16px;
}
.tag-price {
  background: rgba(217, 164, 65, 0.2);
  color: var(--warning);
}
.tag-question {
  background: rgba(196, 112, 63, 0.2);
  color: var(--brand);
}
.tag-chitchat {
  background: rgba(111, 162, 135, 0.2);
  color: var(--success);
}
.tag-spam,
.tag-other {
  background: var(--border-subtle);
  color: var(--text-tertiary);
}
.time {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-tertiary);
}
.content {
  font-size: 13px;
  color: var(--text-primary);
  word-break: break-all;
}
</style>

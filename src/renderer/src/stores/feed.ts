import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { CommentEvent, ReplyItem, ReplyQueueSnapshot } from '@shared/ipc'

const MAX_COMMENTS = 300

/** 评论流与回复队列（主进程推送快照，UI 只读） */
export const useFeedStore = defineStore('feed', () => {
  const comments = ref<CommentEvent[]>([])
  const replyItems = ref<ReplyItem[]>([])
  const autoReplyEnabled = ref(true)
  const rateLimitedAuthors = ref<string[]>([])

  function pushComments(batch: CommentEvent[]): void {
    comments.value = [...batch.reverse(), ...comments.value].slice(0, MAX_COMMENTS)
  }

  function applyQueue(snapshot: ReplyQueueSnapshot): void {
    replyItems.value = snapshot.items
    autoReplyEnabled.value = snapshot.autoReplyEnabled
    rateLimitedAuthors.value = snapshot.rateLimitedAuthors
  }

  return { comments, replyItems, autoReplyEnabled, rateLimitedAuthors, pushComments, applyQueue }
})

import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { CommentEvent, IntentType, ReplyItem, ReplyQueueSnapshot } from '@shared/ipc'
import { IpcChannel } from '@shared/ipc'
import { chat } from '../llm/client'
import { synthesizeToFile, audioCacheDir } from '../tts/volcanoClient'
import { getComment, insertReplyLog, searchKnowledge } from '../store/db'
import { streamService } from '../stream/streamService'
import { broadcast } from '../../ipc/broadcast'
import { log } from '../../logger'

/**
 * 回复编排：评论 → 意图分类（规则预筛 + LLM）→ 限频去重 → LLM 生成（价格强制查库）
 * → 句级 TTS 合成 → 优先级队列 → 渲染层调度播报。
 * 队列 mutations 全部广播快照；每条回复都可被人工跳过/改稿/置顶。
 */

const AUTHOR_COOLDOWN_MS = 20_000
const QUESTION_CACHE_MS = 5 * 60_000
const MAX_GENERATING = 3
const MAX_QUEUE = 30

const PRICE_RULE = /多少钱|什么价|价格|优惠|便宜|折扣|券/
const CHITCHAT_RULE = /哈哈|666|厉害|加油|主播好|爱了|支持/

class ReplyService {
  private queue: ReplyItem[] = []
  private autoReply = true
  private aiMuted = false
  private authorLastAt = new Map<string, number>()
  private questionCache = new Map<string, { text: string; at: number }>()
  private generating = 0
  private seq = 0

  // ---------- 消费入口 ----------

  handleComment(comment: CommentEvent): void {
    if (!this.autoReply) return
    const intent = this.classify(comment)
    comment.intent = intent
    if (intent === 'spam') return
    if (intent === 'chitchat') {
      // 文字寒暄仅记录，不进语音队列
      this.logReply(this.makeItem(comment, '收到啦，感谢宝宝支持～', intent, false), null)
      return
    }
    if (this.isRateLimited(comment)) return
    if (this.queue.length >= MAX_QUEUE) return
    void this.produce(comment, intent)
  }

  // ---------- 意图 ----------

  private classify(comment: CommentEvent): IntentType {
    const text = comment.content
    if (text.trim().length < 2) return 'spam'
    if (PRICE_RULE.test(text)) return 'price'
    if (CHITCHAT_RULE.test(text)) return 'chitchat'
    if (/^\d+$/.test(text.trim())) return 'spam'
    return 'question'
  }

  private isRateLimited(comment: CommentEvent): boolean {
    const last = this.authorLastAt.get(comment.authorId) ?? 0
    if (Date.now() - last < AUTHOR_COOLDOWN_MS) return true
    this.authorLastAt.set(comment.authorId, Date.now())
    return false
  }

  // ---------- 生成 ----------

  private async produce(comment: CommentEvent, intent: IntentType): Promise<void> {
    // 同问题缓存复用
    const key = comment.content.replace(/[\s\p{P}]/gu, '').slice(0, 30)
    const cached = this.questionCache.get(key)
    if (cached && Date.now() - cached.at < QUESTION_CACHE_MS) {
      this.enqueue(this.makeItem(comment, cached.text, intent, true))
      return
    }
    if (this.generating >= MAX_GENERATING) return
    this.generating += 1

    const item = this.makeItem(comment, '', intent, true)
    item.status = 'generating'
    this.push(item)

    try {
      const replyText = await this.generateText(comment, intent)
      this.questionCache.set(key, { text: replyText, at: Date.now() })
      item.replyText = replyText
      item.status = 'synthesizing'
      this.broadcastQueue()

      if (this.aiMuted) {
        item.status = 'queued'
        item.speak = false
      } else {
        item.audioPath = await this.synth(replyText)
        item.status = 'queued'
      }
      this.broadcastQueue()
    } catch (err) {
      item.status = 'failed'
      log.warn('回复生成失败:', err)
      this.logReply(item, null)
      this.remove(item.id)
    } finally {
      this.generating -= 1
    }
  }

  private async generateText(comment: CommentEvent, intent: IntentType): Promise<string> {
    const kb = searchKnowledge(comment.content)
    const kbText = kb
      .map((p) => `【${p.name}】价格${p.price}元。卖点：${p.sellingPoints}。FAQ：${p.faq}`)
      .join('\n')

    const system = `你是直播间的 AI 主播助手，用人设口吻（亲切、简短、促单）回复观众评论。
硬性规则：
1. 单次回复不超过 60 字，口语化，适合直接朗读；
2. 涉及价格/优惠时只能使用知识库中的价格数字，库中没有就如实说"具体价格以直播间链接为准"；
3. 不承诺知识库之外的参数与售后政策。`

    const user = `知识库：\n${kbText || '（无相关资料）'}\n\n观众「${comment.author}」评论：${comment.content}\n意图：${intent}\n\n请直接输出回复文本，不要带任何前缀。`

    const raw = (await chat([{ role: 'system', content: system }, { role: 'user', content: user }], { temperature: 0.6 })).trim()

    if (intent === 'price' && kb.length > 0) {
      // 安全护栏：价格类回答必须包含知识库实价
      const priceStr = String(kb[0].price)
      if (!raw.includes(priceStr)) {
        return `这款是${kb[0].name}，直播间价格${priceStr}元，点下方链接就能拍～`
      }
    }
    return raw.slice(0, 120)
  }

  private async synth(text: string): Promise<string> {
    const file = join(audioCacheDir(), `reply-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.mp3`)
    await synthesizeToFile(text, file, { format: 'mp3' })
    return file
  }

  // ---------- 队列 ----------

  private makeItem(comment: CommentEvent, replyText: string, intent: IntentType, speak: boolean): ReplyItem {
    this.seq += 1
    return {
      id: randomUUID(),
      commentId: comment.id,
      author: comment.author,
      question: comment.content,
      replyText,
      intent,
      status: 'queued',
      priority: this.seq,
      createdAt: Date.now(),
      speak
    }
  }

  private push(item: ReplyItem): void {
    this.queue.push(item)
    this.broadcastQueue()
  }

  private enqueue(item: ReplyItem): void {
    this.push(item)
  }

  private remove(id: string): void {
    this.queue = this.queue.filter((i) => i.id !== id)
    this.broadcastQueue()
  }

  /** 渲染层调度器空闲时取下一个待播报项（按优先级），并标记为 playing */
  next(): (ReplyItem & { audioPath?: string }) | null {
    const item = [...this.queue]
      .filter((i) => i.status === 'queued' && i.speak && i.audioPath)
      .sort((a, b) => a.priority - b.priority)[0]
    if (!item) return null
    item.status = 'playing'
    this.broadcastQueue()
    return item
  }

  snapshot(): ReplyQueueSnapshot {
    return {
      items: [...this.queue].sort((a, b) => b.priority - a.priority),
      autoReplyEnabled: this.autoReply,
      rateLimitedAuthors: [...this.authorLastAt.entries()]
        .filter(([, at]) => Date.now() - at < AUTHOR_COOLDOWN_MS)
        .map(([authorId]) => authorId)
    }
  }

  // ---------- 人工干预 ----------

  async action(id: string, action: 'skip' | 'prioritize' | 'done', patch?: { replyText?: string }): Promise<void> {
    const item = this.queue.find((i) => i.id === id)
    if (!item) return
    if (action === 'skip') {
      item.status = 'skipped'
      this.logReply(item, null)
      this.remove(id)
    } else if (action === 'prioritize') {
      item.priority = this.seq - 1000 // 排到当前最前
      this.broadcastQueue()
    } else if (action === 'done') {
      item.status = 'done'
      const latency = Date.now() - item.createdAt
      this.logReply(item, latency)
      this.remove(id)
    }
    if (patch?.replyText && item) {
      item.replyText = patch.replyText
      item.status = 'synthesizing'
      this.broadcastQueue()
      item.audioPath = await this.synth(patch.replyText)
      item.status = 'queued'
      this.broadcastQueue()
    }
  }

  async manual(commentId: string, text: string): Promise<void> {
    const comment = getComment(commentId)
    if (!comment) return
    const item = this.makeItem(comment, text, comment.intent ?? 'question', true)
    item.priority = -1 // 人工插话永远最优先
    item.status = 'synthesizing'
    this.push(item)
    try {
      item.audioPath = await this.synth(text)
      item.status = 'queued'
    } catch {
      item.status = 'failed'
    }
    this.broadcastQueue()
  }

  setAuto(enabled: boolean): void {
    this.autoReply = enabled
    this.broadcastQueue()
  }

  setAiMuted(muted: boolean): void {
    this.aiMuted = muted
  }

  panic(): void {
    this.autoReply = false
    this.queue = this.queue.filter((i) => i.status === 'playing' || i.status === 'queued')
    for (const item of this.queue) {
      if (item.status === 'queued' || item.status === 'synthesizing') {
        item.status = 'skipped'
        this.logReply(item, null)
      }
    }
    this.queue = []
    this.broadcastQueue()
  }

  // ---------- 持久化 ----------

  private logReply(item: ReplyItem, latencyMs: number | null): void {
    insertReplyLog(item, streamService.getSessionId(), latencyMs)
  }

  private broadcastQueue(): void {
    broadcast(IpcChannel.ReplyQueueChanged, this.snapshot())
  }
}

export const replyService = new ReplyService()

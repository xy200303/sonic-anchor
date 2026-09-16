import WebSocket from 'ws'
import { loadConfig } from '../store/config'
import { log } from '../../logger'
import type { CommentEvent } from '@shared/ipc'

/**
 * 抖音开放平台直播消息客户端。
 * 流程：client_token（appid+secret）→ 直播间长连接 → 消息归一化为 CommentEvent。
 * 端点与消息格式按开放平台「直播小玩法 / 直播消息」文档实现；
 * 字段解析集中在 parseMessage()，平台协议调整只动这一处。
 */

const TOKEN_URL = 'https://developer.open-douyin.com/oauth/access_token'
const DEFAULT_WS_BASE = 'wss://webcast-open.douyin.com/gateway/message'

export class DouyinClient {
  private ws: WebSocket | null = null
  private token: string | null = null
  private tokenExpiresAt = 0
  private heartbeat: NodeJS.Timeout | null = null
  private stopped = false
  private onComment: (c: CommentEvent) => void
  private onError: (message: string) => void

  constructor(onComment: (c: CommentEvent) => void, onError: (message: string) => void) {
    this.onComment = onComment
    this.onError = onError
  }

  async start(): Promise<void> {
    this.stopped = false
    const { comment } = loadConfig()
    if (!comment.appId || !comment.appSecret || !comment.roomId) {
      throw new Error('抖音开放平台 AppId / Secret / 房间号未配置（设置 → 评论监控）')
    }
    await this.ensureToken()
    await this.connectWs()
  }

  stop(): void {
    this.stopped = true
    if (this.heartbeat) clearInterval(this.heartbeat)
    this.ws?.close()
    this.ws = null
  }

  private async ensureToken(): Promise<void> {
    if (this.token && Date.now() < this.tokenExpiresAt - 5 * 60 * 1000) return
    const { comment } = loadConfig()
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credential',
        client_key: comment.appId,
        client_secret: comment.appSecret
      }),
      signal: AbortSignal.timeout(15000)
    })
    const data = (await res.json()) as {
      data?: { access_token?: string; expires_in?: number }
      message?: string
    }
    if (!data.data?.access_token) {
      throw new Error(`获取抖音 access_token 失败: ${data.message ?? res.status}`)
    }
    this.token = data.data.access_token
    this.tokenExpiresAt = Date.now() + (data.data.expires_in ?? 7200) * 1000
  }

  private async connectWs(): Promise<void> {
    const { comment } = loadConfig()
    const wsBase = process.env.DOUYIN_WS_BASE ?? DEFAULT_WS_BASE
    const url = `${wsBase}?room_id=${encodeURIComponent(comment.roomId)}&token=${encodeURIComponent(this.token!)}`

    await new Promise<void>((resolve, reject) => {
      this.ws = new WebSocket(url)

      this.ws.on('open', () => {
        log.info('抖音评论长连接已建立')
        this.heartbeat = setInterval(() => {
          try {
            this.ws?.ping()
          } catch {
            /* 连接已断，close 事件会处理 */
          }
        }, 30_000)
        resolve()
      })

      this.ws.on('message', (raw: Buffer) => {
        try {
          const event = this.parseMessage(JSON.parse(raw.toString('utf-8')))
          if (event) this.onComment(event)
        } catch (err) {
          log.warn('评论消息解析失败:', err)
        }
      })

      this.ws.on('error', (err) => {
        if (!this.stopped) this.onError(`评论长连接错误: ${err.message}`)
        reject(err)
      })

      this.ws.on('close', () => {
        if (this.heartbeat) clearInterval(this.heartbeat)
        if (!this.stopped) this.onError('评论长连接已断开')
      })
    })
  }

  /** 平台消息 → 归一化评论事件。协议字段变更只改这里。 */
  private parseMessage(msg: Record<string, unknown>): CommentEvent | null {
    const common = msg.common as { method?: string } | undefined
    const payload = (msg.payload ?? {}) as Record<string, unknown>
    const user = (payload.user ?? {}) as { nickname?: string; id_str?: string }
    const method = common?.method ?? ''

    if (!method.includes('Comment') && !method.includes('Gift') && !method.includes('Fans')) {
      return null
    }
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sessionId: '',
      author: user.nickname ?? '匿名',
      authorId: user.id_str ?? '',
      content: (payload.content ?? '') as string,
      kind: method.includes('Gift') ? 'gift' : method.includes('Fans') ? 'enter' : 'comment',
      ts: Date.now(),
      intent: null
    }
  }
}

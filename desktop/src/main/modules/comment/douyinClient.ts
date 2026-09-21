import WebSocket from 'ws'
import { loadConfig } from '../store/config'
import { log } from '../../logger'
import type { CommentEvent } from '@shared/ipc'

let runtimeLaunchToken = ''

export function updateDouyinLaunchToken(commandLine: readonly string[]): boolean {
  const argument = commandLine.find((item) => item.startsWith('-token='))
  const token = argument?.slice('-token='.length).trim() ?? ''
  if (!token) return false
  runtimeLaunchToken = token
  return true
}

interface StartLiveResponse {
  code: number
  message: string
  data?: {
    session: { id: string; room_id: string }
    ws_url: string
  }
}

interface LiveEnvelope {
  session_id: string
  message_type: string
  data: {
    msg_id?: string | number
    sec_openid?: string
    content?: string
    nickname?: string
    timestamp?: number
  }
}

export class DouyinClient {
  private ws: WebSocket | null = null
  private sessionId = ''
  private currentRoomId = ''
  private stopped = false
  private onComment: (comment: CommentEvent) => void
  private onError: (message: string) => void

  constructor(onComment: (comment: CommentEvent) => void, onError: (message: string) => void) {
    this.onComment = onComment
    this.onError = onError
  }

  get roomId(): string {
    return this.currentRoomId
  }

  async start(): Promise<void> {
    this.stopped = false
    const { comment } = loadConfig()
    if (!comment.backendUrl || !comment.desktopKey) {
      throw new Error('请先配置服务端地址和桌面端接入密钥')
    }
    const launchToken = this.getLaunchToken()
    if (!launchToken) {
      throw new Error('未收到直播伴侣启动 token，请从直播伴侣调试环境启动本软件')
    }

    const response = await fetch(`${this.normalizeBaseURL(comment.backendUrl)}/api/desktop/live/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Desktop-Key': comment.desktopKey },
      body: JSON.stringify({ token: launchToken, app_id: comment.appId || undefined }),
      signal: AbortSignal.timeout(20_000)
    })
    const payload = (await response.json()) as StartLiveResponse
    if (!response.ok || payload.code !== 0 || !payload.data) {
      throw new Error(payload.message || `服务端启动直播会话失败: ${response.status}`)
    }

    this.sessionId = payload.data.session.id
    this.currentRoomId = payload.data.session.room_id
    await this.connect(payload.data.ws_url)
  }

  stop(): void {
    this.stopped = true
    this.ws?.close()
    this.ws = null
    void this.stopSession()
  }

  private async connect(url: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(url)
      this.ws = socket
      socket.once('open', () => {
        log.info('服务端评论 WebSocket 已连接，房间号:', this.currentRoomId)
        resolve()
      })
      socket.on('message', (raw) => {
        try {
          const event = this.parseEnvelope(JSON.parse(raw.toString()) as LiveEnvelope)
          if (event) this.onComment(event)
        } catch (error) {
          log.warn('服务端评论消息解析失败:', error)
        }
      })
      socket.once('error', (error) => {
        if (!this.stopped) this.onError(`服务端评论连接错误: ${error.message}`)
        reject(error)
      })
      socket.once('close', () => {
        if (!this.stopped) this.onError('服务端评论连接已断开')
      })
    })
  }

  private parseEnvelope(envelope: LiveEnvelope): CommentEvent | null {
    if (envelope.message_type !== 'live_comment') return null
    const item = envelope.data
    return {
      id: String(item.msg_id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
      sessionId: envelope.session_id,
      author: item.nickname || '匿名',
      authorId: item.sec_openid || '',
      content: item.content || '',
      kind: 'comment',
      ts: item.timestamp ? (item.timestamp < 1_000_000_000_000 ? item.timestamp * 1000 : item.timestamp) : Date.now(),
      intent: null
    }
  }

  private async stopSession(): Promise<void> {
    if (!this.sessionId) return
    const { comment } = loadConfig()
    try {
      await fetch(`${this.normalizeBaseURL(comment.backendUrl)}/api/desktop/live/${this.sessionId}/stop`, {
        method: 'POST',
        headers: { 'X-Desktop-Key': comment.desktopKey },
        signal: AbortSignal.timeout(5000)
      })
    } catch (error) {
      log.warn('结束服务端直播会话失败:', error)
    } finally {
      this.sessionId = ''
      this.currentRoomId = ''
    }
  }

  private getLaunchToken(): string {
    const argument = process.argv.find((item) => item.startsWith('-token='))
    return runtimeLaunchToken || argument?.slice('-token='.length) || process.env.DOUYIN_LAUNCH_TOKEN || ''
  }

  private normalizeBaseURL(value: string): string {
    return value.trim().replace(/\/+$/, '')
  }
}

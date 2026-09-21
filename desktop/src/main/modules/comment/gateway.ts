import type { CommentEvent, CommentGatewayStatus } from '@shared/ipc'
import { IpcChannel } from '@shared/ipc'
import { loadConfig } from '../store/config'
import { insertComment } from '../store/db'
import { streamService } from '../stream/streamService'
import { broadcast } from '../../ipc/broadcast'
import { log } from '../../logger'
import { DouyinClient } from './douyinClient'
import { CommentSimulator } from './simulator'
import { replyService } from '../reply/replyService'

/**
 * 评论网关：接收（抖音 / 模拟器）→ 会话归属 → 落库 → 批量推送到渲染层。
 * 批量节流推送：100ms 窗口合并，避免高频 IPC 拖慢 UI。
 */

const BATCH_WINDOW_MS = 100
const BATCH_MAX = 50

class CommentGateway {
  private client: DouyinClient | null = null
  private simulator = new CommentSimulator((c) => this.ingest(c))
  private running = false
  private source: CommentGatewayStatus['source'] = 'none'
  private lastError: string | null = null
  private receivedCount = 0
  private batch: CommentEvent[] = []
  private batchTimer: NodeJS.Timeout | null = null
  private restartTimer: NodeJS.Timeout | null = null

  status(): CommentGatewayStatus {
    return {
      running: this.running,
      source: this.source,
      roomId: this.client?.roomId ?? '',
      lastError: this.lastError,
      receivedCount: this.receivedCount
    }
  }

  async start(): Promise<{ ok: boolean; error?: string }> {
    if (this.running) return { ok: true }
    const { comment } = loadConfig()
    try {
      if (comment.devSimulate) {
        this.source = 'simulator'
        this.simulator.start()
        this.running = true
        this.lastError = null
        log.info('评论网关已启动（模拟器模式）')
        return { ok: true }
      }
      this.source = 'douyin'
      this.client = new DouyinClient(
        (c) => this.ingest(c),
        (message) => this.handleConnectionError(message)
      )
      await this.client.start()
      this.running = true
      this.lastError = null
      log.info('评论网关已启动（抖音开放平台）')
      return { ok: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.lastError = message
      log.error('评论网关启动失败:', message)
      return { ok: false, error: message }
    }
  }

  stop(): void {
    this.running = false
    this.source = 'none'
    this.client?.stop()
    this.client = null
    this.simulator.stop()
    if (this.restartTimer) clearTimeout(this.restartTimer)
    this.flushBatch()
    log.info('评论网关已停止')
  }

  private ingest(raw: CommentEvent): void {
    const comment: CommentEvent = { ...raw, sessionId: streamService.getSessionId() }
    this.receivedCount += 1
    replyService.handleComment(comment)
    insertComment(comment)
    this.batch.push(comment)
    if (this.batch.length >= BATCH_MAX) this.flushBatch()
    else if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => this.flushBatch(), BATCH_WINDOW_MS)
    }
  }

  private flushBatch(): void {
    if (this.batchTimer) clearTimeout(this.batchTimer)
    this.batchTimer = null
    if (this.batch.length === 0) return
    broadcast(IpcChannel.CommentBatch, this.batch)
    this.batch = []
  }

  /** 断线 5s 后自动重连（指数退避由客户端 stop/start 语义保证简单可靠） */
  private handleConnectionError(message: string): void {
    this.lastError = message
    if (!this.running) return
    this.running = false
    broadcast(IpcChannel.CommentBatch, [])
    log.warn('评论连接异常，5s 后重连:', message)
    this.restartTimer = setTimeout(() => {
      void this.start()
    }, 5000)
  }
}

export const commentGateway = new CommentGateway()

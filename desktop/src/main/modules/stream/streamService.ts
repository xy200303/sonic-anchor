import type {
  LiveState,
  StreamError,
  StreamStartResult,
  StreamStats
} from '@shared/ipc'
import { INITIAL_STREAM_STATS, IpcChannel } from '@shared/ipc'
import { randomUUID } from 'node:crypto'
import { loadConfig } from '../store/config'
import { createSession, endSession } from '../store/db'
import { log } from '../../logger'
import { broadcast } from '../../ipc/broadcast'
import { extractMessage } from '../../utils/errors'
import { FFmpegPusher } from './ffmpeg/pusher'

/**
 * 推流编排服务（主进程唯一实例）。系统职责聚焦声音：
 * 直推模式：FFmpeg 静态帧 + AI 混音 → RTMP；
 * 伴侣模式：AI 声音经系统输出，画面由直播伴侣自行负责。
 */

const STATS_INTERVAL_MS = 1000
const MAX_RECONNECT = 5
const RECONNECT_BASE_DELAY_MS = 2000

export class StreamService {
  private pusher = new FFmpegPusher()
  private stats: StreamStats = { ...INITIAL_STREAM_STATS }
  private state: LiveState = 'idle'
  private statsTimer: NodeJS.Timeout | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private reconnectAttempt = 0
  private stopping = false
  private sessionId: string | null = null
  private liveStartedAt = 0
  private activeMode: 'direct' | 'companion' = 'direct'

  // ---------- 对外 API ----------

  async start(): Promise<StreamStartResult> {
    if (this.state === 'live' || this.state === 'starting') return { ok: true }

    const config = loadConfig()
    this.activeMode = config.stream.mode
    if (this.activeMode === 'direct' && (!config.stream.serverUrl || !config.stream.streamKey)) {
      return this.fail({
        code: 'NOT_CONFIGURED',
        message: '推流地址或密钥为空：请先在「设置 → 推流」中填写'
      })
    }

    this.stopping = false
    this.setState('starting')
    try {
      if (this.activeMode === 'direct') {
        await this.startPush()
      }
      // 伴侣模式：无进程要起，AI 声音经系统声音由伴侣采集
    } catch (err) {
      const error: StreamError =
        err && typeof err === 'object' && 'code' in err
          ? (err as StreamError)
          : { code: 'INTERNAL', message: extractMessage(err) }
      log.error('开播失败:', error.code, error.message)
      this.setState('error')
      return { ok: false, error }
    }

    this.reconnectAttempt = 0
    this.sessionId = randomUUID()
    this.liveStartedAt = Date.now()
    createSession(this.sessionId, this.liveStartedAt)
    this.setState('live')
    this.startStatsLoop()
    log.info(`直播已开始（${this.activeMode === 'direct' ? 'FFmpeg 直推' : '输出窗口'}），会话:`, this.sessionId)
    return { ok: true }
  }

  async stop(): Promise<void> {
    if (this.state !== 'live' && this.state !== 'starting' && this.state !== 'error') return
    this.stopping = true
    this.clearTimers()
    this.setState('ending')
    try {
      if (this.activeMode === 'direct') {
        await this.pusher.stop()
      }
    } catch (err) {
      log.warn('停止推流时出错（忽略）:', err)
    }
    this.patchStats({ streaming: false, reconnecting: false, bitrateKbps: 0 })
    if (this.sessionId) {
      endSession(this.sessionId, Date.now())
      this.sessionId = null
    }
    this.setState('ready')
    log.info('直播已停止')
  }

  getSessionId(): string {
    return this.sessionId ?? 'offline'
  }

  getStats(): StreamStats {
    return { ...this.stats }
  }

  /** 直推（FFmpeg）模式暂无画面预览，返回 null 由 UI 显示占位 */
  async preview(): Promise<string | null> {
    return null
  }

  // ---------- 内部 ----------

  private fail(error: StreamError): StreamStartResult {
    this.setState('error')
    return { ok: false, error }
  }

  private async startPush(): Promise<void> {
    const config = loadConfig()
    await this.pusher.start(
      { serverUrl: config.stream.serverUrl, streamKey: config.stream.streamKey },
      {
        onExit: (code) => this.handlePushExit(code),
        onStats: (s) => this.patchStats({ bitrateKbps: s.bitrateKbps })
      }
    )
  }

  private setState(state: LiveState): void {
    this.state = state
    broadcast(IpcChannel.LiveStateChanged, state)
  }

  private patchStats(patch: Partial<StreamStats>): void {
    this.stats = { ...this.stats, ...patch }
    broadcast(IpcChannel.StreamStatsChanged, this.stats)
  }

  private startStatsLoop(): void {
    this.clearTimers()
    this.statsTimer = setInterval(() => this.pollStats(), STATS_INTERVAL_MS)
  }

  private clearTimers(): void {
    if (this.statsTimer) clearInterval(this.statsTimer)
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.statsTimer = null
    this.reconnectTimer = null
  }

  private pollStats(): void {
    if (this.state !== 'live' && !this.stats.reconnecting) return
    const durationSec = this.liveStartedAt
      ? Math.floor((Date.now() - this.liveStartedAt) / 1000)
      : 0
    if (this.activeMode === 'companion') {
      this.patchStats({ streaming: true, durationSec })
    } else {
      this.patchStats({ streaming: this.pusher.running || this.stats.reconnecting, durationSec })
    }
  }

  /** FFmpeg 进程异常退出：指数退避自动重推 */
  private handlePushExit(code: number | null): void {
    if (this.stopping) return
    if (code === 0) return
    if (this.state !== 'live') return
    if (this.reconnectAttempt >= MAX_RECONNECT) {
      this.patchStats({ streaming: false, reconnecting: false })
      this.setState('error')
      log.error(`断流重推 ${MAX_RECONNECT} 次仍失败，转入异常态。FFmpeg 输出：${this.pusher.getStderrTail().slice(-300)}`)
      return
    }
    this.reconnectAttempt += 1
    const delay = RECONNECT_BASE_DELAY_MS * 2 ** (this.reconnectAttempt - 1)
    this.patchStats({ streaming: false, reconnecting: true, reconnectAttempt: this.reconnectAttempt })
    log.warn(`推流进程退出(code=${code})，${delay / 1000}s 后进行第 ${this.reconnectAttempt} 次重推`)
    this.reconnectTimer = setTimeout(() => {
      this.startPush().catch((err) => {
        log.warn('断流重推失败:', err)
        this.handlePushExit(1)
      })
    }, delay)
  }
}

export const streamService = new StreamService()

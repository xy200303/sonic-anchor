import type { NowPlaying, Script, ScriptSegment } from '@shared/ipc'
import { audioEngine } from './engine'
import { useAudioStore } from '@renderer/stores/audio'
import { useConfigStore } from '@renderer/stores/config'
import { log } from '@renderer/utils/logger'

/**
 * 播报调度器（渲染进程）。
 * 循环：优先取回复队列（主进程优先级排序）→ 其次话术段落轮播（开场→讲解循环+催单）。
 * 回复插播天然优先：人工插话 priority=-1 永远最先。
 */

const IDLE_WAIT_MS = 1500
const PAUSE_POLL_MS = 400

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

class PlaybackScheduler {
  private running = false
  private paused = false
  private script: Script | null = null
  private scriptIdx = 0

  get isRunning(): boolean {
    return this.running
  }

  async start(scriptId: string): Promise<{ ok: boolean; error?: string }> {
    const script = await window.api.script.get(scriptId)
    if (!script) return { ok: false, error: '话术不存在' }
    const ready = script.segments.filter((s) => s.status === 'ready' && s.audioPath)
    if (ready.length === 0) return { ok: false, error: '该话术还没有合成完成的段落，请先预合成' }
    this.script = script
    this.scriptIdx = 0
    this.running = true
    this.paused = false
    this.syncUpcoming()
    void this.loop()
    log.info('播报调度器启动，话术:', script.title)
    return { ok: true }
  }

  stop(): void {
    this.running = false
    this.script = null
    audioEngine.stopCurrentTts()
    this.setNowPlaying(null)
    useAudioStore().setUpcomingSegments([])
  }

  pause(): void {
    this.paused = true
  }

  resume(): void {
    this.paused = false
  }

  get isPaused(): boolean {
    return this.paused
  }

  private async loop(): Promise<void> {
    while (this.running) {
      if (this.paused || audioEngine.muted) {
        await sleep(PAUSE_POLL_MS)
        continue
      }

      // 1) 回复队列优先
      const reply = await window.api.reply.next()
      if (this.running && reply?.audioPath) {
        this.setNowPlaying({
          id: reply.id,
          label: `回复 @${reply.author}`,
          kind: 'reply',
          text: reply.replyText
        })
        this.pushToStream(reply.audioPath)
        await audioEngine.playTts(reply.audioPath)
        await window.api.reply.action(reply.id, 'done')
        this.setNowPlaying(null)
        continue
      }

      // 2) 话术轮播
      const seg = this.nextSegment()
      if (this.running && seg?.audioPath) {
        this.setNowPlaying({
          id: seg.id,
          label: `话术 · ${this.segmentLabel(seg)}`,
          kind: 'script',
          text: seg.text
        })
        this.syncUpcoming()
        this.pushToStream(seg.audioPath)
        await audioEngine.playTts(seg.audioPath)
        this.setNowPlaying(null)
        continue
      }

      await sleep(IDLE_WAIT_MS)
    }
  }

  /** 开场播一次；之后 pitch + urge 段落无限循环 */
  private nextSegment(): ScriptSegment | null {
    const info = this.poolInfo()
    if (!info) return null
    const { opening, pool } = info

    if (this.scriptIdx === 0 && opening) {
      this.scriptIdx = 1
      return opening
    }
    const seg = pool[(this.scriptIdx - (opening ? 1 : 0)) % pool.length]
    this.scriptIdx += 1
    return seg
  }

  /** 不推进指针，预览接下来要播的 n 段（提词器"接下来"区域用） */
  private peekSegments(count: number): ScriptSegment[] {
    const info = this.poolInfo()
    if (!info) return []
    const { opening, pool } = info
    const out: ScriptSegment[] = []
    let idx = this.scriptIdx
    while (out.length < count) {
      if (idx === 0 && opening) {
        out.push(opening)
        idx = 1
        continue
      }
      out.push(pool[(idx - (opening ? 1 : 0)) % pool.length])
      idx += 1
    }
    return out
  }

  private poolInfo(): { opening: ScriptSegment | undefined; pool: ScriptSegment[] } | null {
    if (!this.script) return null
    const ready = this.script.segments.filter((s) => s.status === 'ready' && s.audioPath)
    if (ready.length === 0) return null
    const opening = ready.find((s) => s.type === 'opening')
    const loopable = ready.filter((s) => s.type !== 'opening' && s.type !== 'ending')
    return { opening, pool: loopable.length > 0 ? loopable : ready }
  }

  private syncUpcoming(): void {
    useAudioStore().setUpcomingSegments(
      this.peekSegments(3).map((s) => ({ label: `话术 · ${this.segmentLabel(s)}`, text: s.text }))
    )
  }

  private segmentLabel(seg: ScriptSegment): string {
    return (
      { opening: '开场', pitch: '讲解', urge: '催单', ending: '结束语' } as Record<string, string>
    )[seg.type] ?? seg.type
  }

  private setNowPlaying(np: NowPlaying | null): void {
    useAudioStore().setNowPlaying(np)
  }

  /** 直推（FFmpeg）模式下，音频还要送入主进程混音器进流 */
  private pushToStream(filePath: string): void {
    if (useConfigStore().config.stream.mode === 'direct') {
      void window.api.audioMixer.pushTts(filePath)
    }
  }
}

export const playbackScheduler = new PlaybackScheduler()

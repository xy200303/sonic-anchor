/**
 * WebAudio 混音引擎（渲染进程单例）。
 * 拓扑：
 *   tts 元素 → ttsGain ┐
 *   bgm 元素 → bgmGain ┼→ masterGain → analyser → destination
 * ducking：tts 播放期间 bgmGain 自动下压（Gain 自动化，无延迟抖动）。
 * AI 音频整体经 OBS「应用音频采集」源进入直播流。
 */

export interface EngineEvents {
  onLevels(levels: { tts: number; master: number }): void
  /** 真人说话状态变化（用于自动避让：暂停/恢复 AI 播报） */
  onHumanSpeaking(speaking: boolean): void
}

const LEVEL_INTERVAL_MS = 150

function toMediaUrl(filePath: string): string {
  const name = filePath.split(/[\\/]/).pop()!
  return `media:///${encodeURIComponent(name)}`
}

class AudioEngine {
  private ctx: AudioContext | null = null
  private masterGain: GainNode | null = null
  private ttsGain: GainNode | null = null
  private bgmGain: GainNode | null = null
  private analyser: AnalyserNode | null = null

  private ttsEl: HTMLAudioElement | null = null
  private bgmEl: HTMLAudioElement | null = null
  private bgmUrl = ''

  private duckingEnabled = true
  private duckingDepthDb = 14
  private aiMuted = false
  private activeTts = 0
  private levelsTimer: ReturnType<typeof setInterval> | null = null
  private events: EngineEvents | null = null

  // 麦克风总线
  private micStream: MediaStream | null = null
  private micGain: GainNode | null = null
  private micAnalyser: AnalyserNode | null = null
  private micWorklet: AudioWorkletNode | null = null
  private micAutoYield = true
  private speaking = false
  private lastSpeakAt = 0

  init(events: EngineEvents): void {
    this.events = events
  }

  private ensureGraph(): AudioContext {
    if (this.ctx) return this.ctx
    this.ctx = new AudioContext()
    this.masterGain = this.ctx.createGain()
    this.ttsGain = this.ctx.createGain()
    this.bgmGain = this.ctx.createGain()
    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = 256
    this.ttsGain.connect(this.masterGain)
    this.bgmGain.connect(this.masterGain)
    this.masterGain.connect(this.analyser)
    this.analyser.connect(this.ctx.destination)
    this.applyMute()
    this.startLevelLoop()
    return this.ctx
  }

  // ---------- TTS 播报 ----------

  /** 播放一条 TTS 音频，结束后 resolve */
  playTts(filePath: string): Promise<void> {
    const ctx = this.ensureGraph()
    void ctx.resume()
    return new Promise((resolve) => {
      const el = new Audio(toMediaUrl(filePath))
      this.ttsEl = el
      const src = ctx.createMediaElementSource(el)
      src.connect(this.ttsGain!)
      el.addEventListener('ended', () => this.finishTts(src, el, resolve), { once: true })
      el.addEventListener('error', () => this.finishTts(src, el, resolve), { once: true })
      this.activeTts += 1
      this.applyDuck(true)
      void el.play().catch(() => this.finishTts(src, el, resolve))
    })
  }

  private finishTts(
    src: MediaElementAudioSourceNode,
    el: HTMLAudioElement,
    resolve: () => void
  ): void {
    if (this.ttsEl === el) this.ttsEl = null
    src.disconnect()
    this.activeTts = Math.max(0, this.activeTts - 1)
    if (this.activeTts === 0) this.applyDuck(false)
    resolve()
  }

  stopCurrentTts(): void {
    if (this.ttsEl) {
      this.ttsEl.pause()
      this.ttsEl.currentTime = 0
      this.ttsEl = null
      this.activeTts = 0
      this.applyDuck(false)
    }
  }

  // ---------- 麦克风总线 ----------

  /**
   * 接入真人麦克风：人声进 master 总线（系统声音/监听），
   * forwardPcm=true 时同时把 PCM 帧转发给主进程混音器（FFmpeg 直推）。
   */
  async startMic(deviceId: string, opts: { autoYield: boolean; forwardPcm: boolean }): Promise<void> {
    this.stopMic()
    this.micAutoYield = opts.autoYield
    const ctx = this.ensureGraph()
    void ctx.resume()
    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    })
    const src = ctx.createMediaStreamSource(this.micStream)
    this.micGain = ctx.createGain()
    src.connect(this.micGain)
    this.micGain.connect(this.masterGain!)
    this.micAnalyser = ctx.createAnalyser()
    this.micAnalyser.fftSize = 256
    src.connect(this.micAnalyser)

    if (opts.forwardPcm) {
      await ctx.audioWorklet.addModule('/mic-processor.js')
      this.micWorklet = new AudioWorkletNode(ctx, 'mic-processor')
      src.connect(this.micWorklet)
      this.micWorklet.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
        window.api.audioMixer.pushMicPcm(new Uint8Array(e.data))
      }
    }
  }

  stopMic(): void {
    this.micWorklet?.disconnect()
    this.micWorklet = null
    this.micGain?.disconnect()
    this.micGain = null
    this.micAnalyser = null
    this.micStream?.getTracks().forEach((t) => t.stop())
    this.micStream = null
    if (this.speaking) {
      this.speaking = false
      this.events?.onHumanSpeaking(false)
    }
  }

  get micActive(): boolean {
    return this.micStream !== null
  }

  /** 麦克风 RMS 检测：说话→压 TTS 并通知调度器暂停，停嘴 800ms 恢复 */
  private detectSpeech(): void {
    if (!this.micAnalyser || !this.micAutoYield) return
    const buf = new Float32Array(this.micAnalyser.fftSize)
    this.micAnalyser.getFloatTimeDomainData(buf)
    let sum = 0
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
    const rms = Math.sqrt(sum / buf.length)

    if (rms > 0.02) {
      this.lastSpeakAt = Date.now()
      if (!this.speaking) {
        this.speaking = true
        this.applySpeechDuck()
        this.events?.onHumanSpeaking(true)
      }
    } else if (this.speaking && Date.now() - this.lastSpeakAt > 800) {
      this.speaking = false
      this.applySpeechDuck()
      this.events?.onHumanSpeaking(false)
    }
  }

  /** 说话时把 TTS 总线静音（调度器同时暂停，双保险） */
  private applySpeechDuck(): void {
    if (!this.ttsGain || !this.ctx || !this.micAutoYield) return
    this.ttsGain.gain.setTargetAtTime(this.speaking ? 0 : 1, this.ctx.currentTime, 0.1)
  }

  // ---------- BGM ----------

  startBgm(filePath: string, volume: number): void {
    const ctx = this.ensureGraph()
    void ctx.resume()
    const url = toMediaUrl(filePath)
    if (this.bgmEl && this.bgmUrl === url) {
      this.setBgmVolume(volume)
      return
    }
    this.stopBgm()
    const el = new Audio(url)
    el.loop = true
    const src = ctx.createMediaElementSource(el)
    src.connect(this.bgmGain!)
    this.bgmEl = el
    this.bgmUrl = url
    this.setBgmVolume(volume)
    void el.play().catch(() => undefined)
  }

  stopBgm(): void {
    this.bgmEl?.pause()
    this.bgmEl = null
    this.bgmUrl = ''
  }

  get bgmPlaying(): boolean {
    return this.bgmEl !== null
  }

  setBgmVolume(volume: number): void {
    if (!this.bgmGain || !this.ctx) return
    const target = this.duckTargetVolume(volume)
    this.bgmGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.15)
  }

  // ---------- ducking / 静音 ----------

  setDucking(enabled: boolean, depthDb: number): void {
    this.duckingEnabled = enabled
    this.duckingDepthDb = depthDb
    this.applyDuck(this.activeTts > 0)
  }

  private duckTargetVolume(volume: number): number {
    if (this.duckingEnabled && this.activeTts > 0) {
      return volume * 10 ** (-this.duckingDepthDb / 20)
    }
    return volume
  }

  private applyDuck(talking: boolean): void {
    if (!this.bgmGain || !this.ctx) return
    const target = talking ? 10 ** (-this.duckingDepthDb / 20) : 1
    if (!this.duckingEnabled) return
    this.bgmGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.2)
  }

  setAiMuted(muted: boolean): void {
    this.aiMuted = muted
    this.applyMute()
  }

  get muted(): boolean {
    return this.aiMuted
  }

  private applyMute(): void {
    if (!this.masterGain || !this.ctx) return
    this.masterGain.gain.setTargetAtTime(this.aiMuted ? 0 : 1, this.ctx.currentTime, 0.05)
  }

  /** 紧急停止：立即停掉所有 AI 播报（BGM 保留，推流不断） */
  panic(): void {
    this.stopCurrentTts()
    this.setAiMuted(false)
  }

  // ---------- 电平 ----------

  private startLevelLoop(): void {
    if (this.levelsTimer || !this.analyser) return
    const buf = new Float32Array(this.analyser.fftSize)
    this.levelsTimer = setInterval(() => {
      this.analyser!.getFloatTimeDomainData(buf)
      let sum = 0
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
      const rms = Math.min(1, Math.sqrt(sum / buf.length) * 2.5)
      this.events?.onLevels({ tts: this.activeTts > 0 ? rms : 0, master: rms })
      this.detectSpeech()
    }, LEVEL_INTERVAL_MS)
  }
}

export const audioEngine = new AudioEngine()

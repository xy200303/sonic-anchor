/**
 * 主进程 / 渲染进程共享的类型与 IPC channel 定义。
 * 三个进程都从这份文件取类型，避免两端漂移。
 */

// ---------- 配置模型 ----------

export type StreamMode = 'direct' | 'companion'
export type LlmProvider = 'doubao' | 'deepseek' | 'qwen'
export type TtsMode = 'online' | 'local'

export interface StreamConfig {
  mode: StreamMode
  serverUrl: string
  streamKey: string
}

export interface BgmConfig {
  path: string
  /** 0 - 1 */
  volume: number
}

export interface AudioConfig {
  duckingEnabled: boolean
  /** ducking 时下压深度（dB，正值） */
  duckingDepthDb: number
  /** 真人麦克风接入混音总线 */
  micEnabled: boolean
  micDeviceId: string
  /** 说话时自动压低/暂停 AI 播报 */
  autoYield: boolean
}

export interface LlmConfig {
  provider: LlmProvider
  baseUrl: string
  model: string
  apiKey: string
}

export interface TtsConfig {
  mode: TtsMode
  provider: string
  /** 火山引擎：应用 AppId */
  appId: string
  /** 火山引擎：Access Token（敏感字段） */
  accessToken: string
  /** 火山引擎：接入集群 */
  cluster: string
  apiKey: string
  voiceId: string
  speed: number
}

export interface CommentConfig {
  appId: string
  appSecret: string
  roomId: string
  /** 开发模式：使用内置评论模拟器（不连抖音） */
  devSimulate: boolean
}

export interface AppConfig {
  stream: StreamConfig
  bgm: BgmConfig
  audio: AudioConfig
  llm: LlmConfig
  tts: TtsConfig
  comment: CommentConfig
}

export const DEFAULT_CONFIG: AppConfig = {
  stream: { mode: 'direct', serverUrl: '', streamKey: '' },
  bgm: { path: '', volume: 0.3 },
  audio: {
    duckingEnabled: true,
    duckingDepthDb: 14,
    micEnabled: false,
    micDeviceId: '',
    autoYield: true
  },
  llm: {
    provider: 'doubao',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    model: 'doubao-pro-32k',
    apiKey: ''
  },
  tts: {
    mode: 'online',
    provider: 'volcano',
    appId: '',
    accessToken: '',
    cluster: 'volcano_tts',
    apiKey: '',
    voiceId: '',
    speed: 1.0
  },
  comment: { appId: '', appSecret: '', roomId: '', devSimulate: false }
}

/** 以 dot path 标记的敏感字段，主进程写入前用 safeStorage 加密 */
export const SECRET_KEYS = new Set([
  'stream.streamKey',
  'llm.apiKey',
  'tts.accessToken',
  'tts.apiKey',
  'comment.appSecret'
])

// ---------- 直播会话状态机 ----------

export type LiveState =
  | 'idle'
  | 'ready'
  | 'starting'
  | 'live'
  | 'paused'
  | 'ending'
  | 'ended'
  | 'error'

// ---------- 推流 ----------

export type StreamErrorCode =
  | 'NOT_CONFIGURED'
  | 'OBS_NOT_RUNNING'
  | 'OBS_AUTH_FAILED'
  | 'MODE_NOT_SUPPORTED'
  | 'STREAM_START_FAILED'
  | 'INTERNAL'

export interface StreamError {
  code: StreamErrorCode
  message: string
}

export interface StreamStartResult {
  ok: boolean
  error?: StreamError
}

export interface StreamStats {
  obsConnected: boolean
  streaming: boolean
  reconnecting: boolean
  reconnectAttempt: number
  bitrateKbps: number
  droppedFrames: number
  durationSec: number
}

export const INITIAL_STREAM_STATS: StreamStats = {
  obsConnected: false,
  streaming: false,
  reconnecting: false,
  reconnectAttempt: 0,
  bitrateKbps: 0,
  droppedFrames: 0,
  durationSec: 0
}

// ---------- 话术脚本 ----------

export type ScriptSegmentType = 'opening' | 'pitch' | 'urge' | 'ending'

export interface ScriptSegment {
  id: string
  type: ScriptSegmentType
  text: string
  estDurationSec: number
  audioPath?: string
  status: 'pending' | 'synthesizing' | 'ready' | 'failed'
}

export interface Script {
  id: string
  title: string
  productId: string | null
  segments: ScriptSegment[]
  createdAt: number
}

export interface ScriptGenerateRequest {
  productIds: string[]
  styleHint: string
  /** 循环讲解段数量 */
  pitchCount: number
}

// ---------- 音色 ----------

export interface VoiceProfile {
  id: string
  name: string
  /** cloned = 火山声音复刻音色；preset = 内置 */
  source: 'cloned' | 'preset'
  /** 火山 voice_type；内置音色为占位值 */
  voiceType: string
  samplePath: string | null
  createdAt: number
}

// ---------- 评论 ----------

export type CommentKind = 'comment' | 'gift' | 'enter'

export type IntentType = 'price' | 'question' | 'chitchat' | 'spam' | 'other'

export interface CommentEvent {
  id: string
  sessionId: string
  author: string
  authorId: string
  content: string
  kind: CommentKind
  ts: number
  intent: IntentType | null
}

export interface CommentGatewayStatus {
  running: boolean
  source: 'douyin' | 'simulator' | 'none'
  roomId: string
  lastError: string | null
  receivedCount: number
}

// ---------- AI 回复 ----------

export type ReplyStatus =
  | 'generating'
  | 'synthesizing'
  | 'queued'
  | 'playing'
  | 'done'
  | 'skipped'
  | 'failed'

export interface ReplyItem {
  id: string
  commentId: string
  author: string
  question: string
  replyText: string
  intent: IntentType
  status: ReplyStatus
  priority: number
  createdAt: number
  /** 语音播报是否已启用 */
  speak: boolean
  /** TTS 合成后的音频文件路径（合成完成前为空） */
  audioPath?: string
}

export interface ReplyQueueSnapshot {
  items: ReplyItem[]
  /** 自动回复总开关（紧急停止后置为 false） */
  autoReplyEnabled: boolean
  rateLimitedAuthors: string[]
}

// ---------- 数据分析 ----------

export interface SessionSummary {
  id: string
  startedAt: number
  endedAt: number | null
  durationSec: number
  commentCount: number
  replyCount: number
  replyRate: number
  avgReplyLatencyMs: number | null
}

export interface IntentStat {
  intent: string
  count: number
}

export interface TopQuestion {
  question: string
  count: number
}

export interface AnalyticsOverview {
  totals: {
    sessions: number
    totalDurationSec: number
    commentCount: number
    replyCount: number
    replyRate: number
  }
  sessions: SessionSummary[]
  intents: IntentStat[]
  topQuestions: TopQuestion[]
}

// ---------- 音频（渲染进程混音器 → 主进程转发事件） ----------

export interface AudioLevels {
  tts: number
  master: number
}

export interface NowPlaying {
  id: string
  label: string
  kind: 'script' | 'reply' | 'manual'
  /** 当前播报的完整文字稿（用于控制台提词器） */
  text?: string
}

// ---------- IPC channel ----------

export const IpcChannel = {
  ConfigGet: 'config:get',
  ConfigSet: 'config:set',
  AppInfo: 'app:info',
  ProductList: 'product:list',
  ProductSave: 'product:save',
  ProductDelete: 'product:delete',

  StreamStart: 'stream:start',
  StreamStop: 'stream:stop',
  StreamStats: 'stream:stats',
  StreamPreview: 'stream:preview',

  ScriptGenerate: 'script:generate',
  ScriptChunk: 'script:chunk',
  ScriptDone: 'script:done',
  ScriptList: 'script:list',
  ScriptGet: 'script:get',
  ScriptDelete: 'script:delete',
  ScriptUpdateSegment: 'script:update-segment',
  ScriptPresynthesize: 'script:presynthesize',
  ScriptSynthProgress: 'script:synth-progress',
  TtsTest: 'tts:test',

  VoiceList: 'voice:list',
  VoiceSave: 'voice:save',
  VoiceDelete: 'voice:delete',

  CommentStatus: 'comment:status',
  CommentStart: 'comment:start',
  CommentStop: 'comment:stop',
  CommentBatch: 'comment:batch',
  CommentHistory: 'comment:history',

  DialogPickFile: 'dialog:pick-file',

  ReplyQueue: 'reply:queue',
  ReplyAction: 'reply:action',
  ReplyManual: 'reply:manual',
  ReplyNext: 'reply:next',
  ReplyQueueChanged: 'reply:queue-changed',
  ReplyAutoSet: 'reply:auto-set',

  AnalyticsOverview: 'analytics:overview',
  AnalyticsExport: 'analytics:export',

  AiMuteSet: 'audio:ai-mute-set',
  PanicStop: 'audio:panic-stop',
  AudioMixerTts: 'audio:mixer-tts',
  AudioMixerBgm: 'audio:mixer-bgm',
  AudioMicPcm: 'audio:mic-pcm',

  LiveStateChanged: 'live:state-changed',
  StreamStatsChanged: 'stream:stats-changed'
} as const

// ---------- 数据模型 ----------

export interface Product {
  id: string
  name: string
  price: number
  sellingPoints: string
  faq: string
  createdAt: number
}

export interface AppInfo {
  version: string
  platform: string
}

// ---------- preload 暴露给渲染进程的 API 形状 ----------

export interface AppApi {
  config: {
    get(): Promise<AppConfig>
    set(patch: PartialDeep<AppConfig>): Promise<AppConfig>
  }
  app: { info(): Promise<AppInfo> }
  db: {
    listProducts(): Promise<Product[]>
    saveProduct(p: Product): Promise<void>
    deleteProduct(id: string): Promise<void>
  }
  stream: {
    start(): Promise<StreamStartResult>
    stop(): Promise<void>
    stats(): Promise<StreamStats>
    preview(): Promise<string | null>
  }
  script: {
    generate(req: ScriptGenerateRequest): Promise<{ ok: boolean; error?: string }>
    list(): Promise<Script[]>
    get(id: string): Promise<Script | null>
    remove(id: string): Promise<void>
    updateSegment(scriptId: string, seg: ScriptSegment): Promise<void>
    presynthesize(scriptId: string): Promise<void>
  }
  tts: { test(text: string): Promise<{ ok: boolean; error?: string; audioPath?: string }> }
  voice: {
    list(): Promise<VoiceProfile[]>
    save(v: VoiceProfile): Promise<void>
    remove(id: string): Promise<void>
  }
  comment: {
    status(): Promise<CommentGatewayStatus>
    start(): Promise<{ ok: boolean; error?: string }>
    stop(): Promise<void>
    history(sessionId: string): Promise<CommentEvent[]>
  }
  dialog: {
    /** 弹出文件选择框，取消返回 null */
    pickFile(filtersName: string, extensions: string[]): Promise<string | null>
  }
  reply: {
    queue(): Promise<ReplyQueueSnapshot>
    action(
      id: string,
      action: 'skip' | 'prioritize' | 'done',
      patch?: { replyText?: string }
    ): Promise<void>
    /** 调度器空闲时取下一个待播报回复（主进程标记为 playing），无则 null */
    next(): Promise<(ReplyItem & { audioPath?: string }) | null>
    manual(commentId: string, text: string): Promise<void>
    setAuto(enabled: boolean): Promise<void>
  }
  analytics: {
    overview(): Promise<AnalyticsOverview>
    exportCsv(): Promise<string>
  }
  audioControl: {
    setAiMuted(muted: boolean): Promise<void>
    panicStop(): Promise<void>
  }
  audioMixer: {
    /** 直推模式：把合成好的 TTS 音频送入推流混音器 */
    pushTts(filePath: string): Promise<void>
    setBgm(action: 'start' | 'stop' | 'volume', filePath?: string, volume?: number): Promise<void>
    /** 直推模式：真人麦克风 PCM 帧（s16le 48k stereo）送入混音器 */
    pushMicPcm(pcm: Uint8Array): void
  }
  onLiveStateChanged(cb: (state: LiveState) => void): () => void
  onStreamStatsChanged(cb: (stats: StreamStats) => void): () => void
  onCommentBatch(cb: (comments: CommentEvent[]) => void): () => void
  onReplyQueueChanged(cb: (snapshot: ReplyQueueSnapshot) => void): () => void
  onScriptChunk(cb: (chunk: { scriptId: string; text: string }) => void): () => void
  onScriptDone(cb: (payload: { script: Script | null; error?: string }) => void): () => void
  onScriptSynthProgress(cb: (p: { scriptId: string; done: number; total: number }) => void): () => void
  onPanicStop(cb: () => void): () => void
}

/** 单层到多层的部分更新（Secret 字段同样是明文进、密文存） */
export type PartialDeep<T> = {
  [K in keyof T]?: T[K] extends object ? PartialDeep<T[K]> : T[K]
}

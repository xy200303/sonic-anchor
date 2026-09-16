import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import {
  IpcChannel,
  type AppApi,
  type AppConfig,
  type CommentEvent,
  type LiveState,
  type PartialDeep,
  type ReplyQueueSnapshot,
  type Script,
  type StreamStats
} from '@shared/ipc'

function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  return ipcRenderer.invoke(channel, ...args) as Promise<T>
}

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: AppApi = {
  config: {
    get: () => invoke(IpcChannel.ConfigGet),
    set: (patch: PartialDeep<AppConfig>) => invoke(IpcChannel.ConfigSet, patch)
  },
  app: { info: () => invoke(IpcChannel.AppInfo) },
  db: {
    listProducts: () => invoke(IpcChannel.ProductList),
    saveProduct: (p) => invoke(IpcChannel.ProductSave, p),
    deleteProduct: (id) => invoke(IpcChannel.ProductDelete, id)
  },
  stream: {
    start: () => invoke(IpcChannel.StreamStart),
    stop: () => invoke(IpcChannel.StreamStop),
    stats: () => invoke(IpcChannel.StreamStats),
    preview: () => invoke(IpcChannel.StreamPreview)
  },
  script: {
    generate: (req) => invoke(IpcChannel.ScriptGenerate, req),
    list: () => invoke(IpcChannel.ScriptList),
    get: (id) => invoke(IpcChannel.ScriptGet, id),
    remove: (id) => invoke(IpcChannel.ScriptDelete, id),
    updateSegment: (scriptId, seg) => invoke(IpcChannel.ScriptUpdateSegment, scriptId, seg),
    presynthesize: (id) => invoke(IpcChannel.ScriptPresynthesize, id)
  },
  tts: { test: (text) => invoke(IpcChannel.TtsTest, text) },
  voice: {
    list: () => invoke(IpcChannel.VoiceList),
    save: (v) => invoke(IpcChannel.VoiceSave, v),
    remove: (id) => invoke(IpcChannel.VoiceDelete, id)
  },
  comment: {
    status: () => invoke(IpcChannel.CommentStatus),
    start: () => invoke(IpcChannel.CommentStart),
    stop: () => invoke(IpcChannel.CommentStop),
    history: (sessionId) => invoke(IpcChannel.CommentHistory, sessionId)
  },
  dialog: {
    pickFile: (filtersName, extensions) =>
      invoke(IpcChannel.DialogPickFile, filtersName, extensions)
  },
  reply: {
    queue: () => invoke(IpcChannel.ReplyQueue),
    action: (id, action, patch) => invoke(IpcChannel.ReplyAction, id, action, patch),
    next: () => invoke(IpcChannel.ReplyNext),
    manual: (commentId, text) => invoke(IpcChannel.ReplyManual, commentId, text),
    setAuto: (enabled) => invoke(IpcChannel.ReplyAutoSet, enabled)
  },
  analytics: {
    overview: () => invoke(IpcChannel.AnalyticsOverview),
    exportCsv: () => invoke(IpcChannel.AnalyticsExport)
  },
  audioControl: {
    setAiMuted: (muted) => invoke(IpcChannel.AiMuteSet, muted),
    panicStop: () => invoke(IpcChannel.PanicStop)
  },
  audioMixer: {
    pushTts: (filePath) => invoke(IpcChannel.AudioMixerTts, filePath),
    setBgm: (action, filePath, volume) => invoke(IpcChannel.AudioMixerBgm, action, filePath, volume),
    pushMicPcm: (pcm) => ipcRenderer.send(IpcChannel.AudioMicPcm, pcm)
  },
  onLiveStateChanged: (cb) => subscribe<LiveState>(IpcChannel.LiveStateChanged, cb),
  onStreamStatsChanged: (cb) => subscribe<StreamStats>(IpcChannel.StreamStatsChanged, cb),
  onCommentBatch: (cb) => subscribe<CommentEvent[]>(IpcChannel.CommentBatch, cb),
  onReplyQueueChanged: (cb) => subscribe<ReplyQueueSnapshot>(IpcChannel.ReplyQueueChanged, cb),
  onScriptChunk: (cb) => subscribe<{ scriptId: string; text: string }>(IpcChannel.ScriptChunk, cb),
  onScriptDone: (cb) =>
    subscribe<{ script: Script | null; error?: string }>(IpcChannel.ScriptDone, cb),
  onScriptSynthProgress: (cb) =>
    subscribe<{ scriptId: string; done: number; total: number }>(
      IpcChannel.ScriptSynthProgress,
      cb
    ),
  onPanicStop: (cb) => subscribe<null>(IpcChannel.PanicStop, () => cb())
}

contextBridge.exposeInMainWorld('api', api)

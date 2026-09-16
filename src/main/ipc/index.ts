import { app, dialog, ipcMain, BrowserWindow } from 'electron'
import {
  IpcChannel,
  type AppConfig,
  type PartialDeep,
  type ScriptGenerateRequest,
  type ScriptSegment,
  type Product,
  type StreamStartResult,
  type VoiceProfile
} from '@shared/ipc'
import { loadConfig, updateConfig } from '../modules/store/config'
import {
  deleteProduct,
  getAnalytics,
  getAllRepliesCsv,
  listComments,
  listProducts,
  listVoices,
  saveProduct,
  saveVoice,
  deleteVoice
} from '../modules/store/db'
import { streamService } from '../modules/stream/streamService'
import { audioMixer } from '../modules/stream/ffmpeg/mixer'
import { scriptService } from '../modules/script/scriptService'
import { synthesizeToFile, audioCacheDir } from '../modules/tts/volcanoClient'
import { join } from 'node:path'
import { commentGateway } from '../modules/comment/gateway'
import { replyService } from '../modules/reply/replyService'
import { broadcast } from './broadcast'
import { log } from '../logger'

export function registerIpcHandlers(): void {
  // ---------- 配置 ----------
  ipcMain.handle(IpcChannel.ConfigGet, (): AppConfig => loadConfig())
  ipcMain.handle(IpcChannel.ConfigSet, (_e, patch: PartialDeep<AppConfig>) => updateConfig(patch))

  ipcMain.handle(IpcChannel.AppInfo, () => ({
    version: app.getVersion(),
    platform: process.platform
  }))

  // ---------- 商品 ----------
  ipcMain.handle(IpcChannel.ProductList, () => listProducts())
  ipcMain.handle(IpcChannel.ProductSave, (_e, p: Product) => saveProduct(p))
  ipcMain.handle(IpcChannel.ProductDelete, (_e, id: string) => deleteProduct(id))

  // ---------- 推流 / 场景 ----------
  ipcMain.handle(IpcChannel.StreamStart, (): Promise<StreamStartResult> => streamService.start())
  ipcMain.handle(IpcChannel.StreamStop, () => streamService.stop())
  ipcMain.handle(IpcChannel.StreamStats, () => streamService.getStats())
  ipcMain.handle(IpcChannel.StreamPreview, () => streamService.preview())

  // ---------- 话术 / TTS / 音色 ----------
  ipcMain.handle(IpcChannel.ScriptGenerate, (_e, req: ScriptGenerateRequest) =>
    scriptService.generate(req)
  )
  ipcMain.handle(IpcChannel.ScriptList, () => scriptService.list())
  ipcMain.handle(IpcChannel.ScriptGet, (_e, id: string) => scriptService.get(id))
  ipcMain.handle(IpcChannel.ScriptDelete, (_e, id: string) => scriptService.remove(id))
  ipcMain.handle(IpcChannel.ScriptUpdateSegment, (_e, scriptId: string, seg: ScriptSegment) =>
    scriptService.updateSegment(scriptId, seg)
  )
  ipcMain.handle(IpcChannel.ScriptPresynthesize, (_e, scriptId: string) =>
    scriptService.presynthesize(scriptId)
  )

  ipcMain.handle(IpcChannel.TtsTest, async (_e, text: string) => {
    try {
      const file = join(audioCacheDir(), `test-${Date.now()}.mp3`)
      await synthesizeToFile(text, file, { format: 'mp3' })
      return { ok: true, audioPath: file }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(IpcChannel.VoiceList, () => listVoices())
  ipcMain.handle(IpcChannel.VoiceSave, (_e, v: VoiceProfile) => saveVoice(v))
  ipcMain.handle(IpcChannel.VoiceDelete, (_e, id: string) => deleteVoice(id))

  // ---------- 评论 / 回复 ----------
  ipcMain.handle(IpcChannel.CommentStatus, () => commentGateway.status())
  ipcMain.handle(IpcChannel.CommentStart, () => commentGateway.start())
  ipcMain.handle(IpcChannel.CommentStop, () => commentGateway.stop())
  ipcMain.handle(IpcChannel.CommentHistory, (_e, sessionId: string) => listComments(sessionId))

  ipcMain.handle(IpcChannel.ReplyQueue, () => replyService.snapshot())
  ipcMain.handle(
    IpcChannel.ReplyAction,
    (_e, id: string, action: 'skip' | 'prioritize' | 'done', patch?: { replyText?: string }) =>
      replyService.action(id, action, patch)
  )
  ipcMain.handle(IpcChannel.ReplyManual, (_e, commentId: string, text: string) =>
    replyService.manual(commentId, text)
  )
  ipcMain.handle(IpcChannel.ReplyNext, () => replyService.next())
  ipcMain.handle(IpcChannel.ReplyAutoSet, (_e, enabled: boolean) => replyService.setAuto(enabled))

  ipcMain.handle(
    IpcChannel.DialogPickFile,
    async (_e, filtersName: string, extensions: string[]) => {
      const win = BrowserWindow.getFocusedWindow()
      const result = await dialog.showOpenDialog(win ?? BrowserWindow.getAllWindows()[0], {
        properties: ['openFile'],
        filters: [{ name: filtersName, extensions }]
      })
      return result.canceled ? null : (result.filePaths[0] ?? null)
    }
  )

  // ---------- 分析 ----------
  ipcMain.handle(IpcChannel.AnalyticsOverview, () => {
    const data = getAnalytics()
    const totals = {
      sessions: data.sessions.length,
      totalDurationSec: data.sessions.reduce((s, x) => s + x.durationSec, 0),
      commentCount: data.sessions.reduce((s, x) => s + x.commentCount, 0),
      replyCount: data.sessions.reduce((s, x) => s + x.replyCount, 0),
      replyRate: 0
    }
    totals.replyRate =
      totals.commentCount > 0 ? totals.replyCount / totals.commentCount : 0
    return { totals, sessions: data.sessions, intents: data.intents, topQuestions: data.topQuestions }
  })
  ipcMain.handle(IpcChannel.AnalyticsExport, () => getAllRepliesCsv())

  // ---------- 音频控制面（引擎在渲染进程；混音器喂 FFmpeg） ----------
  ipcMain.handle(IpcChannel.AiMuteSet, (_e, muted: boolean) => replyService.setAiMuted(muted))
  ipcMain.handle(IpcChannel.PanicStop, () => {
    replyService.panic()
    broadcast(IpcChannel.PanicStop, null)
  })
  ipcMain.handle(IpcChannel.AudioMixerTts, (_e, filePath: string) =>
    audioMixer.pushTts(filePath)
  )
  ipcMain.handle(
    IpcChannel.AudioMixerBgm,
    (_e, action: 'start' | 'stop' | 'volume', filePath?: string, volume?: number) =>
      audioMixer.setBgm(action, filePath, volume)
  )
  ipcMain.on(IpcChannel.AudioMicPcm, (_e, pcm: Uint8Array) => {
    audioMixer.pushMicPcm(Buffer.from(pcm))
  })

  log.info('IPC handlers registered')
}

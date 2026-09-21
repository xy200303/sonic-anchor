import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type {
  Script,
  ScriptGenerateRequest,
  ScriptSegment,
  ScriptSegmentType
} from '@shared/ipc'
import { IpcChannel } from '@shared/ipc'
import { chat } from '../llm/client'
import { synthesizeToFile, audioCacheDir } from '../tts/volcanoClient'
import { getScript, listProducts, listScripts, saveScript, deleteScript } from '../store/db'
import { broadcast } from '../../ipc/broadcast'
import { log } from '../../logger'
import { buildScriptPrompt } from './prompts'

/**
 * 话术服务：LLM 生成（严格 JSON 校验）→ 持久化 → 句级并行预合成。
 * 预合成以 3 路并发跑，进度通过事件外发；合成失败的段落可单独重试。
 */

const SYNTH_CONCURRENCY = 3

function parseSegments(content: string, pitchCount: number): ScriptSegment[] {
  const m = content.match(/\{[\s\S]*\}/)
  if (!m) throw new Error('LLM 未返回合法 JSON')
  const parsed = JSON.parse(m[0]) as { segments?: { type: string; text: string }[] }
  if (!Array.isArray(parsed.segments) || parsed.segments.length === 0) {
    throw new Error('LLM 返回缺少 segments')
  }
  const pitches = parsed.segments.filter((s) => s.type === 'pitch')
  if (pitches.length < Math.min(1, pitchCount)) {
    throw new Error('LLM 返回的讲解段数量不足')
  }
  return parsed.segments.map((s) => ({
    id: randomUUID(),
    type: (['opening', 'pitch', 'urge', 'ending'].includes(s.type) ? s.type : 'pitch') as ScriptSegmentType,
    text: String(s.text ?? '').trim(),
    estDurationSec: Math.max(4, Math.ceil(String(s.text ?? '').length / 5.2)),
    status: 'pending' as const
  }))
}

async function generate(req: ScriptGenerateRequest): Promise<{ ok: boolean; error?: string }> {
  const products = listProducts().filter((p) => req.productIds.includes(p.id))
  if (products.length === 0) return { ok: false, error: '请先在商品知识库中录入并勾选商品' }

  const scriptId = randomUUID()
  try {
    const reply = await chat(buildScriptPrompt(products, req.styleHint, req.pitchCount), {
      temperature: 0.8
    })
    const segments = parseSegments(reply, req.pitchCount)
    const script: Script = {
      id: scriptId,
      title: `${products.map((p) => p.name).join(' / ')} · ${new Date().toLocaleString('zh-CN')}`,
      productId: products.length === 1 ? products[0].id : null,
      segments,
      createdAt: Date.now()
    }
    saveScript(script)
    broadcast(IpcChannel.ScriptDone, { script })
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log.error('话术生成失败:', message)
    broadcast(IpcChannel.ScriptDone, { script: null, error: message })
    return { ok: false, error: message }
  }
}

async function synthesizeSegment(scriptId: string, seg: ScriptSegment): Promise<ScriptSegment> {
  const file = join(audioCacheDir(), `script-${scriptId}-${seg.id}.mp3`)
  try {
    await synthesizeToFile(seg.text, file, { format: 'mp3' })
    return { ...seg, audioPath: file, status: 'ready' }
  } catch (err) {
    log.warn(`段落合成失败 (${seg.id}):`, err)
    return { ...seg, status: 'failed' }
  }
}

async function presynthesize(scriptId: string): Promise<void> {
  const script = getScript(scriptId)
  if (!script) return

  const pending = script.segments.filter((s) => s.status !== 'ready')
  const total = pending.length
  let done = 0

  const worker = async (): Promise<void> => {
    for (;;) {
      const seg = pending.pop()
      if (!seg) return
      const updated = await synthesizeSegment(scriptId, seg)
      const current = getScript(scriptId)
      if (current) {
        saveScript({
          ...current,
          segments: current.segments.map((s) => (s.id === seg.id ? updated : s))
        })
      }
      done += 1
      broadcast(IpcChannel.ScriptSynthProgress, { scriptId, done, total })
    }
  }

  broadcast(IpcChannel.ScriptSynthProgress, { scriptId, done: 0, total })
  await Promise.all(Array.from({ length: SYNTH_CONCURRENCY }, () => worker()))
}

function updateSegment(scriptId: string, seg: ScriptSegment): void {
  const script = getScript(scriptId)
  if (!script) return
  saveScript({
    ...script,
    segments: script.segments.map((s) => (s.id === seg.id ? { ...seg, audioPath: undefined, status: 'pending' } : s))
  })
}

export const scriptService = {
  generate,
  list: listScripts,
  get: getScript,
  remove: deleteScript,
  updateSegment,
  presynthesize
}

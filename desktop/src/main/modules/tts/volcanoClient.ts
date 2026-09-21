import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { loadConfig } from '../store/config'
import { log } from '../../logger'

/**
 * 火山引擎语音合成（大模型语音合成 HTTP 协议）。
 * 文档: https://www.volcengine.com/docs/6561/79817
 * 预合成走 HTTP 一次性返回 PCM/MP3；实时回复采用"句级并行合成"策略，
 * 由上层把 LLM 句子流分发到本客户端并发调用，按序拼接播放。
 */

const TTS_URL = 'https://openspeech.bytedance.com/api/v1/tts'

interface TtsRequest {
  app: { appid: string; token: string; cluster: string }
  user: { uid: string }
  audio: { voice_type: string; encoding: string; speed_ratio: number }
  request: { reqid: string; text: string; operation: string }
}

export async function synthesizeToFile(
  text: string,
  outPath: string,
  opts?: { voiceType?: string; speed?: number; format?: 'mp3' | 'pcm' | 'wav' }
): Promise<void> {
  const { tts } = loadConfig()
  if (!tts.appId || !tts.accessToken) throw new Error('火山 TTS AppId / Access Token 未配置')
  if (!tts.voiceId) throw new Error('未选择音色（voiceId 为空）')

  const payload: TtsRequest = {
    app: { appid: tts.appId, token: tts.accessToken, cluster: tts.cluster || 'volcano_tts' },
    user: { uid: 'ailive-user' },
    audio: {
      voice_type: opts?.voiceType ?? tts.voiceId,
      encoding: opts?.format ?? 'mp3',
      speed_ratio: opts?.speed ?? tts.speed
    },
    request: {
      reqid: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      text,
      operation: 'query'
    }
  }

  const res = await fetch(TTS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer;${tts.accessToken}`
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000)
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`TTS 请求失败 ${res.status}: ${body.slice(0, 200)}`)
  }
  const data = (await res.json()) as { code?: number; message?: string; data?: string }
  if (data.code !== 3000 || !data.data) {
    throw new Error(`TTS 合成失败: code=${data.code} ${data.message ?? ''}`)
  }

  await mkdir(join(outPath, '..'), { recursive: true }).catch(() => undefined)
  await writeFile(outPath, Buffer.from(data.data, 'base64'))
}

export function audioCacheDir(): string {
  const dir = join(app.getPath('userData'), 'audio-cache')
  mkdir(dir, { recursive: true }).catch((err) => log.warn('创建音频缓存目录失败:', err))
  return dir
}

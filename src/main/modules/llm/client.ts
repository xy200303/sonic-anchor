import { loadConfig } from '../store/config'
import { log } from '../../logger'

/**
 * OpenAI 兼容协议的聊天客户端。
 * 豆包 ark / DeepSeek / 通义千问 均为该协议，仅 baseUrl + model 不同。
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export async function chat(messages: ChatMessage[], opts?: { temperature?: number }): Promise<string> {
  const { llm } = loadConfig()
  if (!llm.apiKey) throw new Error('LLM API Key 未配置')

  const res = await fetch(`${llm.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${llm.apiKey}`
    },
    body: JSON.stringify({
      model: llm.model,
      messages,
      temperature: opts?.temperature ?? 0.7
    }),
    signal: AbortSignal.timeout(30000)
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`LLM 请求失败 ${res.status}: ${body.slice(0, 200)}`)
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('LLM 返回为空')
  return content
}

/** 句级流式：逐句回调，供"句级并行 TTS"消费 */
export async function chatStreamSentences(
  messages: ChatMessage[],
  onSentence: (sentence: string) => void,
  opts?: { temperature?: number }
): Promise<void> {
  const { llm } = loadConfig()
  if (!llm.apiKey) throw new Error('LLM API Key 未配置')

  const res = await fetch(`${llm.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${llm.apiKey}`
    },
    body: JSON.stringify({
      model: llm.model,
      messages,
      temperature: opts?.temperature ?? 0.7,
      stream: true
    }),
    signal: AbortSignal.timeout(60000)
  })
  if (!res.ok || !res.body) {
    throw new Error(`LLM 流式请求失败 ${res.status}`)
  }

  let buffer = ''
  let sentenceBuf = ''
  const reader = res.body
  for await (const chunk of reader) {
    const text = Buffer.from(chunk as Uint8Array).toString('utf-8')
    buffer += text
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (payload === '[DONE]') continue
      try {
        const json = JSON.parse(payload) as {
          choices?: { delta?: { content?: string } }[]
        }
        const delta = json.choices?.[0]?.delta?.content
        if (!delta) continue
        sentenceBuf += delta
        const m = sentenceBuf.match(/^([\s\S]*?[。！？!?；;\n])/)
        if (m) {
          onSentence(m[1].trim())
          sentenceBuf = sentenceBuf.slice(m[1].length)
        }
      } catch {
        log.warn('LLM 流式数据解析失败，已跳过该块')
      }
    }
  }
  const tail = sentenceBuf.trim()
  if (tail) onSentence(tail)
}

export const llm = { chat }

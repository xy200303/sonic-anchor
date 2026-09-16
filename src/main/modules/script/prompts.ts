import type { ChatMessage } from '../llm/client'
import type { Product } from '@shared/ipc'

/** 话术生成的 prompt 构造，与业务代码分离便于迭代调优 */

const TYPE_LABEL: Record<string, string> = {
  opening: '开场',
  pitch: '卖点讲解',
  urge: '催单',
  ending: '结束语'
}

export function buildScriptPrompt(
  products: Product[],
  styleHint: string,
  pitchCount: number
): ChatMessage[] {
  const catalog = products
    .map(
      (p, i) =>
        `【商品${i + 1}】${p.name}（价格: ${p.price}元）\n卖点: ${p.sellingPoints}\nFAQ: ${p.faq}`
    )
    .join('\n\n')

  const system = `你是一位专业电商直播话术编剧，为「AI 语音直播」撰写讲解脚本。
要求：
1. 语言口语化，适合朗读（短句、有停顿感），禁用 markdown 符号与表情；
2. 价格、参数必须严格来自商品资料，禁止编造；
3. 每段 60-120 字，信息密度高、不注水；
4. 只输出 JSON，格式：{"segments":[{"type":"opening|pitch|urge|ending","text":"..."}]}
   其中 pitch 段数严格为 ${pitchCount} 段，opening/ending 各 1 段，urge 1-2 段。`

  const user = `请为以下商品撰写整场直播话术${styleHint ? `。风格要求：${styleHint}` : ''}：

${catalog}

共需 ${pitchCount + 4} 段左右。`

  return [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ]
}

export function segmentTypeLabel(type: string): string {
  return TYPE_LABEL[type] ?? type
}

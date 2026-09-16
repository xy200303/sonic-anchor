import type { CommentEvent } from '@shared/ipc'

/**
 * 开发用评论模拟器：生成拟真评论流，用于没有开放平台凭据时
 * 端到端调通「评论 → 意图 → 回复 → 播报」链路。仅 devSimulate 开启时使用。
 */

const POOL: { author: string; content: string }[] = [
  { author: '爱做饭的桃子', content: '这个多少钱一套？' },
  { author: '山丘', content: '比平时便宜多少' },
  { author: 'Lily', content: '包安装吗？' },
  { author: '大熊', content: '哈哈哈哈主播好可爱' },
  { author: '阿明', content: '什么材质的啊，耐用吗' },
  { author: '路过看看', content: '666' },
  { author: '小乔', content: '支持七天无理由吗' },
  { author: 'Kerwin', content: '什么时候发货' },
  { author: '橘子汽水', content: '有没有别的颜色' },
  { author: 'momo', content: '已拍，期待发货！' },
  { author: '风继续吹', content: '质量怎么样，会不会用几天就坏' },
  { author: '豆豆', content: '优惠链接在哪领' }
]

export class CommentSimulator {
  private timer: NodeJS.Timeout | null = null
  private onComment: (c: CommentEvent) => void

  constructor(onComment: (c: CommentEvent) => void) {
    this.onComment = onComment
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => {
      if (Math.random() > 0.55) return
      const pick = POOL[Math.floor(Math.random() * POOL.length)]
      this.onComment({
        id: `sim-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        sessionId: '',
        author: pick.author,
        authorId: `sim-${pick.author}`,
        content: pick.content,
        kind: 'comment',
        ts: Date.now(),
        intent: null
      })
    }, 2500)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }
}

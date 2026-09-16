/**
 * 统一的错误信息提取：兼容 Error、obs-websocket-js 的 OBSWebSocketError、
 * 以及裸对象 reject，避免 [object Object] 出现在用户可见文案里。
 */
export function extractMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object') {
    const obj = err as Record<string, unknown>
    if (typeof obj.message === 'string' && obj.message) return obj.message
    if (typeof obj.code === 'number' || typeof obj.code === 'string') {
      return `错误码 ${obj.code}`
    }
    try {
      return JSON.stringify(err)
    } catch {
      /* fallthrough */
    }
  }
  return String(err)
}

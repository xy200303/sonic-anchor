/** 渲染进程日志（转发到 console，后续可接 electron-log） */
export const log = {
  info: (...args: unknown[]) => console.info('[renderer]', ...args),
  warn: (...args: unknown[]) => console.warn('[renderer]', ...args),
  error: (...args: unknown[]) => console.error('[renderer]', ...args)
}

import { BrowserWindow } from 'electron'

/** 向所有窗口推送事件（主进程是状态源，UI 只订阅） */
export function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload)
  }
}

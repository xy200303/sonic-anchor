import { app, BrowserWindow, dialog, net, protocol, shell } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { registerIpcHandlers } from './ipc'
import { audioCacheDir } from './modules/tts/volcanoClient'
import { seedVoicePresets } from './modules/store/db'
import { log } from './logger'

// 进程级防线：未捕获异常记日志 + 友好化弹窗（去重防抖，绝不弹英文堆栈）
const reportedErrors = new Map<string, number>()

function friendlyErrorDialog(source: string, err: unknown): void {
  log.error(`${source}:`, err)
  const raw = err instanceof Error ? err.message : String(err)

  const lastAt = reportedErrors.get(raw) ?? 0
  if (Date.now() - lastAt < 30_000) return
  reportedErrors.set(raw, Date.now())

  const hint = /ECONNREFUSED|4455/.test(raw)
    ? '直播环境（OBS）连接失败，请确认 OBS 已启动后重试。'
    : /network|fetch|ETIMEDOUT|ECONNRESET/i.test(raw)
      ? '网络请求失败，请检查网络连接后重试。'
      : '软件会继续运行，但如果发现功能异常，建议重启软件。'

  void dialog.showMessageBox({
    type: 'error',
    title: 'AI直播助手',
    message: '程序遇到了一个问题',
    detail: `问题描述：${raw}\n\n${hint}\n\n详细日志位置：${log.transports.file.getFile().path}`,
    buttons: ['我知道了'],
    noLink: true
  })
}

process.on('uncaughtException', (err) => {
  friendlyErrorDialog('uncaughtException', err)
})
process.on('unhandledRejection', (reason) => {
  friendlyErrorDialog('unhandledRejection', reason)
})

// 自定义媒体协议：渲染进程经 WebAudio 播放 audio-cache 内的 mp3
// （dev 环境页面是 http://，无法直接引用 file:// 资源）
protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } }
])

app.whenReady().then(() => {
  protocol.handle('media', (request) => {
    const pathname = decodeURIComponent(new URL(request.url).pathname)
    // media://local/<绝对路径> 服务任意本地文件（素材视频/图片）
    if (pathname.startsWith('/local/')) {
      return net.fetch(pathToFileURL(pathname.slice('/local/'.length)).toString())
    }
    // media:///<文件名> 服务音频缓存目录
    return net.fetch(pathToFileURL(join(audioCacheDir(), pathname.replace(/^\//, ''))).toString())
  })
})

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  void app.whenReady().then(() => {
    registerIpcHandlers()
    seedVoicePresets()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1280,
    minHeight: 800,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#141311',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  win.on('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  log.info('主窗口已创建')
}

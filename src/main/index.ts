import { app, BrowserWindow, dialog } from 'electron'
import { type BackendHandle, startBackend, stopBackend, waitForBackend } from './backend'
import { findAvailablePort } from './port'
import { createTray } from './tray'
import { guardMinimumVersion, installUpdater } from './updater'
import { createMainWindow } from './window'

const PREFERRED_PORT = 3080

let mainWindow: BrowserWindow | null = null
let backend: BackendHandle | null = null
let splashWindow: BrowserWindow | null = null
let isQuitting = false

app.whenReady().then(() => {
  void launch()
})

async function launch(): Promise<void> {
  try {
    splashWindow = createSplashWindow()

    // 强制更新门：低于最低支持版本时不启动后端与主界面。
    // 策略拉取失败会立即放行，所以正常网络下这一步几乎不增加启动耗时。
    const allowed = await guardMinimumVersion()
    if (!allowed) {
      splashWindow?.close()
      splashWindow = null
      return
    }

    const port = await findAvailablePort(PREFERRED_PORT)
    backend = startBackend(port)
    await waitForBackend(backend)

    splashWindow?.close()
    splashWindow = null

    mainWindow = createMainWindow(backend.url, () => !isQuitting)
    mainWindow.on('closed', () => {
      mainWindow = null
    })

    // 普通更新检查：延迟执行、失败静默，不阻塞启动。
    installUpdater()

    createTray(port, {
      show: () => {
        if (mainWindow === null || mainWindow.isDestroyed()) {
          if (backend !== null) {
            mainWindow = createMainWindow(backend.url, () => !isQuitting)
            mainWindow.on('closed', () => {
              mainWindow = null
            })
          }
          return
        }

        mainWindow.show()
        mainWindow.focus()
      },
      quit: () => quitApp(),
    })
  } catch (error) {
    splashWindow?.close()
    splashWindow = null

    const message = error instanceof Error ? error.message : String(error)
    dialog.showErrorBox('DeepSeek Harness Desktop startup failed', message)
    quitApp()
  }
}

function createSplashWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 360,
    height: 180,
    frame: false,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    center: true,
    backgroundColor: '#111827',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  const html = [
    '<!doctype html>',
    '<html>',
    '<head><meta charset="utf-8"><title>DeepSeek Harness Desktop</title></head>',
    '<body style="margin:0;background:#111827;color:#e5e7eb;font-family:Segoe UI,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;">',
    '<div style="text-align:center;">',
    '<div style="font-size:20px;font-weight:600;margin-bottom:10px;">DeepSeek Harness Desktop</div>',
    '<div style="font-size:13px;color:#9ca3af;">正在初始化，请稍候...</div>',
    '</div>',
    '</body>',
    '</html>',
  ].join('')

  void window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  return window
}

function quitApp(): void {
  isQuitting = true
  stopBackend(backend)
  backend = null
  app.quit()
}

app.on('window-all-closed', () => {
  // Keep running in the system tray; quit only from the tray menu.
})

app.on('activate', () => {
  if (mainWindow === null || mainWindow.isDestroyed()) {
    if (backend !== null) {
      mainWindow = createMainWindow(backend.url, () => !isQuitting)
      mainWindow.on('closed', () => {
        mainWindow = null
      })
    }
    return
  }

  mainWindow.show()
})

app.on('before-quit', () => {
  isQuitting = true
  stopBackend(backend)
  backend = null
})

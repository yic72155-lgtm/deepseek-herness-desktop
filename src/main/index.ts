import { app, BrowserWindow, dialog } from 'electron'
import { type BackendHandle, startBackend, stopBackend, waitForBackend } from './backend'
import { findAvailablePort } from './port'
import { createTray } from './tray'
import { setupAutoUpdater } from './updater'
import { createMainWindow } from './window'

const PREFERRED_PORT = 3080

let mainWindow: BrowserWindow | null = null
let backend: BackendHandle | null = null
let isQuitting = false

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow === null || mainWindow.isDestroyed()) {
      if (backend !== null) {
        mainWindow = createMainWindow(backend.url, () => !isQuitting)
        mainWindow.on('closed', () => {
          mainWindow = null
        })
      }
      return
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    }
    mainWindow.show()
    mainWindow.focus()
  })

  app.whenReady().then(() => {
    setupAutoUpdater()
    void launch()
  })
}

async function launch(): Promise<void> {
  try {
    const port = await findAvailablePort(PREFERRED_PORT)
    backend = startBackend(port)
    await waitForBackend(backend)

    mainWindow = createMainWindow(backend.url, () => !isQuitting)
    mainWindow.on('closed', () => {
      mainWindow = null
    })

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
    const message = error instanceof Error ? error.message : String(error)
    dialog.showErrorBox('DeepSeek Harness Desktop 启动失败', message)
    quitApp()
  }
}

function quitApp(): void {
  isQuitting = true
  stopBackend(backend)
  backend = null
  app.quit()
}

app.on('window-all-closed', () => {
  // 保持托盘常驻；只有用户从托盘退出时才真正结束进程。
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

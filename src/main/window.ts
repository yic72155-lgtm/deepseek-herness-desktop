import { BrowserWindow } from 'electron'

export function createMainWindow(url: string, closeToTray: () => boolean): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    title: 'DeepSeek Harness Desktop',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  window.loadURL(url)

  window.once('ready-to-show', () => {
    window.show()
  })

  window.on('close', (event) => {
    if (closeToTray()) {
      event.preventDefault()
      window.hide()
    }
  })

  return window
}

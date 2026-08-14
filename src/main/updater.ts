import { app } from 'electron'
import { autoUpdater } from 'electron-updater'

export function setupAutoUpdater(): void {
  if (!app.isPackaged) {
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('error', (error) => {
    console.error('[auto-updater]', error)
  })

  autoUpdater.checkForUpdatesAndNotify().catch((error) => {
    console.error('[auto-updater] check failed:', error)
  })
}

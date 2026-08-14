import { Menu, Tray } from 'electron'
import { createAppIcon } from './icon'

export interface TrayActions {
  show: () => void
  quit: () => void
}

export function createTray(port: number, actions: TrayActions): Tray {
  const tray = new Tray(createAppIcon())
  tray.setToolTip(`DeepSeek Harness Desktop - port ${port}`)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: `Show main window (port ${port})`,
      click: actions.show,
    },
    {
      type: 'separator',
    },
    {
      label: 'Quit',
      click: actions.quit,
    },
  ])

  tray.setContextMenu(contextMenu)
  tray.on('click', actions.show)

  return tray
}

import { Menu, nativeImage, Tray } from 'electron'

function createPlaceholderIcon(): Electron.NativeImage {
  const size = 16
  const buffer = Buffer.alloc(size * size * 4)

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4
      const isCenter = x >= 3 && x <= 12 && y >= 3 && y <= 12
      const isBorder = !isCenter && (x >= 1 && x <= 14 && y >= 1 && y <= 14)

      if (isCenter) {
        buffer[offset] = 190
        buffer[offset + 1] = 120
        buffer[offset + 2] = 40
        buffer[offset + 3] = 255
      } else if (isBorder) {
        buffer[offset] = 250
        buffer[offset + 1] = 225
        buffer[offset + 2] = 160
        buffer[offset + 3] = 255
      } else {
        buffer[offset + 3] = 0
      }
    }
  }

  return nativeImage.createFromBitmap(buffer, { width: size, height: size })
}

export interface TrayActions {
  show: () => void
  quit: () => void
}

export function createTray(port: number, actions: TrayActions): Tray {
  const tray = new Tray(createPlaceholderIcon())
  tray.setToolTip(`DeepSeek Harness Desktop - 端口 ${port}`)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: `显示主窗口（端口 ${port}）`,
      click: actions.show,
    },
    {
      type: 'separator',
    },
    {
      label: '退出',
      click: actions.quit,
    },
  ])

  tray.setContextMenu(contextMenu)
  tray.on('click', actions.show)

  return tray
}

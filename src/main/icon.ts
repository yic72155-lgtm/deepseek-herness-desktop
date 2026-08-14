import { app, nativeImage } from 'electron'
import path from 'node:path'

export function resolveAppIconPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(app.getAppPath(), 'build', 'icon.png')
}

export function createAppIcon(): Electron.NativeImage {
  const icon = nativeImage.createFromPath(resolveAppIconPath())
  return icon.isEmpty() ? createPlaceholderIcon() : icon
}

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

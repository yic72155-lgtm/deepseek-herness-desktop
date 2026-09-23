import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import asar from '@electron/asar'

export interface BackendHandle {
  child: ReturnType<typeof spawn>
  port: number
  url: string
}

/**
 * 逐文件解压，读不到的条目跳过。
 *
 * 注意路径格式：listPackage 在 Windows 上返回带前导反斜杠的路径（`\node_modules\x`），
 * 而 extractFile 只接受去掉前导分隔符、且**保留原始分隔符**的形式
 * （转成正斜杠反而会找不到）。这些都是实测出来的。
 */
function extractIndividually(archive: string, destination: string): number {
  const entries = asar.listPackage(archive, { isPack: false })
  let unreadable = 0

  for (const entry of entries) {
    const relative = entry.replace(/^[\\/]+/u, '')
    if (relative === '') continue

    try {
      const content = asar.extractFile(archive, relative)
      const target = path.join(destination, relative)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, content)
    } catch {
      // 目录条目、以及本平台用不到的架构二进制都会走到这里。
      unreadable += 1
    }
  }

  return unreadable
}

/**
 * 解压 app.asar 到目标目录。
 *
 * 先走 extractAll（一次性、快）；但它遇到任何一个缺失的 unpacked 文件都会整体抛错，
 * 而 electron-builder 会剔除与目标架构不匹配的原生二进制
 * （实测：CI 的 win-x64 构建缺少 node-pty 的 win32-arm64 / win10-arm64 共 6 个文件，
 * 导致应用在解压阶段就崩掉、完全无法启动）。
 * 因此失败时回退到逐文件解压并跳过读不到的条目 —— 那些文件在本平台永远用不到。
 *
 * @returns 跳过的条目数，用于日志。
 */
function extractRuntime(archive: string, destination: string): number {
  try {
    asar.extractAll(archive, destination)
    return 0
  } catch {
    return extractIndividually(archive, destination)
  }
}

function resolveBackendRoot(): string {
  if (app.isPackaged) {
    const runtimeRoot = path.join(app.getPath('userData'), 'runtime')
    const extractedApp = path.join(runtimeRoot, 'app')
    const versionFile = path.join(runtimeRoot, 'version')
    const version = app.getVersion()
    const dshPackage = path.join(extractedApp, 'node_modules', '@deepseek-ai', 'dsh', 'package.json')

    if (!fs.existsSync(dshPackage) || !fs.existsSync(versionFile) || fs.readFileSync(versionFile, 'utf8') !== version) {
      fs.rmSync(runtimeRoot, { recursive: true, force: true })
      fs.mkdirSync(extractedApp, { recursive: true })

      const skipped = extractRuntime(app.getAppPath(), extractedApp)
      if (skipped > 0) {
        console.warn(`[shell] runtime extraction fell back to per-file mode, skipped ${skipped} unreadable entries`)
      }

      fs.writeFileSync(versionFile, version)
    }

    return path.dirname(dshPackage)
  }

  return path.dirname(require.resolve('@deepseek-ai/dsh/package.json'))
}

function resolveBackendBin(root: string): string {
  return path.join(root, 'lib', 'bin.js')
}

function resolveBackendCwd(root: string): string {
  return app.isPackaged ? root : process.cwd()
}

export function startBackend(port: number): BackendHandle {
  const root = resolveBackendRoot()
  const bin = resolveBackendBin(root)

  if (!fs.existsSync(bin)) {
    throw new Error(`dsh startup file not found: ${bin}`)
  }

  const child = spawn(
    process.execPath,
    ['--expose-internals', bin, 'web', '--host', '127.0.0.1', '--port', String(port)],
    {
      cwd: resolveBackendCwd(root),
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  )

  child.stdout?.on('data', (chunk: Buffer) => {
    process.stdout.write(`[dsh:${port}] ${chunk.toString()}`)
  })

  child.stderr?.on('data', (chunk: Buffer) => {
    process.stderr.write(`[dsh:${port}] ${chunk.toString()}`)
  })

  return {
    child,
    port,
    url: `http://127.0.0.1:${port}`,
  }
}

export async function waitForBackend(handle: BackendHandle, timeoutMs = 60000): Promise<void> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (handle.child.exitCode !== null) {
      throw new Error(`dsh process exited early, code: ${handle.child.exitCode}`)
    }

    try {
      await fetch(handle.url)
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }

  throw new Error('timed out waiting for dsh service')
}

export function stopBackend(handle: BackendHandle | null): void {
  if (handle === null) {
    return
  }

  if (handle.child.exitCode === null) {
    handle.child.kill()
  }
}

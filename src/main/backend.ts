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
      asar.extractAll(app.getAppPath(), extractedApp)
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

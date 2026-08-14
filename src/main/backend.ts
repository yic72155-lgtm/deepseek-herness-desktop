import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

export interface BackendHandle {
  child: ReturnType<typeof spawn>
  port: number
  url: string
}

function resolveBackendRoot(): string {
  return path.dirname(require.resolve('@deepseek-ai/dsh/package.json'))
}

function resolveBackendBin(root: string): string {
  return path.join(root, 'lib', 'bin.js')
}

export function startBackend(port: number): BackendHandle {
  const root = resolveBackendRoot()
  const bin = resolveBackendBin(root)

  if (!fs.existsSync(bin)) {
    throw new Error(`找不到 dsh 启动文件：${bin}`)
  }

  const child = spawn(
    process.execPath,
    ['--expose-internals', bin, 'web', '--host', '127.0.0.1', '--port', String(port)],
    {
      cwd: root,
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
      throw new Error(`dsh 进程提前退出，退出码：${handle.child.exitCode}`)
    }

    try {
      await fetch(handle.url)
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }

  throw new Error('等待 dsh 服务启动超时')
}

export function stopBackend(handle: BackendHandle | null): void {
  if (handle === null) {
    return
  }

  if (handle.child.exitCode === null) {
    handle.child.kill()
  }
}

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import asar from '@electron/asar'

/** 后端只监听回环地址；`--host 0.0.0.0` 会被 dsh 以安全理由直接拒绝。 */
const HOST = '127.0.0.1'

/** 等不到 URL 行时，退回到 HTTP 探测的等待时长。 */
const LEGACY_FALLBACK_MS = 10000

/** 行缓冲上限：后端若长时间不换行，不能让缓冲无限增长。 */
const MAX_PENDING_CHARS = 65536

export interface BackendHandle {
  child: ReturnType<typeof spawn>
  port: number
  /** 不带凭据的地址。认证门开启时直接打开它只会看到 401 提示页。 */
  url: string
  /**
   * 后端打印的、带一次性启动令牌的地址；尚未打印时为 null。
   *
   * 令牌是**每次启动随机生成的进程令牌**（`browser-auth.ts` 里由 WeakMap 持有，
   * 不落盘），所以只能运行时抓取。它等同于本地 GUI 的完整访问权，
   * 因此只存在于内存：绝不写日志、不写崩溃报告、不进浏览器历史。
   */
  authUrl: string | null
}

/**
 * 后端就绪行，形如：
 *
 *     dsh web: http://127.0.0.1:3082/?token=<43 字符> (LAN: http://... )
 *
 * 官方把这个 URL 行定义为**就绪信号**（"supervisors RPC as soon as they observe
 * the line"）：它在 web 服务器 bind 之后、Loader 树稳定之后才打印。
 * 所以这里等它即可，不必轮询 HTTP —— 轮询在没有 cookie 时只会撞上认证门的 401，
 * 无法区分"服务已就绪"和"服务已就绪但要凭据"。
 */
const READY_LINE = /dsh web:\s+(https?:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+)/u

/**
 * 令牌脱敏。
 *
 * 用 `*` 而不是 `+` 是有意的：这样连被分块切断、只写出 `token=` 半截的情况
 * 也会被替换掉，不会漏出令牌前缀。
 */
const REDACT_TOKEN = /token=[A-Za-z0-9_-]*/gu

/**
 * 把后端输出回显给宿主控制台（令牌已脱敏）。
 *
 * 打包后的 Windows GUI 进程往往没有有效的 stdout；用户若从控制台启动、
 * 随后又关掉那个控制台，写入会以 EPIPE 失败。这里必须吞掉错误：
 * 一个只负责打日志的写失败，绝不能把整个启动过程带崩。
 */
function echoLine(port: number, line: string): void {
  try {
    process.stdout.write(`[dsh:${port}] ${line.replace(REDACT_TOKEN, 'token=***')}\n`)
  } catch {
    // 日志不是关键路径，丢弃即可。
  }
}

/** stdout 的异步错误（EPIPE 等）同样不能变成未捕获异常。只需挂一次。 */
process.stdout.on('error', () => {
  // 忽略：见 echoLine。
})

/**
 * 行缓冲扫描器。
 *
 * 令牌可能被 stdout 分块切断，逐块做正则替换会漏掉跨块的那一段，
 * 所以先按行聚合再处理。
 */
function createLineScanner(onLine: (line: string) => void): (chunk: Buffer) => void {
  let pending = ''

  return (chunk: Buffer) => {
    pending += chunk.toString()
    const lines = pending.split(/\r\n|\r|\n/u)
    pending = lines.pop() ?? ''

    for (const line of lines) {
      onLine(line)
    }

    if (pending.length > MAX_PENDING_CHARS) {
      onLine(pending)
      pending = ''
    }
  }
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

/**
 * 桌面版使用**独占的**数据目录，不与 CLI 的 `~/.dsh` 共用。
 *
 * 两者内嵌的 dsh 版本不同，而 `~/.dsh` 下的凭据格式、`profiles` 模块落点、
 * 会话日志格式都只对应某一个版本 —— 实测旧版 dsh 读新版写出的
 * `.credentials.yaml` 时（`version` 是数字而非字符串）直接抛错、进程 exit 1，
 * 桌面端表现为 "dsh process exited early, code: 1"。
 *
 * 隔离之后，桌面版的启动不再受用户 CLI 环境影响（代价是首次要单独配置一次模型凭据）。
 */
function resolveDshHomeEnv(): Record<string, string> {
  if (!app.isPackaged) {
    return process.env.DSH_HOME === undefined ? {} : { DSH_HOME: process.env.DSH_HOME }
  }

  return { DSH_HOME: path.join(app.getPath('userData'), 'dsh-home') }
}

export function startBackend(port: number): BackendHandle {
  const root = resolveBackendRoot()
  const bin = resolveBackendBin(root)

  if (!fs.existsSync(bin)) {
    throw new Error(`dsh startup file not found: ${bin}`)
  }

  const child = spawn(
    process.execPath,
    [
      '--expose-internals',
      bin,
      'web',
      '--host',
      HOST,
      '--port',
      String(port),
      // 不加这个，dsh 会在启动后调用系统默认浏览器打开 GUI：
      // 用户会看到两个界面，而且带令牌的地址会被写进浏览器历史。
      '--no-open',
    ],
    {
      cwd: resolveBackendCwd(root),
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        ...resolveDshHomeEnv(),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  )

  const handle: BackendHandle = {
    child,
    port,
    url: `http://${HOST}:${port}`,
    authUrl: null,
  }

  const consume = createLineScanner((line) => {
    const matched = READY_LINE.exec(line)
    if (matched !== null && handle.authUrl === null) {
      handle.authUrl = matched[1]
    }
    echoLine(port, line)
  })

  child.stdout?.on('data', consume)
  child.stderr?.on('data', consume)

  return handle
}

/**
 * 当前应该让窗口打开的地址。
 * 拿不到令牌时退回无凭据地址（旧版后端没有认证门，这样仍然可用）。
 */
export function backendUrl(handle: BackendHandle): string {
  return handle.authUrl ?? handle.url
}

export async function waitForBackend(handle: BackendHandle, timeoutMs = 60000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  const fallbackAt = Math.min(Date.now() + LEGACY_FALLBACK_MS, deadline)

  while (Date.now() < deadline) {
    if (handle.child.exitCode !== null) {
      throw new Error(`dsh process exited early, code: ${handle.child.exitCode}`)
    }

    if (handle.authUrl !== null) {
      return
    }

    // 兜底：万一后端不打印 URL 行（更旧的版本、或该行被改过），
    // 退回到原来的 HTTP 探测，避免直接启动失败。
    if (Date.now() >= fallbackAt) {
      try {
        await fetch(handle.url)
        // 再给很短一段时间收令牌，之后无论有没有都放行。
        await new Promise((resolve) => setTimeout(resolve, 500))
        return
      } catch {
        // 还没起来，继续等。
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 100))
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

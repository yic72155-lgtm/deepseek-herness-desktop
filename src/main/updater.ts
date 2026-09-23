import { app, dialog } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
// 注意：electron-updater 是 TS 编译出的 CJS，带 __esModule 但没有 default 导出，
// 所以必须用命名导入。写成 default import 会在主进程加载期直接崩（已踩过）。
import { autoUpdater } from 'electron-updater'
import semver from 'semver'

/** 启动时等待策略文件的上限；超时即放行，宁可漏一次强制，也不能让软件打不开。 */
const POLICY_TIMEOUT_MS = 3000
/** 普通更新检查的延迟，避免和启动抢资源。 */
const CHECK_DELAY_MS = 8000

interface UpdatePolicy {
  minimumVersion?: string
  latestVersion?: string
  notes?: string
}

/**
 * 从打包时生成的 `resources/app-update.yml` 读取更新源地址。
 * 该文件由 electron-builder 依据 electron-builder.yml 的 publish 段写入，
 * 所以地址只有一处定义，不需要在这里重复维护。
 */
function resolveUpdateBase(): string | null {
  if (!app.isPackaged) return null
  try {
    const text = readFileSync(join(process.resourcesPath, 'app-update.yml'), 'utf8')
    const matched = /^url:\s*(\S+)\s*$/mu.exec(text)
    if (matched === null) return null
    return `${matched[1].replace(/\/+$/u, '')}/`
  } catch {
    return null
  }
}

/** 拉取强制更新策略。任何失败（断网、超时、404、JSON 损坏）都返回 null。 */
async function fetchPolicy(base: string): Promise<UpdatePolicy | null> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), POLICY_TIMEOUT_MS)
    try {
      const response = await fetch(`${base}policy.json`, {
        signal: controller.signal,
        cache: 'no-store',
      })
      if (!response.ok) return null
      return (await response.json()) as UpdatePolicy
    } finally {
      clearTimeout(timer)
    }
  } catch {
    return null
  }
}

function belowMinimum(policy: UpdatePolicy | null): policy is UpdatePolicy & { minimumVersion: string } {
  const minimum = policy?.minimumVersion
  if (typeof minimum !== 'string') return false
  const current = app.getVersion()
  if (semver.valid(current) === null || semver.valid(minimum) === null) return false
  return semver.lt(current, minimum)
}

/**
 * 强制更新：只给「立即更新 / 退出」两条路。
 * 调用方在此返回 false 后必须放弃创建后端与主界面 —— 这才是真正的强制。
 */
async function runMandatoryUpdate(policy: UpdatePolicy & { minimumVersion: string }): Promise<void> {
  const notes = typeof policy.notes === 'string' && policy.notes.length > 0 ? `\n\n${policy.notes}` : ''
  const choice = dialog.showMessageBoxSync({
    type: 'warning',
    noLink: true,
    title: '需要更新',
    message: `当前版本 ${app.getVersion()} 已停止支持`,
    detail: `最低要求版本：${policy.minimumVersion}${notes}`,
    buttons: ['立即更新', '退出'],
    defaultId: 0,
    cancelId: 1,
  })

  if (choice !== 0) {
    app.quit()
    return
  }

  try {
    autoUpdater.autoDownload = true
    const result = await autoUpdater.checkForUpdates()
    if (result === null) throw new Error('更新服务器没有返回可用版本')
    await result.downloadPromise
    autoUpdater.quitAndInstall(false, true)
  } catch (error) {
    dialog.showErrorBox('更新失败', error instanceof Error ? error.message : String(error))
    app.quit()
  }
}

/**
 * 启动门：返回 true 表示可以继续启动；false 表示已进入强制更新流程。
 * 开发态、未配置更新源、策略拉取失败，一律放行。
 */
export async function guardMinimumVersion(): Promise<boolean> {
  const base = resolveUpdateBase()
  if (base === null) return true

  const policy = await fetchPolicy(base)
  if (!belowMinimum(policy)) return true

  await runMandatoryUpdate(policy)
  return false
}

/** 普通更新：后台下载，退出时装；任何异常都静默，不打扰用户。 */
export function installUpdater(): void {
  if (resolveUpdateBase() === null) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('error', () => {
    // 网络不可用、服务器 404 等一律忽略：自动更新失败不该影响正常使用。
  })

  setTimeout(() => {
    void autoUpdater.checkForUpdatesAndNotify().catch(() => undefined)
  }, CHECK_DELAY_MS)
}

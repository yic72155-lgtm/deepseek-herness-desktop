#!/usr/bin/env node
/**
 * 校验打包产物里的运行时依赖是否完整。
 *
 * 为什么需要这个脚本（真实事故）：
 *
 * electron-builder **只收集 `dependencies`，不收集 `peerDependencies`**。
 * 而 dsh 把大量「接缝 / 协议」包（`dsh-jobs`、`dsh-session-persistence`、
 * `dsh-client-ui-slots` …）声明成 peerDependencies —— npm 会自动装上，
 * 所以**开发态一切正常**；但打包时它们被静默丢掉。
 *
 * 实测后果：0.2.0 首次打包后应用能启动到解压完成，随后 dsh 直接失败：
 *
 *     dsh: startup failed: 1 required plugin did not activate
 *     Failed plugins (14): jobs / deepseek-account / llm-pi-ai / ...
 *     ERR_MODULE_NOT_FOUND: Cannot find package '@deepseek-ai/dsh-jobs'
 *
 * 这类失败只在「装完启动」时才暴露，代价极高。所以把它变成构建期检查：
 *
 *   1) 静态检查：按 peer 闭包算出运行时真正需要的包，逐个确认已在
 *      package.json 的 dependencies 里直接声明（否则打包一定会丢）。
 *   2) 产物检查：直接读 app.asar 与 app.asar.unpacked，确认包真的在里面。
 *
 * 用法：
 *   node scripts/verify-runtime-packages.mjs            # 打包后校验产物
 *   node scripts/verify-runtime-packages.mjs --static   # 只做静态检查（无需先打包）
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import asar from '@electron/asar'

const STATIC_ONLY = process.argv.includes('--static')
const MODULE_ROOT = resolve('node_modules', '@deepseek-ai')
const ASAR_PATH = resolve('release', 'win-unpacked', 'resources', 'app.asar')
const UNPACKED_ROOT = resolve('release', 'win-unpacked', 'resources', 'app.asar.unpacked')

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const declared = new Set(Object.keys(pkg.dependencies ?? {}))

/** 直接声明的 @deepseek-ai 包，作为可达性分析的起点。 */
const roots = [...declared]
  .filter((name) => name.startsWith('@deepseek-ai/'))
  .map((name) => name.slice('@deepseek-ai/'.length))

function readMeta(name) {
  const file = join(MODULE_ROOT, name, 'package.json')
  if (!existsSync(file)) return null
  return JSON.parse(readFileSync(file, 'utf8'))
}

const meta = new Map()
for (const entry of readdirSync(MODULE_ROOT, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const parsed = readMeta(entry.name)
  if (parsed !== null) meta.set(entry.name, parsed)
}

/** 取某个包声明的 @deepseek-ai 依赖名。 */
function namesFrom(manifest, field) {
  const source = manifest[field] ?? {}
  return Object.keys(source)
    .filter((name) => name.startsWith('@deepseek-ai/'))
    .map((name) => name.slice('@deepseek-ai/'.length))
    .filter((name) => meta.has(name))
}

function closure(fields) {
  const seen = new Set()
  const queue = [...roots]
  while (queue.length > 0) {
    const name = queue.pop()
    if (seen.has(name) || !meta.has(name)) continue
    seen.add(name)
    for (const field of fields) {
      for (const next of namesFrom(meta.get(name), field)) {
        if (!seen.has(next)) queue.push(next)
      }
    }
  }
  return seen
}

// ---- 检查 1：静态（哪些包必须直接声明） ----
const needed = closure(['dependencies', 'peerDependencies'])
const packaged = closure(['dependencies'])
const mustDeclare = [...needed].filter((name) => !packaged.has(name)).sort()

let failed = false

console.log(`@deepseek-ai 包总数（本机 node_modules）: ${meta.size}`)
console.log(`运行时按 peer 闭包需要          : ${needed.size}`)
console.log(`仅靠 dependencies 能被打包的    : ${packaged.size}`)
console.log('')

if (mustDeclare.length > 0) {
  failed = true
  console.log(`✗ 有 ${mustDeclare.length} 个包只能经 peerDependencies 到达，必须在 package.json 里直接声明：`)
  for (const name of mustDeclare) {
    console.log(`    "@deepseek-ai/${name}": "${pkg.version === undefined ? '' : ''}${readMeta(name)?.version ?? '?'}",`)
  }
  console.log('')
  console.log('  （否则 electron-builder 不会收集它们，应用启动时会报 ERR_MODULE_NOT_FOUND）')
  console.log('')
} else {
  console.log('✓ 静态检查：peer 闭包内的包都已在 dependencies 里直接声明')
}

if (STATIC_ONLY) {
  process.exit(failed ? 1 : 0)
}

// ---- 检查 2：产物（包是否真的进了 asar） ----
if (!existsSync(ASAR_PATH)) {
  console.error(`✗ 找不到打包产物：${ASAR_PATH}`)
  console.error('  请先执行 npm run pack。')
  process.exit(1)
}

const present = new Set()

for (const entry of asar.listPackage(ASAR_PATH, { isPack: false })) {
  const matched = /[\\/]node_modules[\\/]@deepseek-ai[\\/]([^\\/]+)[\\/]/u.exec(entry)
  if (matched !== null) present.add(matched[1])
}

// 带原生二进制的包不在 asar 里，而在 app.asar.unpacked。
const unpackedModules = join(UNPACKED_ROOT, 'node_modules', '@deepseek-ai')
if (existsSync(unpackedModules)) {
  for (const entry of readdirSync(unpackedModules, { withFileTypes: true })) {
    if (entry.isDirectory()) present.add(entry.name)
  }
}

const missing = [...needed].filter((name) => !present.has(name)).sort()

console.log(`产物中实际存在                  : ${present.size}`)
console.log('')

if (missing.length > 0) {
  failed = true
  console.log(`✗ 有 ${missing.length} 个运行时需要的包不在打包产物里：`)
  for (const name of missing) console.log(`    @deepseek-ai/${name}`)
  console.log('')
} else {
  console.log('✓ 产物检查：运行时需要的包全部已打进 app.asar')
}

process.exit(failed ? 1 : 0)

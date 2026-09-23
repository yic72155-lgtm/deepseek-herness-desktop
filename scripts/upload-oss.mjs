#!/usr/bin/env node
/**
 * 把更新产物上传到 OSS（阿里云对象存储）。
 *
 * 上传顺序是关键：先传安装包与 blockmap，再传 policy.json，最后才传 latest.yml。
 * 客户端一旦读到 latest.yml 就会立刻去下载 exe；如果清单先到而安装包还没到，
 * 这个窗口期内的用户会拿到 404。
 *
 * 用法：
 *   node scripts/upload-oss.mjs             实际上传
 *   node scripts/upload-oss.mjs --dry-run   只打印将要上传的内容（本地自检用）
 *
 * 需要的环境变量：OSS_ACCESS_KEY_ID、OSS_ACCESS_KEY_SECRET
 * 可选：OSS_REGION（默认 oss-cn-beijing）、OSS_BUCKET（默认 deepseek-harness-upgrade）、OSS_PREFIX（默认 win）
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, extname, resolve } from 'node:path'
import OSS from 'ali-oss'

const DRY_RUN = process.argv.includes('--dry-run')

const REGION = process.env.OSS_REGION ?? 'oss-cn-beijing'
const BUCKET = process.env.OSS_BUCKET ?? 'deepseek-harness-upgrade'
const PREFIX = (process.env.OSS_PREFIX ?? 'win').replace(/^\/+|\/+$/gu, '')

/** 清单类文件不能长缓存，否则客户端长时间看不到新版本。 */
const NO_CACHE = 'no-cache, no-store, must-revalidate'
/** 带版本号的文件名不可变，可以长缓存。 */
const LONG_CACHE = 'public, max-age=31536000, immutable'

function contentTypeOf(name) {
  const ext = extname(name).toLowerCase()
  if (ext === '.yml' || ext === '.yaml') return 'text/yaml; charset=utf-8'
  if (ext === '.json') return 'application/json; charset=utf-8'
  if (ext === '.blockmap') return 'application/json; charset=utf-8'
  return 'application/octet-stream'
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const version = pkg.version

// policy.json 的 latestVersion 跟随本次发版自动更新；
// minimumVersion（强制更新线）保持仓库里的人工设置，脚本不擅自改动。
const policyPath = resolve('policy.json')
const policy = existsSync(policyPath) ? JSON.parse(readFileSync(policyPath, 'utf8')) : {}
policy.latestVersion = version
if (typeof policy.minimumVersion !== 'string' || policy.minimumVersion.length === 0) {
  policy.minimumVersion = version
}
policy.publishedAt = new Date().toISOString()
const policyBody = Buffer.from(`${JSON.stringify(policy, null, 2)}\n`, 'utf8')

const setup = resolve('release', `DeepSeek-Harness-Desktop-Setup-${version}.exe`)
const blockmap = `${setup}.blockmap`
const manifest = resolve('release', 'latest.yml')

/** 顺序即上传顺序：安装包 → 差分块 → 策略 → 清单（最后）。 */
const plan = [
  { key: `${PREFIX}/${basename(setup)}`, file: setup, cache: LONG_CACHE },
  { key: `${PREFIX}/${basename(blockmap)}`, file: blockmap, cache: LONG_CACHE },
  { key: `${PREFIX}/policy.json`, body: policyBody, cache: NO_CACHE },
  { key: `${PREFIX}/latest.yml`, file: manifest, cache: NO_CACHE },
]

const missing = plan.filter((item) => item.file !== undefined && !existsSync(item.file))
if (missing.length > 0) {
  console.error('缺少产物，请先执行 npm run pack：')
  for (const item of missing) console.error(`  - ${item.file}`)
  process.exit(1)
}

console.log(`目标：oss://${BUCKET}/${PREFIX}/  版本 ${version}`)
for (const item of plan) {
  const size = item.file === undefined ? `${item.body.length} B（生成）` : `${statSync(item.file).size} B`
  console.log(`  ${item.key}  ${size}`)
}
console.log(`  minimumVersion = ${policy.minimumVersion}（人工控制，脚本不改）`)

if (DRY_RUN) {
  console.log('\n[dry-run] 未实际上传。')
  process.exit(0)
}

const accessKeyId = process.env.OSS_ACCESS_KEY_ID
const accessKeySecret = process.env.OSS_ACCESS_KEY_SECRET
if (accessKeyId === undefined || accessKeySecret === undefined) {
  console.error('\n缺少 OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET。')
  process.exit(1)
}

const client = new OSS({ region: REGION, accessKeyId, accessKeySecret, bucket: BUCKET })

for (const item of plan) {
  const content = item.file ?? item.body
  await client.put(item.key, content, {
    headers: {
      'Content-Type': contentTypeOf(item.key),
      'Cache-Control': item.cache,
    },
  })
  console.log(`uploaded  ${item.key}`)
}

console.log(`\n完成。更新源：https://${BUCKET}.${REGION}.aliyuncs.com/${PREFIX}/`)

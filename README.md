# DeepSeek Harness Desktop

把 [DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness) 的 Web GUI 封装成 Windows 桌面客户端：**安装包内置完整运行时**，装完即用 —— 不需要预装 Node.js、pnpm 或 dsh CLI。

**当前版本：0.2.0**（内置运行时 `0.1.7-alpha.2`）

---

## ⚠️ 从 0.1.x 升级到 0.2.0 前必读

0.2.0 把内置运行时从 `0.1.0-rc.6` 跨 19 个版本升到 `0.1.7-alpha.2`，其中有三件事会影响你：

**① 会话数据会被就地迁移，且不可逆**

新版首次启动时会自动升级会话日志格式（v2 → V4）。**升级后的会话数据旧版本读不了**，没有降级通道。

升级前请先备份数据目录：

```powershell
Copy-Item "$env:APPDATA\deepseek-harness-desktop\dsh-home" `
          "$env:APPDATA\deepseek-harness-desktop\dsh-home-backup-0.1.3" -Recurse
```

出问题时把备份目录改回 `dsh-home` 即可整体还原 —— **这是唯一可靠的退路**。

> 注意备份的是**桌面版自己的** `dsh-home`，不是命令行的 `~/.dsh`：两者从 0.1.3 起就是隔离的。

**② 模型端点必须是 Messages 兼容地址**

新版只保留 Messages API，移除了 Chat Completions 与 `protocol` 选项。DeepSeek 官方地址请用：

```
https://api.deepseek.com/anthropic
```

如果你填的是自定义/中转端点，它必须兼容 Messages 协议，否则模型调用会失败。

**③ 默认端口从 3080 改为 3082**

3080 是官方 `dsh web` 的默认端口，容易和你机器上的命令行实例撞车。新版从 **3082** 起在 3082–3181 区间内取第一个空闲端口，地址在多次启动之间更稳定。

---

## 功能

| 能力 | 说明 |
| --- | --- |
| 开箱即用 | 内置 Node 运行时与 dsh 全部依赖，无需任何环境配置 |
| 自动更新 | 启动后自动检查、后台下载、退出时安装；可按「最低支持版本」强制更新 |
| 系统托盘 | 关窗后驻留托盘，随时唤回 |
| 端口自适应 | 默认从 3082 起在 3082–3181 区间选空闲端口；可与官方 `dsh web` 并存 |
| 独立数据目录 | 数据存放在自己的目录，**不与命令行 `dsh` 的 `~/.dsh` 混用** |
| 本地认证门 | 自动完成 dsh 的一次性令牌交换，窗口直达界面；令牌不落盘、不进日志 |

## 下载

**推荐用 OSS 直链**（国内访问稳定，不走 GitHub）：

- **安装版（推荐，支持自动更新）**：
  <https://deepseek-harness-upgrade.oss-cn-beijing.aliyuncs.com/win/DeepSeek-Harness-Desktop-Setup-0.2.0.exe>
- 便携版（免安装，**不支持自动更新**）：
  <https://deepseek-harness-upgrade.oss-cn-beijing.aliyuncs.com/win/DeepSeek-Harness-Desktop-0.2.0-portable.exe>

也可以从 [Releases](https://github.com/yic72155-lgtm/deepseek-herness-desktop/releases/latest) 下载，但**GitHub 在国内网络下可能打不开或很慢**。

> **安装包体积**：0.2.0 约 **217 MB**（0.1.3 是 127 MB）。多出来的约 90 MB 是内置的 LibreOffice
> （`libreoffice-kit-win32-x64`，解压后 325 MB），用于 Office 文档转 PDF / 预览。
> 这是跟着运行时升级一起来的：官方在 0.1.6/0.1.7 把 Office 能力做成了独立套件。
> 由于自动更新走差分下载，LibreOffice 这部分以后不会变，**后续版本更新只会下载变化的部分**。

## 首次启动

首次启动会把内置运行时解压到 `%APPDATA%\deepseek-harness-desktop\runtime`，期间显示「正在初始化，请稍候...」，通常 20–40 秒。之后启动很快。

> 0.2.0 换了运行时版本，`runtime` 目录会自动重新解压一次（旧的会被整体替换）。

## 常见问题

**下载打不开 / 很慢？**
GitHub 在国内网络下常被阻断。请用上面第一条 OSS 直链，那是同一个安装包。

**为什么第一次打开要重新配置模型 / 填 API key？**
桌面版使用**独立的数据目录**（`%APPDATA%\deepseek-harness-desktop\dsh-home`），与命令行 `dsh` 的 `~/.dsh` 完全隔离，所以需要单独配置一次。

这是刻意的设计：桌面版内嵌的 dsh 版本与用户机器上的 CLI 版本往往不同，而 `~/.dsh` 下的凭据格式、`profiles` 模块落点、会话日志格式**都只对应某一个版本**。共用会直接导致启动失败（实测：旧版读新版写出的 `.credentials.yaml` 会因 `version` 字段类型不符而报错退出）。

**升级后模型不能用了 / 一直报错？**
见上面「模型端点必须是 Messages 兼容地址」，把端点改成 `https://api.deepseek.com/anthropic`。

**升级后看不到以前的会话了？**
先确认数据目录还是 `%APPDATA%\deepseek-harness-desktop\dsh-home`。若确实异常，用升级前的备份还原该目录。

**升级后想省点磁盘？**
旧版本会在 `%APPDATA%\deepseek-harness-desktop\dsh-home\profiles\node_modules` 里放一份自己物化的依赖树（约 **133 MB**）。
新版运行时不再使用它（依赖直接从程序自带目录解析），可以直接删掉：

```powershell
Remove-Item "$env:APPDATA\deepseek-harness-desktop\dsh-home\profiles\node_modules" -Recurse -Force
```

已实测：删除后应用正常启动。

**一直停在初始化 / 页面空白？**
检查 `%APPDATA%\deepseek-harness-desktop\runtime` 是否完整。删掉整个 `runtime` 目录后重启，会重新解压。

**提示「需要更新」且无法跳过？**
当前版本低于更新源声明的最低支持版本，请按提示完成更新。0.2.0 发布后 `minimumVersion` 仍维持在 `0.1.1`，因此 0.1.1 及以上用户看到的是**可跳过的普通更新提示**。

**能和官方 `dsh web` 同时运行吗？**
可以。两者数据目录与端口都相互独立，互不干扰。

## 开发

需要 Node.js 24 与 npm。

```powershell
npm install
npm run build
npm start                 # 开发运行
npm run pack              # 打包 Windows 安装版 + 便携版（输出到 release/）
npm run verify:packages   # 校验运行时依赖是否齐全（改 dsh 版本后必跑）
npm run upload:oss:dry    # 预览将要上传到更新源的文件（不会真上传）
```

### ⚠️ 运行时依赖必须显式列出，不能只靠传递依赖

`package.json` 里那一长串 `@deepseek-ai/dsh-*` 不是冗余 —— **少一个应用就起不来**。

原因：**electron-builder 只收集 `dependencies`，不收集 `peerDependencies`**。
而 dsh 把大量接缝/协议包（`dsh-jobs`、`dsh-session-persistence`、`dsh-client-ui-slots` …）
声明成 peerDependencies。npm 会自动把它们装上，所以**开发态一切正常**；但打包时会被静默丢掉，
用户装完启动才报 `ERR_MODULE_NOT_FOUND: Cannot find package '@deepseek-ai/dsh-jobs'`。

`npm run pack` 末尾会自动跑 `scripts/verify-runtime-packages.mjs`，把该补哪些包直接打出来：

```powershell
npm run verify:packages   # 静态检查，不需要先打包
```

### ⚠️ Electron 版本必须精确锁定，不能写 `^`

`package.json` 里的 `electron` 是**精确版本**（当前 `44.0.0`），这不是洁癖：

内置运行时依赖 `node-addon-require-builtin` 注入 Node 内部模块加载器，而该原生插件内置一张**精确的 V8 指纹允许列表**。指纹对不上会直接抛 `node-addon-require-builtin unsupported`，应用完全起不来。而 V8 在同一个 Electron 大版本内也会变：

| Electron | V8 | 结果 |
| --- | --- | --- |
| `43.0.0` / `43.1.0` | `15.0.245.13` | 通过 |
| `43.4.0` | `15.0.245.28` | **拒绝** |
| **`44.0.0`** | **`15.2.124.13`** | **通过** |
| `44.1.0` | `15.2.124.18` | **拒绝** |
| `44.4.4` | `15.2.124.28` | **拒绝** |

也就是说写成 `^44.0.0` 会解析到 `44.4.4` 并把应用装坏。升级 Electron 前必须先用下面这条命令确认指纹：

```powershell
$env:ELECTRON_RUN_AS_NODE='1'
.\node_modules\electron\dist\electron.exe -p "process.versions.v8"
```

允许的取值目前只有 `15.0.245.13-electron.0`、`15.2.124.13-electron.0`、`15.4.80-electron.0`。

## 发布

每次发版按 [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) 执行。其中有一条硬性要求 —— **本文件的「当前版本」与「版本历史」必须同步更新**，CI 会校验，漏了会直接失败。

`minimumVersion`（强制更新线）是**人工控制**的：`scripts/upload-oss.mjs` 只自动改写 `latestVersion`，绝不擅自改动 `minimumVersion`。

## 版本历史

| 版本 | 日期 | 变更 |
| --- | --- | --- |
| **0.2.0** | 2026-09-23 | 内置运行时 `0.1.0-rc.6` → `0.1.7-alpha.2`（跨 19 个版本）：包含两项安全修复、开放第三方插件生态、补齐工作过程展示/用量面板/Office 预览/会话归档等能力。适配一次性令牌认证门（自动换取凭据，令牌不落盘、日志脱敏；新增 `--no-open` 防弹浏览器）；`dsh-code-runtime` 更名为 `dsh-ptc-runtime`；补入 12 个只以 peerDependencies 声明的接缝包（否则打包丢失、启动即失败）；Electron 精确锁定 `44.0.0`（V8 指纹门）；默认端口 3080 → 3082–3181 区间。安装包 127 MB → 217 MB（含内置 LibreOffice） |
| 0.1.3 | 2026-09-23 | 修复：桌面版改用**独占数据目录**，不再与 CLI 的 `~/.dsh` 共用 —— 此前会因凭据格式随 dsh 版本变化而启动失败（报 `dsh process exited early, code: 1`） |
| 0.1.2 | 2026-09-23 | 修复：解压运行时遇到缺失的原生二进制不再整体失败（CI 构建会剔除与目标架构不匹配的文件，此前会导致启动报错、完全无法进入界面） |
| 0.1.1 | 2026-09-23 | 启用自动更新（强制更新门 + 自建 OSS 更新源）；CI 改为打 tag 自动构建发布。**此版本的安装包无法启动，请使用 0.2.0** |
| 0.1.0 | 2026-08-14 | 首个版本：Electron 壳 + 内置 dsh 运行时 |

## 许可

MIT

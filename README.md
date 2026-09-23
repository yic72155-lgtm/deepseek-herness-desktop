# DeepSeek Harness Desktop

把 [DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness) 的 Web GUI 封装成 Windows 桌面客户端：**安装包内置完整运行时**，装完即用 —— 不需要预装 Node.js、pnpm 或 dsh CLI。

**当前版本：0.1.3**

---

## 功能

| 能力 | 说明 |
| --- | --- |
| 开箱即用 | 内置 Node 运行时与 dsh 全部依赖，无需任何环境配置 |
| 自动更新 | 启动后自动检查、后台下载、退出时安装；可按「最低支持版本」强制更新 |
| 系统托盘 | 关窗后驻留托盘，随时唤回 |
| 端口自适应 | 默认 3080，被占用时自动切换；可与官方 `dsh web` 并存 |
| 独立数据目录 | 数据存放在自己的目录，**不与命令行 `dsh` 的 `~/.dsh` 混用** |

## 下载

从 [Releases](https://github.com/yic72155-lgtm/deepseek-herness-desktop/releases/latest) 下载：

- `DeepSeek-Harness-Desktop-Setup-<版本>.exe` —— **安装版（推荐）**，只有安装版支持自动更新
- `DeepSeek-Harness-Desktop-<版本>-portable.exe` —— 便携版，免安装，但**不支持自动更新**

## 首次启动

首次启动会把内置运行时解压到 `%APPDATA%\deepseek-harness-desktop\runtime`（约 155 MB），期间显示「正在初始化，请稍候...」，通常 20–40 秒。之后启动很快。

## 常见问题

**为什么第一次打开要重新配置模型 / 填 API key？**
桌面版使用**独立的数据目录**（`%APPDATA%\deepseek-harness-desktop\dsh-home`），与命令行 `dsh` 的 `~/.dsh` 完全隔离，所以需要单独配置一次。

这是刻意的设计：桌面版内嵌的 dsh 版本与用户机器上的 CLI 版本往往不同，而 `~/.dsh` 下的凭据格式、`profiles` 模块落点、会话日志格式**都只对应某一个版本**。共用会直接导致启动失败（实测：旧版读新版写出的 `.credentials.yaml` 会因 `version` 字段类型不符而报错退出）。

**一直停在初始化 / 页面空白？**
检查 `%APPDATA%\deepseek-harness-desktop\runtime` 是否完整。删掉整个 `runtime` 目录后重启，会重新解压。

**提示「需要更新」且无法跳过？**
当前版本低于更新源声明的最低支持版本，请按提示完成更新。

**便携版收不到更新？**
便携版没有可供替换的安装目录，请改用安装版。

**能和官方 `dsh web` 同时运行吗？**
可以。两者数据目录与端口都相互独立，互不干扰。

## 开发

需要 Node.js 24 与 npm。

```powershell
npm install
npm run build
npm start                 # 开发运行
npm run pack              # 打包 Windows 安装版 + 便携版（输出到 release/）
npm run upload:oss:dry    # 预览将要上传到更新源的文件（不会真上传）
```

## 发布

每次发版按 [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) 执行。其中有一条硬性要求 —— **本文件的「当前版本」与「版本历史」必须同步更新**，CI 会校验，漏了会直接失败。

## 版本历史

| 版本 | 日期 | 变更 |
| --- | --- | --- |
| **0.1.3** | 2026-09-23 | 修复：桌面版改用**独占数据目录**，不再与 CLI 的 `~/.dsh` 共用 —— 此前会因凭据格式随 dsh 版本变化而启动失败（报 `dsh process exited early, code: 1`） |
| 0.1.2 | 2026-09-23 | 修复：解压运行时遇到缺失的原生二进制不再整体失败（CI 构建会剔除与目标架构不匹配的文件，此前会导致启动报错、完全无法进入界面） |
| 0.1.1 | 2026-09-23 | 启用自动更新（强制更新门 + 自建 OSS 更新源）；CI 改为打 tag 自动构建发布。**此版本的安装包无法启动，请使用 0.1.3** |
| 0.1.0 | 2026-08-14 | 首个版本：Electron 壳 + 内置 dsh 运行时 |

## 许可

MIT

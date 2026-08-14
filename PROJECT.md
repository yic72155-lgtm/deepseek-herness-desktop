# DeepSeek Harness Desktop

## 项目简介

这是一个把官方 DeepSeek Harness Web 版封装成 Windows 桌面客户端的项目。

使用者不需要安装 Node.js、pnpm，也不需要单独下载官方 Web 版本。程序会在本地启动 DeepSeek Harness 后端服务，再用 Electron 窗口加载对应的网页界面。

当前状态：已完成本地 Windows 打包，可在 GitHub Releases 下载安装版、便携版和解压版。

## 仓库地址

- GitHub 仓库：https://github.com/yic72155-lgtm/deepseek-herness-desktop
- Releases：https://github.com/yic72155-lgtm/deepseek-herness-desktop/releases

## 官方上游源码

- 本地原始源码目录：`F:\workspace\text\deepseek-harness-master`
- 官方 npm 包：`@deepseek-ai/dsh@0.1.0-rc.6`

本项目不直接运行本地源码目录，而是通过 npm 依赖 `@deepseek-ai/dsh` 启动后端，保证打包后依赖完整。

## 技术栈

- Electron
- TypeScript
- electron-builder
- Node.js 24 / npm

## 目录结构

```text
deepseek-harness-desktop/
├─ src/
│  └─ main/
│     ├─ index.ts        # 应用入口、生命周期、启动流程
│     ├─ backend.ts      # 启动/停止 dsh 后端，动态端口
│     ├─ port.ts         # 查找可用端口
│     ├─ window.ts       # 主窗口
│     ├─ tray.ts         # 系统托盘
│     ├─ icon.ts         # 应用图标加载
│     └─ updater.ts      # 已删除，自动更新功能已移除
├─ build/
│  ├─ icon.jpg           # 用户提供的原始图标
│  └─ icon.png           # 转换后的 256x256 PNG
├─ dist/                 # TypeScript 编译产物
├─ release/              # electron-builder 输出目录
├─ electron-builder.yml
├─ package.json
├─ tsconfig.json
└─ PROJECT.md
```

## 运行原理

1. Electron 主进程启动。
2. `src/main/port.ts` 查找可用端口，优先使用 `3080`。
3. `src/main/backend.ts` 启动 DSH 后端：
   - 使用当前 Electron 可执行文件，并设置 `ELECTRON_RUN_AS_NODE=1`
   - 执行官方包的 `lib/bin.js`
   - 参数类似：`--expose-internals .../dsh/lib/bin.js web --host 127.0.0.1 --port <port>`
4. 等待 `http://127.0.0.1:<port>` 可访问。
5. 创建 Electron 主窗口，加载该地址。
6. 系统托盘提供“显示主窗口”和“退出”。

## 多实例与端口

- 已移除 Electron 单实例锁。
- 允许多个实例同时运行。
- 每个实例会查找未被占用的端口。
- 实例退出时会停止对应后端进程，端口会自动释放。

## 首次启动说明

打包版首次启动时会进行以下操作：

- 显示一个“正在初始化”的加载窗口。
- 把 `app.asar` 内的运行时文件解压到：

```text
%APPDATA%\deepseek-harness-desktop\runtime
```

后续启动会直接复用该目录，速度会明显更快。

## 打包配置

关键配置位于 `electron-builder.yml`：

```yaml
asar: true
npmRebuild: false
win:
  icon: build/icon.png
```

同时会生成：

- NSIS 安装版
- portable 便携版

`npmRebuild: false` 是为了避免没有 Visual Studio Build Tools 时，`node-pty` 等原生模块重编译失败。

## 图标

图标来源：

- 原始文件：`D:\deepseek-herness.jpg`
- 项目内副本：`build/icon.jpg`
- 转换后文件：`build/icon.png`

`electron-builder.yml` 使用 `build/icon.png` 作为 Windows 图标。主窗口和系统托盘也通过 `src/main/icon.ts` 使用同一个图标。

## 自动更新

自动更新功能已按用户要求移除：

- 已删除 `electron-updater` 依赖
- 已删除 `src/main/updater.ts`
- 已删除 `electron-builder.yml` 中的 `publish` 配置

## 常用命令

```bash
# 安装依赖
npm install

# 编译 TypeScript
npm run build

# 本地开发运行
npm start

# 打包 Windows 安装版和便携版
npm run pack
```

## 本地开发环境要求

- Windows 10/11
- Node.js 24
- npm

## 打包产物说明

`npm run pack` 输出到 `release`：

```text
release/
├─ DeepSeek Harness Desktop Setup 0.1.0.exe
├─ DeepSeek Harness Desktop-0.1.0-portable.exe
├─ DeepSeek Harness Desktop win-unpacked 0.1.0.zip
└─ win-unpacked/
```

用户下载任意一个即可使用。

## GitHub 发布

当前 GitHub Releases 已上传：

- 安装版
- 便携版
- 解压版 zip
- `latest.yml`

源码已推送到 `main` 分支。

## 常见问题

### 1. 双击后短暂没有主窗口

首次启动需要解压运行时，会先显示加载窗口，等待片刻即可。

### 2. 页面一直空白

通常是后端没有正常启动。可以查看 `%APPDATA%\deepseek-harness-desktop\runtime` 是否完整，或重新运行程序。

### 3. 打包后端口冲突

程序会自动选择其他可用端口，不需要手动指定。

### 4. 图标不生效

确认 `build/icon.png` 存在，并重新执行 `npm run pack`。

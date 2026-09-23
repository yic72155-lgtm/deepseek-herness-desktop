# 发布检查单

每次发版按顺序执行。标 ✅ 的是**必过项** —— 漏了会发布失败，或发出用户装不上的包。

---

## 1. 改版本号

- [ ] `package.json` 的 `version` 改成新版本
- [ ] **更新 [README.md](README.md)**：顶部的「当前版本」与「版本历史」表
      → **CI 会校验 README 是否包含当前版本号，漏了直接失败**（见 `.github/workflows/release.yml`）
- [ ] 需要时更新 `policy.json` 的 `minimumVersion`（强制更新线；不急的话保持不动，事后再改 OSS 上的那份）

## 2. 本地自检

```powershell
npm install
npm run build
npm run pack
npm run upload:oss:dry      # 预览上传清单，不会真上传
```

- [ ] 构建零错误
- [ ] `release/` 下有 `DeepSeek-Harness-Desktop-Setup-<版本>.exe`、同名 `.blockmap`、`latest.yml`

## 3. ✅ 验证「CI 产物」，而不是本地产物

> **只测本地产物 = 没测真正发给用户的东西。**

**v0.1.1 事故**：electron-builder 会剔除与目标架构不匹配的原生二进制，**而这个行为在 CI 与本地不一致** —— 本地包含 198 个 `app.asar.unpacked` 文件，CI 只有 192 个（少 6 个 arm64 文件，3 MB）。当时的解压逻辑对缺失文件不容错，于是 CI 构建的包一启动就报 `ENOENT`、用户完全进不去界面。本地产物当时**完全正常**。

- [ ] 打 tag 让 CI 构建（或先 `workflow_dispatch` 手动跑一次）
- [ ] **下载 CI 产出的安装包**（GitHub Release 或 OSS 上那个，不是本地 `release/` 里的）
- [ ] 在干净环境安装并启动 —— 至少用一个独立的 `--user-data-dir` 隔离测试：
      ```powershell
      .\DeepSeek-Harness-Desktop-Setup-x.y.z.exe
      # 或直接跑 win-unpacked：
      & ".\DeepSeek Harness Desktop.exe" --user-data-dir=F:\tmp\udd-test
      ```
- [ ] 确认能进 GUI、能正常对话

## 4. 发布

```powershell
git add -A
git commit -m "chore(release): x.y.z"
git tag vX.Y.Z
git push origin main --tags      # 触发 CI：构建 → GitHub Release → 上传 OSS
```

- [ ] CI 三步全绿：`Build and package` / `Publish to GitHub Release` / `Upload update feed to OSS`
- [ ] OSS 上的 `latest.yml` 里 `version`、`size`、`sha512` 与实际安装包**一致**：
      ```powershell
      curl.exe -I "https://deepseek-harness-upgrade.oss-cn-beijing.aliyuncs.com/win/DeepSeek-Harness-Desktop-Setup-x.y.z.exe"
      # Content-Length 应等于 latest.yml 里的 size
      ```

## 5. 收尾

- [ ] 删掉已知有问题的旧 Release（避免用户翻到坏包）—— 例如 `v0.1.1`
- [ ] 需要提升强制更新线时，**只改 OSS 上 `policy.json` 的 `minimumVersion`**，不需要重发客户端

---

## 自动化分工

| 环节 | 谁做 |
| --- | --- |
| 构建、打包 | CI（打 tag 自动触发） |
| GitHub Release | CI |
| OSS 更新源上传 | CI（`scripts/upload-oss.mjs`，顺序：安装包 → blockmap → `policy.json` → `latest.yml` 最后） |
| README 版本校验 | CI（缺失当前版本号即失败） |
| **CI 产物实测** | **人** —— 必须在真机安装启动，无法自动化 |
| README / 版本历史更新 | 人（CI 只校验有没有漏，不代写） |

## 两个原则

1. **本地产物通过 ≠ 发布产物通过。** 任何"只在本机验证过"的功能，都不算验证过。
2. **发布源唯一。** 一切发布走 CI；本地打的包只用于自检，不要手工往 OSS 或 Releases 传（会让清单与安装包不是同一批）。

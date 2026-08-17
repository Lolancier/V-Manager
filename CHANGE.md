# V-Manager 版本变更

当前版本：**0.10.0**（2026-08-17）

本版本集中完成结构现代化：Electron 逐大版本升级到 43、渲染层多窗口入口拆分、主进程 IPC 全量服务化与类型/构建门禁，为后续功能迭代建立受控地基。

主要变化：

- Electron 从 32 逐大版本升级到 **43.4.0**（Node 24 / Chromium 150），每级独立验证与提交。
- 渲染层拆分为 **9 个独立窗口入口**（桌宠/启动/设置/缩放/输入/聊天/气泡/表情/代码），每个窗口只加载自己的视图与样式。
- 主进程全部 IPC 迁入 **20 个 Electron-free 领域服务**，`electron/main.js` 不再直接注册任何 `ipcMain.handle/on`。
- 新增严格类型门禁：`npx tsc --noEmit` 通过；Live2D 官方移植源码用 `@ts-nocheck` 隔离。
- 架构审计（`npm run audit:architecture`）0 critical / 0 warnings，覆盖 IPC 通道所有权、窗口安全与服务生命周期。
- 自动化测试 **301 项全部通过**，Vite 生产构建与 Electron 打包通过。
- 自动语音合成新增守卫：语音未启用或 GPT-SoVITS 未运行时直接跳过，不再静默失败。

完整逐版本记录请查看 [CHANGELOG.md](CHANGELOG.md)。

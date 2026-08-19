# V-Manager 版本变更

当前版本：**0.11.0**（2026-08-19）

本版本重构大语言模型配置：从"DeepSeek 官方 + 每模型一个中转开关"升级为"官方 + 多个可保存的第三方提供方注册表"，每个模型显式选择当前配置，并提供逐提供方连通性测试，界面对齐 Harness 风格。

主要变化：

- **模型配置数据模型**：新增 `deepseek.providers`（保存的第三方提供方注册表，含 `id/name/apiKey/baseUrl/model/api`）；每个模型通过 `chatProvider`（日常对话 Flash）/ `proProvider`（复杂任务 Pro）**独立选择当前来源**（`official` 或某个第三方 id）。后端统一在 `deepseek-endpoint.js` 的 `resolveDeepSeekEndpoint` 解析，所有模型调用点集中走它。
- **官方/自定义显式切换**：设置页模型区顶部新增**常驻的"当前配置"面板**，每个模型一个下拉可选「DeepSeek 官方」或任意已保存第三方，右侧实时显示当前来源；切回官方一步完成，不再藏在编辑卡里。
- **多第三方注册表**：可创建多个自定义提供方并保存为独立卡片（名称 + API 地址 + API 密钥 + API 协议 + 模型名 + 获取可用模型），每张可编辑 / 测试连通性 / 删除，并可在任意模型来源间切换复用；带"使用中"徽标，当前配置一目了然。
- **逐提供方连通性测试**：新增 `testDeepSeekRelayConnection` + IPC `agent:test-deepseek-relay` + 桥接 `testDeepSeekRelay()`，每个提供方行有"测试连通性"按钮，实时内联结果。
- **兼容迁移**：旧的 `modelRelay` / `chatModelRelay` 启用项在 `normalizeDeepSeekSection` 自动转为注册表条目并设为对应模型的当前来源，旧配置无需手动修改。
- 全量测试 **309 项通过**，架构审计 0 critical / 0 warnings，Vite 生产构建通过。

---

### 0.10.1（2026-08-17）

本版本修复 GPT-SoVITS 语音模块在安装/打包环境下的启动失败，并新增"以本机已跑通环境为蓝本、一键安装到自选目录"的链路。

主要变化：

- **语音运行环境自动发现**：`ensureGptSovitsService` 不再把运行目录写死为开发检出，改为按「配置项 → 环境变量 → 应用根目录及其父目录」依次探测可用运行环境；修正自动朗读路径与启动脚本 `cwd` 硬编码问题。
- **运行环境安装向导**：新增 `installGptSovitsRuntime`，把已跑通的整套 GPT-SoVITS（官方 clone + 权重 + conda 运行时）整体复制到自选目录，自动排除无用文件、拒绝覆盖已有环境、复制后结构校验；设置页「语音与 ASMR → GPT-SoVITS 角色声线」提供安装入口与进度。
- **本地实测**：整体复制约 12 GB 用时约 199 秒，重定位后的解释器在新位置正常加载 `torch 2.7.0+cu126` + CUDA（RTX 4060），证明"复用已验证环境"方案可行。
- 修复桌宠气泡在透明窗口上量宽过早导致长文本截断、以及毛玻璃方框/边框视觉残留。
- 新增配置项 `voice.gptSovitsRuntimeRoot`；全量测试 **306 项通过**，架构审计 0 critical / 0 warnings，Vite 生产构建通过。

---

### 0.10.0（2026-08-17）

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

# V-Manager

V-Manager 是一个面向 Windows 的本地桌面 Agent。它以 Live2D 角色作为交互载体，提供人物卡、多轮对话、本地记忆与 RAG、语音交互、桌面工具和隔离的自主生活空间。

> 当前版本：**0.10.1**
> 项目状态：个人本地开发版，功能仍在持续迭代。

## 0.10.1 重点（GPT-SoVITS 运行环境复用与安装）

- 修复 GPT-SoVITS 语音模块在已安装/打包环境下的启动失败：运行时根目录改为**自动发现**（配置项 → 环境变量 → 应用根目录及其父目录），不再写死开发检出目录。
- 新增**运行环境安装向导**：在「语音与 ASMR → GPT-SoVITS 角色声线」可把本机已跑通的整套 GPT-SoVITS（官方 clone + 权重 + conda 运行时）**一键安装到自选目录**，之后脱离开发项目独立使用。
- 实测验证"复用已验证环境"方案可行：整体复制约 12 GB 约 199 秒，重定位后的解释器在新位置正常加载 `torch 2.7.0+cu126` + CUDA（RTX 4060），无需重装依赖。
- 修复桌宠气泡在透明窗口上量宽过早导致长文本截断、以及毛玻璃方框/边框视觉残留。
- 全量测试 **306 项通过**，架构审计 0 critical / 0 warnings，Vite 生产构建通过。

## 0.10.0 重点（结构现代化）

- Electron 从 32 逐大版本升级到 **43.4.0**（Node 24 / Chromium 150），每个大版本独立验证并提交。
- 渲染层拆分为 **9 个独立窗口入口**（桌宠/启动/设置/缩放/输入/聊天/气泡/表情/代码），每个窗口只加载自己的视图与样式，不再共用一个巨型 App 入口。
- 主进程全部 IPC 迁入 **20 个 Electron-free 领域服务**，`electron/main.js` 不再直接注册任何 `ipcMain.handle/on`，仅保留窗口宿主、托盘、协议与服务装配。
- 新增严格类型门禁：`npx tsc --noEmit` 通过；移植的 Live2D 官方源码用 `@ts-nocheck` 隔离，不阻塞业务代码检查。
- 架构审计（`npm run audit:architecture`）**0 critical / 0 warnings**，覆盖 IPC 通道所有权、窗口安全配置、服务生命周期与打包布局。
- 自动化测试 **301 项全部通过**，Vite 生产构建与 Electron 打包通过。
- 自动语音合成新增守卫：语音未启用或 GPT-SoVITS 服务未运行时直接跳过，不再静默失败。

完整版本记录见 [CHANGELOG.md](CHANGELOG.md)。

## 主要能力

### 对话、人格与记忆

- DeepSeek OpenAI 兼容接口，区分日常对话模型和复杂任务模型。
- 流式显示回复，过滤无效空回复，避免错误内容污染后续上下文。
- 人物卡稳定注入身份、自称、称呼、关系、价值观、性格、表达方式、背景和示例台词。
- AI 人物卡生成可读取联网检索摘要，无法联网时会明确按二创设定处理不确定信息。
- 人物卡之间隔离聊天上下文、作品和活动记录，避免人格串话。
- 完整聊天写入 `storage/vivi.sqlite`，JSONL 保留兼容的短期记录。
- RAG 支持关键词与向量检索；知识文件变更后在下次启动自动更新索引。

### 主动陪伴与日程

- 根据最近一次模型互动、连续工作时间、安静时段和打扰反馈控制主动问候。
- 主动行为支持频率限制、暂停到当天结束、健康提醒和深夜关怀。
- 本地提醒和电源计划持久化到 `schedules.json`。
- Windows 任务计划程序可在 V-Manager 退出后按时唤醒提醒。
- 关机和重启必须二次确认，错过的电源操作不会补执行。

### 自主生活与私密空间

自主生活模块可整体关闭。关闭后保留普通聊天、工具和手动创作，不执行后台自主活动，也不消耗自主预算。

活动分为四类：

- 轻量日常：收集日记素材、浏览允许的天气与资讯、整理记忆、回顾画作、规划创作、休息和阅读笔记。
- 创作活动：日记、SVG 绘画、离线小游戏。
- 娱乐活动：试玩旧游戏、改进旧游戏。
- 陪伴行为：准备聊天话题和受频率控制的主动问候。

除普通对话外，自主行为共享一个每日 Token 总预算。预算不足时停止下一项活动并请求用户调整。虚拟日程按天即时生成，不长期保存计划表；只有实际完成的活动和作品会留下记录。

### 语音与 Live2D

- Sherpa-ONNX 本地离线 TTS、GPT-SoVITS 角色声线和可选 ElevenLabs。
- 本地 Whisper 语音输入。
- GPT-SoVITS 配置包可导入、下载、校验并在语音库中选择。
- GPT-SoVITS 运行环境自动发现；可在「语音与 ASMR」里把本机已跑通的整套运行环境一键安装到自选目录。启动失败时自动朗读不静默失败。
- 语音朗读过滤括号动作和内部状态，只朗读角色实际说出口的内容。
- 实际音频振幅驱动口型；合成失败时使用有限时长的文本口型兜底。
- 桌面宠物、聊天栏和气泡共享情绪事件，但使用各自的 Live2D 渲染实例。

### 本地工具与安全边界

- 查看 CPU、内存、磁盘、进程与可见窗口。
- 启动、定位和检查常见应用。
- 搜索、读取、打开、创建和追加本地文件。
- 安全文件管家采用"只读扫描 → 预览 → 明确确认 → 执行 → 可撤销"流程。
- 普通删除进入 Windows 回收站；代码开发写入要求明确授权。
- 小游戏在禁止联网和访问电脑文件的隔离窗口中运行，并限制试玩时长与操作次数。

## 快速开始

### 环境要求

- Windows 10/11
- Node.js 20 或更高版本
- npm
- 可用的 DeepSeek OpenAI 兼容 API（自然对话与 AI 创作需要）

### 安装与开发

```powershell
npm install
npm run dev
```

Vite 默认运行于 `http://localhost:5173`，Electron 会在渲染服务就绪后启动。

### 测试、构建与安装

```powershell
npm test
npm run build

# 生成免安装目录
npm run pack

# 生成 Windows 安装包
npm run dist
```

产物默认输出到项目同级的 `V-Manager-builds` 目录：

- `V-Manager-builds/win-unpacked/V-Manager.exe`：免安装生产目录，不依赖 Vite 或 npm，可直接运行；移动时必须携带整个 `win-unpacked` 目录。
- `V-Manager-builds/V-Manager Setup 0.10.1.exe`：正式 NSIS 安装程序，由 Windows 管理安装目录和卸载入口。

开发环境（`npm run dev`）由 Vite 提供热更新和源码调试，需要源码与开发依赖持续存在。

安装版与开发版共用 Electron 用户数据目录，因此正常升级不会主动删除人物卡、对话、API 配置和私密空间内容。卸载或清理数据前仍建议备份 `%APPDATA%/v-manager/agent-data`。

当前个人本地构建未配置商业代码签名证书，Windows 可能显示"未知发布者"或 SmartScreen 提示。请只运行自己构建或从可信仓库取得的安装包，并可用 SHA-256 校验文件是否发生变化。

## 配置说明

首次启动后在设置窗口配置：

1. 在"模型与记忆"填写 DeepSeek API Key、Base URL 和模型名。
2. 按需配置 Embedding；未配置时 RAG 自动使用关键词检索。
3. 在"人物卡"创建或选择角色。
4. 在"语音与 ASMR"选择回复声线。人物卡不再绑定语音模型。
5. 如需自主活动，在"私密空间"开启完整自主生活模块并设置预算、时间和权限。

API Key 保存在本机应用数据目录，不应提交到 Git。

## 数据位置

运行数据默认位于 Electron 的用户数据目录（通常为 `%APPDATA%/v-manager/agent-data`）：

```text
agent-data/
├─ config.json                  本地配置和 API 凭据
├─ storage/vivi.sqlite          原始聊天、人物卡和版本
├─ memory/conversation.jsonl    兼容的短期聊天记录
├─ companion-memory.json        事实、经历、习惯和承诺
├─ knowledge/                   本地知识文件
├─ rag/                         RAG 配置与索引
├─ schedules.json               提醒与电源计划
└─ vivi-sandbox/
   ├─ diary/                    按人物卡归档的 Markdown 日记
   ├─ drawings/                 SVG 画作
   ├─ games/                    离线小游戏
   ├─ life/                     轻量日常记录
   └─ activity.jsonl            活动日志
```

设置页提供"打开数据目录"和"打开私密空间"的直达入口。

## 项目结构

```text
electron/
├─ main.js                      Electron 主进程：窗口宿主、托盘、协议与服务装配
├─ preload.cjs                  安全桥接（唯一 preload 源）
├─ ipc-security.js              可信 IPC registrar 与边界校验
├─ main-helpers.js              窗口尺寸、视图加载等宿主辅助
├─ main-menus.js                桌宠与托盘菜单
├─ main-secondary-windows.js    辅助窗口创建与生命周期
├─ services/                    20 个 Electron-free 领域服务
└─ workers/utility-entry.js     RAG / 语音推理后台 worker 入口

src/
├─ App.tsx                      多窗口 React 根（按 viewMode 渲染）
├─ entries/                     9 个窗口独立渲染入口
├─ views/                       窗口视图、设置分区与运行时类型
├─ styles/                      按窗口拆分的样式
└─ pet/                         Live2D 渲染与官方 SDK 适配

src-agent/
├─ core.js                      对话、路由、RAG 与模型调用
├─ persona-cards.js             人物卡持久化
├─ persona-generator.js         AI 人物卡生成
├─ local-database.js            SQLite 原始记录
├─ companion-memory.js          结构化陪伴记忆
├─ interest-sandbox.js          私密空间与自主生活
├─ game-playtest.js             小游戏受限试玩协议
├─ proactive-engine.js          主动陪伴规则
├─ schedule-engine.js           本地提醒和电源计划
├─ rag.js                       索引与检索
├─ gpt-sovits.js                GPT-SoVITS 语音库
└─ executors/                   应用、文件、系统等执行器

tests/                          301 项 Node.js 自动化测试
scripts/                        架构审计、Electron 冒烟与语音服务脚本
docs/                           架构整备、验证清单与参考文档
```

## 开发门禁

| 命令 | 作用 |
|---|---|
| `npm test` | 运行 301 项自动化测试 |
| `npm run audit:architecture` | 架构审计：IPC 所有权、窗口安全、服务生命周期、打包布局 |
| `npx tsc --noEmit` | 严格类型检查 |
| `npm run verify:electron` | 真实 Electron 43 运行时与原生语音模块冒烟 |
| `npm run verify` | 架构审计 + 测试 + 构建三合一 |

## 安全说明

- 自主沙盒不等于电脑文件权限；它只能写入专属目录。
- 文件修改、外部消息和危险系统操作仍遵循明确授权与确认规则。
- 不要提交 `agent-data`、API Key、语音权重、构建产物或个人聊天数据。
- 本项目仍处于个人开发阶段，使用电源计划和文件工具前请保存工作内容。

## License

仓库当前未声明通用开源许可证。第三方组件和模型资源遵循各自许可证与使用条款。

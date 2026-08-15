# Electron 现代化整备审查

审查日期：2026-08-16

## 结论

项目应继续使用 Electron，但不能直接从 32 跳到最新大版本后再统一修复。升级前需要把“桌面宿主能力、业务服务、后台任务、窗口生命周期、渲染入口”分开。本轮已经建立第一批边界：Agent 核心不再直接导入 Electron Shell、记忆 IPC 已成为独立服务、辅助窗口关闭后释放 renderer，并加入可重复执行的架构审计。Phase 1 还将 `electron/preload.cjs` 固化为唯一 preload 源，开发与打包窗口都通过主进程的 `PRELOAD_PATH` 加载它。Phase 2 已把完整语音域迁入 `speech-service`。Phase 3 已把 Electron 生产路径的 RAG 扫描、Embedding 和索引写入接到惰性 `utilityProcess`，主进程只保留状态读取和检索。

RAG worker 入口直接导入 `src-agent/rag.js`，不加载整个 Agent core，也不访问 BrowserWindow、app、ipcMain 或 Shell。启动刷新、memory-service 设置页手动重建、app-executor 自然语言重建和 tool-executor 模型工具重建这 4 条 Electron 写路径都注入同一个后台 adapter。`src-agent` 的两个 executor 仍保留直接调用 RAG 模块的兼容 fallback，供 CLI、测试或其他非 Electron 宿主使用；它们不是 Electron 生产主进程路径。

## 当前结构与主要热点

| 区域 | 现状 | 风险 | 后续目标 |
| --- | --- | --- | --- |
| `electron/main.js` | 约 3050 行，窗口、托盘、协议、日程、自主创作仍混合；语音与 RAG 写索引已抽离 | Electron 升级回归范围仍大；共享全局状态多 | 只保留应用启动、服务装配和生命周期 |
| `src/App.tsx` | 约 5300 行，所有窗口共用一个 React 入口 | 每个辅助 renderer 都加载整套 UI 和 Live2D 依赖 | 按 `startup/pet/bubble/settings/chat/code` 拆入口和动态 chunk |
| `src/styles.css` | 约 4300 行 | 样式回归范围大，窗口间互相影响 | 按窗口和共享组件拆分 |
| `src-agent/core.js` | 约 1500 行，模型请求、上下文、工具循环、配置混合 | 难以独立放入 utilityProcess | 拆成 model-client、prompt-builder、conversation-service、tool-loop |
| `src-agent/interest-sandbox.js` | 约 1100 行 | 存储、日程、生成和作品生命周期混合 | 拆成 repository、planner、creator、artifact-policy |
| preload | `electron/preload.cjs` 是唯一源和 Electron 32 直接加载文件 | 新增副本或窗口绕过统一路径会重新引入漂移 | 架构审计要求唯一文件存在，且所有 BrowserWindow 使用 `PRELOAD_PATH` |

## 已确认的优势

- 所有常规窗口均设置了 `contextIsolation: true`、`nodeIntegration: false`。
- 小游戏试玩使用独立 Session，拒绝权限、外部导航和联网，并启用 sandbox。
- 文件、作品与自定义协议已有路径边界检查。
- 记忆、RAG、人物卡、日程、兴趣沙盒在 `src-agent` 中已有领域模块，不必重写业务数据格式。
- 设置、聊天、代码等窗口原本已经按需创建；本轮补齐关闭后销毁 renderer。

## 高优先级风险

1. Electron 32 已停止支持。升级期间必须逐大版本验证，不能只在最终版本运行一次测试。
2. 大量 IPC 仍直接注册在主文件，并且多数尚未统一验证发送方。记忆与语音服务已使用主 frame 与本地 URL 校验；剩余 IPC 仍需逐域迁入该注册器，并继续补参数 schema 和调用窗口权限。
3. 启动链路仍等待后台 RAG 刷新、语音服务准备、模型扫描、数据库恢复和日程同步；RAG 已不阻塞主进程事件循环且失败会降级，但启动页面仍会等待其任务结果。
4. `App.tsx` 的单入口意味着“懒创建窗口”并不等于“轻量窗口”；每个 renderer 仍会解析大部分相同代码。
5. `src-agent` 之前直接使用 Electron Shell，使核心无法安全迁入 utilityProcess。本轮已经改成宿主适配器，但未来 worker 中的特权操作仍应通过主进程 RPC 返回执行。
6. 自定义资源协议返回 `Access-Control-Allow-Origin: *`。虽然文件路径有边界检查，仍应在升级时评估是否能限制为应用自己的 origin。
7. 本地原生语音模块 `sherpa-onnx-node` 是 Electron/Node 大版本升级的重点兼容项；每个阶段都要做加载、转录、打包和卸载验证。
8. 本地 `npm ls` 在 Windows 上发现 `sherpa-onnx-darwin-x64` 可选平台包状态异常。它不影响当前 Win x64 运行，但说明升级时不能只看安装成功，必须在干净目录重新安装并核对目标平台原生包。
9. 当前 `vite build` 能通过，但严格 `tsc --noEmit` 不能通过。应用层已发现的活动人物卡类型和空值问题已修正；剩余错误集中在移植的 Live2D 官方源码与 `@framework` TypeScript 路径/严格空值兼容。Electron 升级前应把“生产构建”和“类型检查”拆成明确门禁，并为第三方 Live2D 源码建立独立 tsconfig 或稳定的类型适配层。

在线 `npm audit` 未纳入本轮结论：项目当前指向第三方 npm 镜像，安全审计会把 lockfile 依赖清单发送到该镜像；在未单独授权该数据外发前只执行了本地依赖树检查。后续可先切换到团队认可的 registry，再在 CI 中运行审计。

## 服务拆分目标

主进程最终只负责：

- Electron `app` 生命周期与单实例；
- BrowserWindow/Tray/Notification/Protocol；
- 受保护 IPC 路由；
- utilityProcess 的创建、监督和关闭；
- 需要 Electron Shell、Dialog、Screen、Session 的宿主操作。

建议按以下顺序迁移：

1. `memory-service`：记忆统计、长期记忆、RAG 状态/重建、清理。本轮已建立 IPC 服务样板。
2. `schedule-service`：计时器、Windows Task Scheduler、提醒与承诺同步。
3. `speech-service`：TTS/STT 包管理、语音缓存、GPT-SoVITS 服务生命周期。Phase 2 已完成。
4. `creation-service`：自主日程、日记/绘画/游戏生成与作品清理。
5. `conversation-service`：模型请求、Prompt/Token 预算、工具调用循环和对话持久化。

服务模块不得直接持有 BrowserWindow；通过事件发布器通知窗口。每个服务需返回 `start()`、`stop()`、`snapshot()`，并能在测试中注入时钟、文件根目录和宿主能力。

迁移单个 IPC 域时，应把 `createTrustedIpcRegistrar(ipcMain, policy)` 注入该域 registrar，禁止把原始 `ipcMain` 继续传入服务。`handle/removeHandler` 用于 request/response：不可信 `invoke` 会以拒绝错误返回。renderer `send` 对应的接收侧使用 `on`：它会在每次事件进入业务 listener 前执行同一套主 frame 与 URL 校验，但对不可信单向事件只安全丢弃，不让校验异常从 EventEmitter 传播；可信业务 listener 自己抛出的异常仍保持原有传播语义。`on` 返回可重试且成功后幂等的 disposer；也可用原始 listener 调用 `removeListener`，registrar 会精确移除内部包装函数。先保持 renderer 的 channel、方法名、参数形状和返回值不变，再在服务边界增加参数 schema 与窗口级权限；对应测试至少覆盖受信主 frame 成功、外部 origin 或子 frame 在业务 handler 执行前被拒绝或丢弃，以及 dispose 移除全部 handler/listener。`memory-service` 与可信 registrar 的组合测试已覆盖这条装配路径，后续服务按相同模式逐域迁移，不在一次变更中批量搬移全部 IPC。

`speech-service` 保持 preload 的 17 个语音 handle 与 1 个单向 signal channel 不变，服务本身不导入 Electron，也不持有 BrowserWindow。合成缓存按规范化文本、provider 与对应声线参数生成键；同键磁盘 miss 共享一个 in-flight Promise，不同键并行执行，失败不会进入缓存。GPT-SoVITS 安装或导入成功后会清空派生音频缓存并切换进程内缓存 generation，避免同 ID 声线更新后复用旧音频；旧 generation 的在途任务也不会写回。缓存使用临时文件后 rename，避免把半文件当作成功缓存。下一阶段仍应评估把本地 STT/TTS 原生推理迁入 utilityProcess，并为大模型下载与进程退出补更细的取消语义。

## utilityProcess 迁移矩阵

| 工作 | 目标进程 | 原因与边界 |
| --- | --- | --- |
| RAG 扫描、分块、Embedding、索引写入 | utilityProcess（Phase 3 已接入生产） | 文件和网络工作独立，输入输出可序列化；主进程继续读取索引与执行检索 |
| 本地 STT/TTS 推理 | utilityProcess 或专用 sidecar | 原生模块、CPU/内存峰值不应影响 UI 主线程 |
| GPT-SoVITS 服务启动与健康检查 | 独立服务进程；主进程监督 | 已是外部进程模型，重点是生命周期和崩溃恢复 |
| 小游戏策略生成、结果分析、反思 | utilityProcess | 纯模型/文本工作可迁移 |
| BrowserWindow 试玩驱动、Session 拦截、截图和输入 | 主进程 Electron 服务 | 依赖 BrowserWindow/WebContents/Session，不能直接作为普通 Node worker 处理 |
| 日程计算、记忆筛选、Token 预算 | 普通模块，必要时 worker | 当前计算轻量，先保持纯函数与可测试性 |

后台协议只传结构化可克隆数据，不传函数、BrowserWindow、Session、数据库连接或 AbortSignal。开发和打包均从主模块的 `import.meta.url` 推导 `electron/workers/utility-entry.js`，不依赖当前工作目录；`electron/**/*` 打包规则包含该入口。

同一个规范化 `baseDir` 的 RAG 写任务使用单一互斥队列：同类型请求共享 Promise；显式 rebuild 在正在执行的 ensure 之后排队，后续 ensure 遇到 rebuild 时复用 rebuild，避免两个任务同时写 `rag-index.json`。不同目录可以并行。最终索引先写同目录临时文件再 rename，主进程状态读取或检索不会看到半份 JSON。超时只拒绝调用方并发送 cancel，底层 RAG 当前不支持 AbortSignal，因此扫描、Embedding 和写文件不会被伪装成真正中止；worker 会抑制迟到业务结果，并在底层工作真实结束后发送取消完成确认。在此之前该目录锁保持占用，后续任务不得开始。worker 退出或消息发送失败会拒绝并清理相应任务；应用退出时 supervisor 永久关闭，排队任务不会再启动。

## 窗口与渲染器策略

- 常驻：桌宠、气泡。它们承担实时交互，关闭按钮继续表示隐藏或由应用托盘管理。
- 可释放：设置、缩放、输入框、完整聊天、代码、表情面板。现在首次打开时创建，关闭时销毁，下次重新创建。
- 游戏试玩：每次任务创建隔离窗口，结束后清理 Session 和窗口；继续保持短生命周期。
- 下一阶段应为不同窗口建立独立渲染入口，至少先拆出 `settings`、`code` 和 `pet/live2d`，避免每个窗口加载完整 `App.tsx`。

## Electron 分阶段升级门禁

Electron 官方建议一次迁移一个大版本并逐项检查 Breaking Changes。建议每个大版本单独提交，至少运行：

1. `npm run verify`；
2. 开发模式启动与生产打包启动；
3. 桌宠透明、置顶、鼠标穿透、拖拽、多屏边界；
4. 设置/聊天/代码窗口重复打开关闭 20 次，确认 renderer 数量回落；
5. 麦克风权限、本地 STT、三种 TTS 路径和语音缓存；
6. RAG 自动刷新、手动重建、长期记忆写入与召回；
7. 提醒执行、Windows 任务注册、后台启动和退出清理；
8. 小游戏联网拦截、权限拒绝、模拟输入、截图、取消与崩溃回收；
9. NSIS 安装、覆盖安装、卸载和用户数据保留；
10. 记录启动时间、空闲内存、打开各窗口后的 renderer 数与峰值内存。

推荐路线是从 32 开始逐个大版本升级，每个版本独立验证并提交；可以在确认连续几个版本只涉及依赖更新后合并发布节奏，但不要省略中间版本的构建和冒烟测试。到达受支持版本后，再更新打包工具和原生依赖，避免同时改变过多变量。

## 自动审查

运行：

```powershell
npm run audit:architecture
```

该命令会输出 Electron 版本、主文件行数、直接 IPC 数、窗口数、Agent 核心是否重新直接导入 Electron、安全窗口配置、preload 状态，以及 utilityProcess/RAG 迁移指标。RAG 门禁要求 worker 入口存在并进入生产打包、主进程不直接调用写索引函数、启动/memory-service/app-executor/tool-executor 四条写路径全部注入后台 adapter。审计同时会独立统计全部 `new BrowserWindow(` 调用，再逐个配对调用参数；只认可第一个参数是可静态分析的对象 literal，且真实属性路径为 `webPreferences.preload: PRELOAD_PATH`。变量 options、第二参数或顶层/metadata preload 诱饵、动态 spread/computed 属性，以及任何无法静态确认的窗口都会作为 critical。preload 或 utility worker 被生产清单排除也会直接失败。API 表面、代表性参数转发与事件解绑另由 `tests/preload.test.js` 固化；审计规则的绕过场景由 `tests/electron-architecture-audit.test.js` 固化；其余尚待拆分的结构问题继续作为 warning 展示。

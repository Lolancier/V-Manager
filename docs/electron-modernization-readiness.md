# Electron 现代化整备审查

审查日期：2026-08-16

## 结论

项目应继续使用 Electron，但不能直接从 32 跳到最新大版本后再统一修复。升级前需要把“桌面宿主能力、业务服务、后台任务、窗口生命周期、渲染入口”分开。本轮已经建立第一批边界：Agent 核心不再直接导入 Electron Shell、记忆 IPC 已成为独立服务、辅助窗口关闭后释放 renderer，并加入可重复执行的架构审计。Phase 1 还将 `electron/preload.cjs` 固化为唯一 preload 源，开发与打包窗口都通过主进程的 `PRELOAD_PATH` 加载它。Phase 2 已把完整语音域迁入 `speech-service`；Phase 4B 已将三种语音合成及本地 STT 的原生/网络推理通过统一后台任务协议移出主进程，主进程只保留缓存、IPC 和生命周期管理。Phase 3 已把 Electron 生产路径的 RAG 扫描、Embedding 和索引写入接到惰性 `utilityProcess`，主进程只保留状态读取和检索。Phase 4A 已把日程计时、提醒/电源处理、Windows Task Scheduler 同步、承诺完成回写和 2 个日程 IPC 迁入 `schedule-service`。Phase 4C 已把模型会话和自主创作状态机分别迁入 `model-conversation-service` 与 `autonomous-creation-service`，对应 13 个 IPC 全部使用可信 registrar。Phase 5D 已把设置、人物卡和 Live2D 模型 15 个 IPC 迁入三个 Electron-free 服务。Phase 5E 已把主文件剩余 40 个 handle 和 3 个 listener 迁入九个 Electron-free 领域服务，`electron/main.js` 不再直接注册 IPC。

RAG worker 入口直接导入 `src-agent/rag.js`，不加载整个 Agent core，也不访问 BrowserWindow、app、ipcMain 或 Shell。启动刷新、memory-service 设置页手动重建、app-executor 自然语言重建和 tool-executor 模型工具重建这 4 条 Electron 写路径都注入同一个后台 adapter。`src-agent` 的两个 executor 仍保留直接调用 RAG 模块的兼容 fallback，供 CLI、测试或其他非 Electron 宿主使用；它们不是 Electron 生产主进程路径。

## 当前结构与主要热点

| 区域 | 现状 | 风险 | 后续目标 |
| --- | --- | --- | --- |
| `electron/main.js` | 约 2040 行；窗口、托盘、协议与宿主 adapter 仍在主文件，常规业务 IPC 已迁入领域服务 | Electron 升级回归范围仍大；窗口宿主状态仍多 | 继续按窗口宿主域拆分，只保留应用启动、服务装配和生命周期 |
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
2. 主文件已不直接注册常规 IPC handler/listener，但多数领域仍只保留原参数与返回形状，尚未系统性增加参数 schema 和调用窗口权限。后续应在可信服务边界继续收紧 schema、事件发送方和窗口能力矩阵。
3. 启动链路仍等待后台 RAG 刷新、语音服务准备、模型扫描、数据库恢复和日程同步；RAG 已不阻塞主进程事件循环且失败会降级，但启动页面仍会等待其任务结果。
4. `App.tsx` 的单入口意味着“懒创建窗口”并不等于“轻量窗口”；每个 renderer 仍会解析大部分相同代码。
5. `src-agent` 之前直接使用 Electron Shell，使核心无法安全迁入 utilityProcess。本轮已经改成宿主适配器，但未来 worker 中的特权操作仍应通过主进程 RPC 返回执行。
6. 自定义资源协议返回 `Access-Control-Allow-Origin: *`。虽然文件路径有边界检查，仍应在升级时评估是否能限制为应用自己的 origin。
7. 本地原生语音模块 `sherpa-onnx-node` 是 Electron/Node 大版本升级的重点兼容项；现在由 utilityProcess 加载，但每个阶段仍要做加载、转录、打包和卸载验证。
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
2. `schedule-service`：计时器、Windows Task Scheduler、提醒与承诺同步。Phase 4A 已完成。
3. `speech-service`：TTS/STT 包管理、语音缓存、GPT-SoVITS 服务生命周期。Phase 2 已完成。
4. `creation-service`：自主日程、日记/绘画/游戏生成与作品清理。Phase 4C 已完成 Electron 编排层抽离。
5. `conversation-service`：模型请求、Prompt/Token 预算、工具调用循环和对话持久化。Phase 4C 已完成 Electron 编排层抽离；纯模型管线仍保留在 `src-agent/core.js`。

服务模块不得直接持有 BrowserWindow；通过事件发布器通知窗口。每个服务需返回 `start()`、`stop()`、`dispose()`、`snapshot()`，并能在测试中注入时钟、文件根目录和宿主能力。

迁移单个 IPC 域时，应把 `createTrustedIpcRegistrar(ipcMain, policy)` 注入该域 registrar，禁止把原始 `ipcMain` 继续传入服务。`handle/removeHandler` 用于 request/response：不可信 `invoke` 会以拒绝错误返回。renderer `send` 对应的接收侧使用 `on`：它会在每次事件进入业务 listener 前执行同一套主 frame 与 URL 校验，但对不可信单向事件只安全丢弃，不让校验异常从 EventEmitter 传播；可信业务 listener 自己抛出的异常仍保持原有传播语义。`on` 返回可重试且成功后幂等的 disposer；也可用原始 listener 调用 `removeListener`，registrar 会精确移除内部包装函数。先保持 renderer 的 channel、方法名、参数形状和返回值不变，再在服务边界增加参数 schema 与窗口级权限；对应测试至少覆盖受信主 frame 成功、外部 origin 或子 frame 在业务 handler 执行前被拒绝或丢弃，以及 dispose 移除全部 handler/listener。`memory-service` 与可信 registrar 的组合测试已覆盖这条装配路径，后续服务按相同模式逐域迁移，不在一次变更中批量搬移全部 IPC。

`speech-service` 保持 preload 的 17 个语音 handle 与 1 个单向 signal channel 不变，服务本身不导入 Electron，也不持有 BrowserWindow。合成缓存按规范化文本、provider 与对应声线参数生成键；同键磁盘 miss 共享一个 in-flight Promise，不同键并行执行，失败不会进入缓存。GPT-SoVITS 安装或导入成功后会清空派生音频缓存并切换进程内缓存 generation，避免同 ID 声线更新后复用旧音频；旧 generation 的在途任务也不会写回。缓存使用临时文件后 rename，避免把半文件当作成功缓存。Phase 4B 已将三种 TTS 与本地 STT 推理通过 utilityProcess 执行；语音包安装/管理和进程退出取消语义仍待继续细化。

`schedule-service` 保持 preload 的 `agent:list-schedules` 与 `agent:cancel-schedule` 参数和返回形状不变，两个 handle 均由可信 registrar 注册。服务不导入 Electron：主进程只注入用户数据目录、时钟/计时器、平台与应用路径、主动事件发布器、窗口广播器和承诺存储能力。正常启动顺序固定为 Windows 同步、到期 tick、今日议程、10 秒 timer；后台 schedule launch 跳过今日议程但仍按原产品语义保持后台实例。`start/stop/dispose` 均幂等，并发 tick 共享同一 Promise；跨 stop/start 的每轮启动持有独立 Promise，旧轮完成不会清掉新轮状态。stop 会清除 10 秒 timer 和所有 65 秒电源结果 timer，用生命周期 generation 抑制在途 tick 的后续通知、电源动作与延迟结果。若电源系统调用已在 stop 前开始，服务只能抑制后续发布，不能声称撤回已经交给 Windows 的操作。

`model-conversation-service` 拥有 `agent:chat`、DeepSeek 连通性和人物卡草稿 3 个 handle，并统一跟踪在途模型任务。它继续复用 `src-agent/core.js` 中已经验证的 Prompt/Token/记忆预算、工具循环、usage 缓存和按人物卡过滤的历史；流式 delta 由注入回调交给主进程广播。退出时 AbortSignal 会贯穿普通请求、流式请求、工具循环与连通性测试，服务等待在途调用收敛后移除 handler。主进程只保留聊天窗口占位消息、表情和窗口广播等 Electron 宿主表现。

`autonomous-creation-service` 拥有 10 个兴趣/创作/试玩/中断/清理 handle、5 分钟 tick、互斥任务、取消与退出收敛。每次任务开始即深拷贝人物卡 id/version/name 和完整 config，后续切卡不会污染在途创作、修复、试玩或反思。进度回调与任务完成都按任务身份校验，旧任务不能覆盖新状态；取消后不会发布 completed 主动事件。试玩记录以 activity id 共享 in-flight Promise，成功后进程内去重、失败允许重试，避免并发完成重复扣减 Token。小游戏 BrowserWindow/Session 仍由允许依赖 Electron 的 `game-playtest-runtime` 宿主创建，状态服务本身不导入 Electron。

日程 JSON 的所有 read-modify-write 按规范化 `baseDir` 串行，覆盖自然语言 executor、模型 tool、IPC 与 tick，避免并发覆盖。提醒到期时会在同一次原子写中记录 `completed` 和 `delivery.pending`；发送前持久化带 60 秒租约的 claim，通知成功后再标记 `delivered`。stop 或通知失败发生在发送前会释放回 pending，后续 start、tick 或 reconcile 会补投；旧版没有 delivery 字段的历史 completed 提醒视为已经投递，避免升级后重放。进程若恰在系统通知已发送、`delivered` 尚未落盘之间崩溃，租约过期后可能再次投递，这是持久化通知无法完全消除的 at-least-once 窗口。承诺回写以 reminder ID 共享 in-flight Promise，成功后进程内去重，失败则允许重试。执行中的电源计划取消会先调用 Windows abort，只有 abort 成功才持久化 `cancelled`；失败时保留 `executing`，IPC、自然语言和模型工具三条路径语义一致。Windows 注册失败和 `remove_failed` 会在后续同步重试，非 Windows 不写伪 integration 状态；遗留 `executing` 任务会恢复受跟踪的结果 timer，结果写回继续尊重已经取消的状态。主进程剩余的日程相关代码仅是服务装配、启动/second-instance tick、配置或聊天工具变更后的 adapter 调用、interest busy snapshot 查询和退出 dispose，不再包含 channel handler、timer 或 Windows/提醒业务编排。

## utilityProcess 迁移矩阵

| 工作 | 目标进程 | 原因与边界 |
| --- | --- | --- |
| RAG 扫描、分块、Embedding、索引写入 | utilityProcess（Phase 3 已接入生产） | 文件和网络工作独立，输入输出可序列化；主进程继续读取索引与执行检索 |
| 本地 STT/TTS 推理 | utilityProcess（Phase 4B 已接入）或专用 sidecar | 原生模块、CPU/内存峰值不应影响 UI 主线程；安装/管理路径仍待迁移 |
| GPT-SoVITS 服务启动与健康检查 | 独立服务进程；主进程监督 | 已是外部进程模型，重点是生命周期和崩溃恢复 |
| 小游戏策略生成、结果分析、反思 | utilityProcess | 纯模型/文本工作可迁移 |
| BrowserWindow 试玩驱动、Session 拦截、截图和输入 | 主进程 Electron 服务 | 依赖 BrowserWindow/WebContents/Session，不能直接作为普通 Node worker 处理 |
| 日程计算、记忆筛选、Token 预算 | 普通模块，必要时 worker | 当前计算轻量，先保持纯函数与可测试性 |

后台协议只传结构化可克隆数据，不传函数、BrowserWindow、Session、数据库连接或 AbortSignal。开发和打包均从主模块的 `import.meta.url` 推导 `electron/workers/utility-entry.js`，不依赖当前工作目录；`electron/**/*` 打包规则包含该入口。

同一个规范化 `baseDir` 的 RAG 写任务使用单一互斥队列：同类型请求共享 Promise；显式 rebuild 在正在执行的 ensure 之后排队，后续 ensure 遇到 rebuild 时复用 rebuild，避免两个任务同时写 `rag-index.json`。不同目录可以并行。最终索引先写同目录临时文件再 rename，主进程状态读取或检索不会看到半份 JSON。超时只拒绝调用方并发送 cancel，底层 RAG 当前不支持 AbortSignal，因此扫描、Embedding 和写文件不会被伪装成真正中止；worker 会抑制迟到业务结果，并在底层工作真实结束后发送取消完成确认。在此之前该目录锁保持占用，后续任务不得开始。若首次结果回传同步失败，worker 会暂存有界终态供 timeout cancel 换取完成确认；终态再次回传失败、超时或超限会让 worker 可观察退出。若父进程连 cancel 都无法发送，则 supervisor 进入 fail-closed：结果 Promise 及时失败，但 completion 与目录锁必须等该 worker 的 exit/error，kill 返回本身不视为停止。应用退出时 supervisor 永久关闭，排队任务不会再启动。

## 窗口与渲染器策略

- 常驻：桌宠、气泡。它们承担实时交互，关闭按钮继续表示隐藏或由应用托盘管理。
- 可释放：设置、缩放、输入框、完整聊天、代码、表情面板。现在首次打开时创建，关闭时销毁，下次重新创建。
- 游戏试玩：统一由 `game-playtest-service` 管理，每次任务创建隔离 renderer；调用方取消或应用退出会中止在途试玩，结束后销毁窗口并等待 Session 存储和缓存清理完成。
- 下一阶段应为不同窗口建立独立渲染入口，至少先拆出 `settings`、`code` 和 `pet/live2d`，避免每个窗口加载完整 `App.tsx`。

## Phase 5A：Electron 32 到 33 升级记录

Phase 5A 只完成一个变量：Electron 依赖从 32.3.0 升级到精确锁定运行的 `33.4.11`。Electron 33 本身也不是最终停留目标，只是从已停止支持版本迈向受支持版本的过渡检查点；后续仍需按大版本继续升级。

已验证运行时矩阵：

| 项目 | 结果 |
| --- | --- |
| Electron | `33.4.11` |
| Node | `20.18.3` |
| Chromium | `130.0.6723.191` |
| modules / ABI | `130` |

新增 `npm run verify:electron` 启动真实 Electron 主进程，并在 `utilityProcess` 中加载 `sherpa-onnx-node`，同时校验主进程和 worker 的 Electron/Node/Chromium/modules 版本，以及 `OfflineTts` 与 `OfflineRecognizer` 导出。脚本使用 CommonJS，避免 Electron 脚本模式下 ESM 加载挂起；Windows 下的 crypto/GPU 警告不影响退出码，脚本已禁用硬件加速。

Phase 5A 已完成的门禁：

1. `npm run verify`：架构审计通过、249/249 测试通过、Vite 生产构建通过。
2. `npm run verify:electron`：真实 Electron 33 运行时与原生语音模块加载检查通过。
3. `npm run pack`：Electron 33 `--dir` 打包成功，输出 `win-unpacked`。
4. 包布局检查：asar 内包含 `electron/main.js`、`electron/preload.cjs`、`electron/workers/utility-entry.js`、`dist/**`、`src-agent/**` 和 `package.json`；`app.asar.unpacked` 中 `sherpa-onnx-win-x64` 包含 `sherpa-onnx.node`、`onnxruntime.dll`、`sherpa-onnx-c-api.dll`、`sherpa-onnx-cxx-api.dll` 和 `onnxruntime_providers_shared.dll`。`package-lock.json` 按当前打包清单不进入应用 asar，安装完整性由本地安装与打包前依赖检查保障。

仍需人工或发布前完成的检查：NSIS 干净安装、覆盖升级与卸载；透明窗口多屏/DPI/置顶/拖拽/鼠标穿透；Live2D 加密资源与中文路径；真实 TTS/STT 模型推理；游戏试玩与协议拦截；以及升级后的启动时间、renderer 数量和内存记录。

本阶段明确不包含普通 IPC handler/listener 迁移，也不包含设置、代码、聊天等 renderer 独立入口拆分。这些工作应在 Electron 版本阶梯稳定后另开阶段执行。

## Phase 5B：Electron 33 到 43 升级记录

Phase 5B 按大版本逐级执行 `33 -> 34 -> ... -> 43`，没有跳过任何失败或未验证的大版本。每个大版本独立提交，并在提交前运行同一组自动化门禁。`43.4.0` 是本轮确认的当前受支持稳定目标，不是 EOL 过渡点。

### 版本矩阵与提交

| Electron | Node | Chromium | modules / ABI | 提交 |
| --- | --- | --- | --- | --- |
| 33.4.11 | 20.18.3 | 130.0.6723.191 | 130 | `f7b7321` |
| 34.5.8 | 20.19.1 | 132.0.6834.210 | 132 | `1b68bb1` |
| 35.7.5 | 22.16.0 | 134.0.6998.205 | 133 | `7811398` |
| 36.9.5 | 22.19.0 | 136.0.7103.177 | 135 | `ffbea28` |
| 37.10.3 | 22.21.1 | 138.0.7204.251 | 136 | `d2d5b24` |
| 38.8.6 | 22.22.0 | 140.0.7339.249 | 139 | `49d1570` |
| 39.8.10 | 22.22.1 | 142.0.7444.265 | 140 | `ae3c383` |
| 40.10.6 | 24.15.0 | 144.0.7559.236 | 143 | `ee40358` |
| 41.10.5 | 24.18.0 | 146.0.7680.216 | 145 | `093fa7a` |
| 42.9.1 | 24.18.1 | 148.0.7778.280 | 146 | `cbbb6b0` |
| 43.4.0 | 24.18.1 | 150.0.7871.224 | 148 | `078a618` |

Electron 40 的 npm 包把下载栈迁到 `@electron/get` 5，并通过 `@electron-internal/extract-zip` 取代旧的 `extract-zip` 依赖链；`@types/node` 随包元数据进入 24 系列。Electron 42 开始，npm 包不再声明旧 `postinstall`，改为提供 `install-electron` / `node_modules/electron/install.js` 入口，因此干净安装后必须显式执行该入口或等价打包器下载步骤，不能只检查 npm 退出码。

### 每级通过的门禁

以上每个大版本均通过：

1. `npm run verify`：架构审计 0 critical、249/249 测试通过、Vite 生产构建通过。
2. `npm run verify:electron`：真实 Electron 主进程与 `utilityProcess` 的 Electron/Node/Chromium/modules 版本一致，且 `sherpa-onnx-node` 可加载，`OfflineTts` 与 `OfflineRecognizer` 导出存在。
3. `npm run pack`：Windows x64 `--dir` 打包成功。
4. asar 布局：`electron/main.js`、`electron/preload.cjs`、`electron/workers/utility-entry.js`、`dist/index.html`、`src-agent/core.js`、`package.json` 均在应用 asar 内。
5. unpacked 原生布局：`sherpa-onnx-win-x64` 中包含 `sherpa-onnx.node`、`onnxruntime.dll`、`sherpa-onnx-c-api.dll`、`sherpa-onnx-cxx-api.dll`、`onnxruntime_providers_shared.dll`。

打包仍输出的非致命警告包括：传递依赖重复引用、非 Windows sherpa 可选平台包未进入 Win x64 包、缺少 `sherpa-onnx-win-ia32`、缺少 author 元数据、默认 Electron 图标以及 signtool 签名提示。这些警告在本阶段未改变应用退出码或布局断言结果。

### 剩余人工发布门禁

自动化冒烟不能替代真实桌面与安装器检查。发布前还需要完成：

1. NSIS 干净安装、覆盖升级与卸载，并确认用户数据保留策略。
2. 透明窗口多显示器、DPI 缩放、置顶、拖拽和鼠标穿透测试。
3. Live2D 加密资源与中文路径加载。
4. 真实 TTS/STT 模型推理与语音包安装、切换、缓存失效。
5. 游戏试玩、模拟输入、截图、取消与协议联网拦截。
6. 记录启动时间、空闲内存、逐窗口打开后的 renderer 数量和峰值内存。

本阶段只升级 Electron 运行时、锁定运行时冒烟矩阵和记录验证证据，不包含普通 IPC handler/listener 迁移、renderer 独立入口拆分、窗口宿主重构或其他依赖升级。Phase 5B 结束时主进程仍保留 55 个直接 IPC handler、3 个直接 IPC listener 和单一 React renderer 入口；这些拆分应作为后续独立阶段处理。

## Phase 5D：设置、人物卡与 Live2D IPC 拆分记录

Phase 5D 只拆分主进程 IPC，不改变 Electron 依赖版本，不拆分 renderer 入口，也不调整 `electron/preload.cjs` 暴露的方法、channel、参数形状和返回形状。主进程继续负责 BrowserWindow 广播、`vivi-model://` 协议、窗口表现副作用和 Electron Shell 打开目录；领域状态与 handler 移入服务。

新增三个服务：

| 服务 | 负责 channel | 边界 |
| --- | --- | --- |
| `electron/services/settings-service.js` | `agent:get-bootstrap`、`agent:get-startup-status`、`agent:save-config`、`agent:test-astrbot`、`agent:get-relationship-profile`、`agent:reset-relationship-profile` | 读写配置、启动状态、bootstrap 汇总、AstrBot 连通性和关系档案；窗口副作用通过注入回调执行 |
| `electron/services/persona-card-service.js` | `agent:list-persona-cards`、`agent:create-persona-card`、`agent:update-persona-card`、`agent:activate-persona-card`、`agent:archive-persona-card`、`agent:restore-persona-card` | 人物卡 CRUD、激活状态和 runtime persona 应用；配置广播通过回调注入 |
| `electron/services/live2d-model-service.js` | `agent:get-live2d-models`、`agent:refresh-live2d-models`、`agent:open-live2d-models-folder` | 内置模型元数据、自定义 `.model3.json` 扫描、模型根映射、无效选择修复、目录 watcher 与防抖；打开目录由宿主回调执行 |

三个服务都接收注入的 `createTrustedIpcRegistrar` 结果，注册失败会回滚已注册 channel，并提供 `start/stop/dispose/snapshot`。它们不导入 Electron、不持有 BrowserWindow；`settings-service` 通过 `persona-card-service` 应用 active persona，避免 bootstrap 与保存配置使用两套语义。启动顺序为设置/人物卡服务先启动，Live2D 扫描完成后再挂载目录 watcher；退出时与日程、自主创作、模型会话等服务一起 dispose。

Live2D 启动使用共享 `startPromise`，并发调用复用同一次扫描，只有刷新和 watcher 创建都成功后才进入 started 状态；扫描、配置保存或 watcher 创建失败会保留可重试的未启动状态。停止与释放通过 lifecycle generation 作废旧扫描，并在移除 IPC handler 前等待在途刷新/保存安全收敛；迟到提交不会更新模型与配置状态，也不会触发配置或模型广播。主进程退出装配将该 dispose Promise 纳入 shutdown 汇总并等待完成。

本阶段迁移 15 个直接 `ipcMain.handle`。`electron/main.js` 从 2434 行降到 2243 行，直接 IPC handler 从 55 降到 40，直接 IPC listener 保持 3；架构审计新增 Phase 5D 服务文件、可信 IPC、生命周期、Electron-free 和 main 回流门禁。

生命周期复查后运行 `npm run verify`：架构审计 0 critical、265/265 测试通过、Vite 生产构建通过。

## Phase 5E：剩余主进程 IPC 拆分记录

Phase 5E 只拆分主进程 IPC，不改变 Electron 依赖版本，不拆分 renderer 入口，也不调整 `electron/preload.cjs` 暴露的方法、channel、参数形状和返回形状。`electron/main.js` 保留应用启动、窗口宿主、托盘、协议、Electron Shell/dialog/screen adapter 和服务装配；常规业务状态与 IPC 注册迁入服务。

新增九个服务和共享生命周期运行时：

| 服务 | 负责 channel | 边界 |
| --- | --- | --- |
| `electron/services/system-resource-service.js` | 自动启动读写、本地文件搜索、应用注册表读取/刷新、系统资源快照，共 6 个 handle | Electron 自动启动能力由注入回调执行；搜索和注册表复用 Agent 纯领域模块 |
| `electron/services/file-manager-service.js` | 文件管家快照、目录扫描、整理预览/执行、操作列表与撤销，共 6 个 handle | 只依赖 safe-file-manager 领域模块与注入的 baseDir；不接触窗口 |
| `electron/services/host-shell-service.js` | 外部链接、数据路径、打开数据目录、定位人物卡数据库，共 4 个 handle | 服务校验外部 URL 并计算路径；`shell.openExternal/openPath/showItemInFolder` 由宿主回调注入 |
| `electron/services/companion-life-service.js` | 触碰互动、生活状态读取、暂停主动行为、重置工作节律，共 4 个 handle | 关系/生活引擎留在 Agent 领域模块；聊天、关系、情绪广播通过回调注入 |
| `electron/services/window-intent-service.js` | 设置、输入、聊天、代码、缩放、表情窗口打开意图，共 6 个 handle | 服务只路由意图并记录快照；BrowserWindow 创建与聚焦由宿主回调执行 |
| `electron/services/code-workspace-service.js` | 代码文件列表/读写、工作区选择，共 4 个 handle | 工作区边界由 `code-executor` 保持；目录选择 dialog 由注入 adapter 执行 |
| `electron/services/expression-chat-state-service.js` | 手动表情切换/清除、聊天状态读取，共 3 个 handle | 服务保留原互斥表情语义；状态与广播通过回调注入 |
| `electron/services/pet-window-layout-service.js` | 宠物缩放/锁定/位置/布局、气泡尺寸 7 个 handle，以及鼠标穿透和右键菜单 2 个 listener | screen/workArea、窗口 bounds、鼠标穿透和菜单由宿主回调注入；服务校验事件发送方后只操作注入状态 |
| `electron/services/renderer-ready-service.js` | `agent:renderer-ready` 1 个 listener | 只接受 pet payload，并驱动注入的启动状态释放回调 |

`trusted-domain-ipc-service` 统一提供 `registerIpc/start/stop/dispose/snapshot`：注册 listener 后注册 handler，任一注册失败会回滚已注册 channel；stop/dispose 幂等清理 listener 与 handler；未启动或已释放时 handler 拒绝执行。九个业务服务都不导入 Electron、不持有 BrowserWindow，也不接收原始 `ipcMain`。

本阶段迁移 40 个直接 `ipcMain.handle` 和 3 个直接 `ipcMain.on`。`electron/main.js` 从 2243 行降到 2035 行；架构审计指标为 Phase 5E 服务 9/9、channel 所有权 43/43、`directMainIpcHandlers=0`、`directMainIpcListeners=0`。`tests/phase5e-domain-services.test.js` 覆盖共享运行时回滚/幂等退出、可信边界、代表性参数转发、返回形状、事件发送方检查和 listener 清理。

最终验证：`npm run verify` 通过，包含架构审计 0 critical、281/281 测试通过和 Vite 生产构建；`npm run verify:electron` 通过 Electron 43.4.0 / Node 24.18.1 / Chromium 150.0.7871.224 / modules 148 与原生语音导出检查；`npm run pack` 通过并输出 Windows x64 `win-unpacked`。默认 Electron 下载源曾因 `fetch failed` 需要切换 mirror，镜像下载后冒烟通过。

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

该命令会输出 Electron 版本、主文件行数、直接 IPC 数、窗口数、Agent 核心是否重新直接导入 Electron、安全窗口配置、preload 状态，以及 utilityProcess/RAG、schedule-service、Phase 4C、Phase 5D 和 Phase 5E 迁移指标。RAG 门禁要求 worker 入口存在并进入生产打包、主进程不直接调用写索引函数、启动/memory-service/app-executor/tool-executor 四条写路径全部注入后台 adapter。日程门禁要求服务文件、可信 IPC、`start/stop/tick/snapshot` 生命周期和聊天工具 adapter 同时存在，并把日程 channel、timer 状态或 Windows/提醒具体编排回流主文件视为 critical。Phase 4C 门禁要求模型与自主创作服务存在、使用可信 IPC、持有人物卡快照和退出生命周期、禁止直接导入 Electron，并将 13 个 channel 或旧状态机回流 main、main 超过 2500 行视为 critical。Phase 5D 门禁要求设置、人物卡和 Live2D 服务存在、使用可信 IPC、具备 `start/stop/dispose/snapshot` 生命周期、禁止直接导入 Electron，并把 15 个 channel 回流 main 视为 critical。Phase 5E 门禁要求九个服务文件、main 装配、可信 IPC、共享生命周期/回滚运行时和 43 个 channel 所有权完整，禁止服务导入 Electron，并把任何主文件直接 handler/listener 或 Phase 5E channel 回流视为 critical。审计同时会独立统计全部 `new BrowserWindow(` 调用，再逐个配对调用参数；只认可第一个参数是可静态分析的对象 literal，且真实属性路径为 `webPreferences.preload: PRELOAD_PATH`。变量 options、第二参数或顶层/metadata preload 诱饵、动态 spread/computed 属性，以及任何无法静态确认的窗口都会作为 critical。preload 或 utility worker 被生产清单排除也会直接失败。API 表面、代表性参数转发与事件解绑另由 `tests/preload.test.js` 固化；审计规则的绕过场景由 `tests/electron-architecture-audit.test.js` 固化；其余尚待拆分的结构问题继续作为 warning 展示。

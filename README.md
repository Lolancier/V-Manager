# V-Manager

一个面向 PC 端的桌面 Agent 应用，以 Live2D 桌宠形象为载体，通过 DeepSeek 大模型实现自然对话，并具备真实系统操作能力。

> 当前版本：**0.9.2**（个人本地开发版）

## 核心能力

### 对话与记忆
- 可自定义角色人设和系统提示词
- 双模型意图路由：日常聊天走独立快速模型，电脑操作和代码任务走复杂任务模型
- 流式对话（边生成边显示）
- 长回复按 1-2 句拆分为连续气泡，按顺序完整展示
- 聊天栏每条助手回复支持按需语音播放，重复内容优先读取本地音频缓存
- 本地 Whisper 语音听写：静音自动结束，识别结果回填输入框后由用户确认发送
- 多轮对话记忆（最大消息数可配置，默认 40 条）
- 记忆自动压缩：超阈值时提取偏好、事实、承诺、决策 → 写入知识库
- 本地关系引擎：情绪衰减、互动情感判断、好感阶段成长与 Prompt 语气联动
- 轻触 Live2D 模型可触发本地动作和分阶段互动台词，点击与窗口拖拽互不干扰
- 本地主动陪伴引擎：感知连续工作与系统空闲，管理 Vivi 精力、自主休息、健康关怀、安静时段和每日打扰上限
- 主动关怀可联动桌面气泡、Live2D 情绪和 Windows 系统通知，并支持“今天不要再提醒”与手动重置工作会话

### 本地工具（Function Calling）
通过 OpenAI 兼容的 function calling，复杂任务模型可主动调用本地工具，并按当前意图只注入相关工具集合：

| 类别 | 工具 | 说明 |
|---|---|---|
| **系统** | `get_system_resources` | CPU、内存、进程快照 |
| | `get_disk_space` | 指定盘符磁盘空间 |
| | `check_process_running` | 检查进程是否运行 |
| | `kill_process` | 终止进程（需确认） |
| | `list_running_apps` | 可见窗口列表 |
| **提醒与计划** | `create_reminder` | 创建本地定时提醒 |
| | `list_schedules` | 查看未完成提醒和电源计划 |
| | `update_reminder` | 修改提醒时间或内容并同步系统计划 |
| | `cancel_schedule` | 取消计划 |
| | `create_power_action_draft` | 创建待确认的定时关机/重启草稿 |
| | `confirm_power_action` | 使用严格的当前消息确认电源计划 |
| **应用** | `launch_application` | 启动应用 |
| | `find_application` | 查应用安装入口 |
| | `refresh_app_registry` | 刷新应用注册表 |
| **文件** | `list_directory` | 列目录 |
| | `read_text_file` | 读取文本文件 |
| | `open_file_or_folder` | 打开文件/文件夹 |
| | `create_folder` | 创建文件夹 |
| | `create_text_file` | 创建文本文件 |
| | `append_to_file` | 追加文本 |
| | `delete_file_or_folder` | 移入 Windows 回收站（需确认） |
| | `search_files` | 文件名搜索 |
| | `scan_managed_directory` | 只读扫描下载、桌面或指定目录 |
| | `preview_file_organization` | 生成按类型/日期归档或隔离预览 |
| | `execute_file_organization` | 精确确认后执行预览中的移动 |
| | `list_file_operations` | 查看文件管家操作日志 |
| | `undo_file_operation` | 撤销最近或指定的归档/隔离操作 |
| **知识** | `search_knowledge_base` | 检索本地知识库 |
| | `get_rag_status` | 索引状态 |
| | `rebuild_rag_index` | 重建索引 |
| **工作区** | `list_workspace` | 列工作目录 |
| | `switch_workspace` | 切换工作目录 |
| **代码代理** | `search_workspace_code` | 搜索工作区代码，返回文件、行号与上下文 |
| | `read_workspace_code` | 读取工作区内的代码或配置文件 |
| | `apply_workspace_patch` | 精确替换已有文件中的文本片段（需确认） |
| | `create_workspace_file` | 创建工作区内的新文件（需确认） |
| | `write_workspace_code` | 带并发保护地更新完整文件内容 |
| | `run_workspace_command` | 运行受限开发命令（需确认） |
| **角色表现** | `set_mood` | 设置 Live2D 情绪与面部表现 |

常用操作（"启动QQ"、"关闭网易云"、"网易云还在吗"、"打开桌面"）走本地快速路径，不经过 LLM。应用别名会映射到真实进程名，关闭时先请求正常退出，再按 PID 清理残留并复查。

### 安全文件管家

- 扫描下载、桌面或用户明确指定的非磁盘根目录，读取文件名、类型、大小与修改时间，不在扫描阶段改变文件。
- 整理必须先生成持久化预览；按类型归档到 `Vivi整理/类型`，按日期归档到 `Vivi整理/YYYY-MM`，隔离则进入当前目录的 `.Vivi隔离区`。
- 执行前会复查文件大小和修改时间；预览后发生变化的文件会让整批操作停止，移动中失败则自动回滚已经完成的部分。
- 归档与隔离写入本地操作日志并支持一键撤销。普通“删除”只会调用 Windows 回收站，代码中不再提供直接永久删除路径。

### 深层陪伴记忆

- 本地 `companion-memory.json` 分别保存事实、近期经历、习惯和承诺，重复内容会合并计数。
- 未完成承诺可在后续日期触发一次自然回访；用户表达“完成了/交了/做完了”后会尝试关闭相关承诺。
- Vivi 仅在上一条确实是主动消息时学习“忽略、稍后、喜欢”反馈，并形成 0–100% 打扰评分。评分越高，主动频率越低、冷却越长。
- 主动表达会结合本地时间、关系阶段、近期记忆和最近用过的台词选择不同变体，避免连续重复。设置页可查看四类记忆数量和反馈统计；“清空记忆”也会一并清空深层陪伴记忆。

### 人物卡与稳定人格

- 人物卡支持身份、自称、对用户称呼、关系、价值观、性格、表达习惯、背景设定、COS、示例台词和模型/声线绑定。
- 可在设置中创建、修改、切换、归档和恢复人物卡；每次修改生成独立版本，历史对话仍保留当时使用的人物卡版本。
- 人格信息会在模型调用前稳定注入，但不能覆盖工具事实、安全规则和本地权限边界。
- 原始对话、短期上下文、人物卡版本和运行状态保存到本地 SQLite；长期知识仍通过知识文件与 RAG 检索补充。

### 免费本地语音与 GPT-SoVITS

- 支持 Sherpa-ONNX 本地离线语音、GPT-SoVITS 高质量角色声线，以及可选的 ElevenLabs API。
- GPT-SoVITS 支持达妮娅 v2ProPlus 配置、模型完整性检查、手动启动/关闭和随 V-Manager 启动。
- 关闭语音服务会释放模型内存；完全退出 V-Manager 时也会停止 GPT-SoVITS，不让 Python 模型常驻后台。
- 语音只朗读角色真正说出口的内容，括号动作和内心描写会被过滤；音频采用有限缓存，旧文件会自动清理。
- 播放期间使用实际音频振幅驱动 Live2D 口型，自动朗读失败会进入冷却，避免反复拉起服务。

### Vivi 的私密空间

- 独立兴趣沙盒默认关闭，可选择仅写日记、允许创作或允许预览作品，并设置每日任务、Token、时长、磁盘、空闲时段和联网范围。
- 支持每日单篇日记、SVG 绘画和离线网页小游戏；同一天重复写日记会更新同一文件，不产生多份日记。
- 日记在当日启动并运行 2–3 小时后生成，不主动弹窗打扰；用户可以询问，也可以从设置中打开私密空间查看。
- 自主创作只在主人任务完成、Agent 无其他事务且电脑达到空闲条件时发生；被交互打断时可选择等待或终止，之后满足条件可继续。
- 天气使用 Windows 自动定位，外部参考来源按权限限制；小游戏和 SVG 经过内容过滤，作品不会接触普通用户文件。

### 本地日程与 Windows 通知

- 所有提醒和长期安排统一保存在本机 `agent-data/schedules.json`，应用退出、系统重启或电脑关机都不会丢失。
- 支持“30 分钟后提醒我喝水”“8 月 20 日下午 3 点提醒我复诊”“2026-12-31 晚上 8 点提醒我总结”等相对时间和明确日期。
- 每个已确认计划都会注册为当前 Windows 用户的单次任务计划。即使从托盘彻底退出 V-Manager，到点后 Windows 仍会在后台唤起它并显示系统通知。
- V-Manager 正常启动时会读取本地日程表；如果当天有尚未完成的事项，Vivi 会汇总今日安排并继续按时提醒。
- 修改提醒会覆盖更新同一个 Windows 任务，取消或完成后会移除对应任务。定时关机和重启只有经过精确二次确认后才会注册，并保留 60 秒系统倒计时和撤销入口。

### RAG 向量检索
- 文件扫描 + 文本切片（chunkSize 800, overlap 120）
- Embedding API 集成（默认 SiliconFlow / BAAI-bge-m3），设置面板可配
- 向量相似度检索（余弦相似度），失败自动降级关键词 → 文件扫描
- 检索模式可控（auto / keyword_only）

### 桌面壳
- Live2D 模型渲染（Hiyori），支持触摸交互
- 透明无边框窗口，可拖拽，常驻置顶
- Windows 系统托盘后台常驻：显示/隐藏桌宠、打开聊天/代码/设置，并支持开机自动启动和明确退出
- 气泡式对话浮窗（10 秒自动淡出）
- 二次元陪伴工作台：Live2D 角色舞台、关系状态、快捷对话与聊天记录同屏
- 独立设置窗口、快速输入窗口、模型缩放窗口
- 独立代码工作台：文件树、直接编辑、终端式对话，共享日常聊天记忆
- Vivi Code 提供自动、问答、规划、Agent、审查五种模式；代码任务仍保留角色语气
- 双阶段 Live2D 反应：本地预反应先反馈，模型结果再驱动最终情绪与动作
- 鼠标注视可跨模型窗口范围持续跟随，并可从桌宠菜单快速开关
- Live2D 性能控制：15/24/30/45/60 FPS 可选，待机自动节能，窗口隐藏后暂停渲染与鼠标跟踪

## 当前项目状态

`0.9.2` 已完成本地日程与 Windows 后台通知、安全文件管家、深层陪伴记忆、人物卡、免费本地语音、GPT-SoVITS 角色声线和 Vivi 私密空间。当前版本面向个人 Windows 设备使用，重点是本地持久化、权限可控和退出后正确释放资源；逐项开发记录见 [CHANGELOG](CHANGELOG.md)。

## 技术架构

```
Electron（桌面壳）
  ├── main.js              IPC 桥接 + 多窗口管理
  └── preload.cjs           Electron 安全桥接接口

React + Vite（界面层）
  └── src/App.tsx           6 种视图模式（pet/settings/scale/composer/chat/bubble）

Agent Core（Node.js）
  ├── core.js               主协调层：buildAgentReply + 配置/记忆/DeepSeek
  ├── tools.js              26 个工具定义（OpenAI function calling 格式）
  ├── tool-executor.js      工具调度器
  ├── memory-compressor.js  记忆压缩（偏好/事实/承诺/决策 → 知识库）
  ├── router.js             意图路由 + executor 链调度
  ├── rag.js                RAG 索引构建与检索
  ├── app-registry.js       应用注册表（内置预设 + PowerShell 扫描 + 快捷方式发现）
  ├── runtime-paths.js      数据路径解析
  ├── shared/
  │   └── utils.js          统一工具函数（路径、文本、CSV 解析等）
  └── executors/
      ├── app-executor.js   应用启动/定位/状态检测/关闭
      ├── file-executor.js  文件操作/搜索
      └── system-executor.js 系统资源/进程/磁盘

DeepSeek API
  └── /v1/chat/completions  流式对话 + function calling
```

## 构建与打包

```powershell
# 开发模式
npm run dev

# 仅构建前端
npm run build

# 生成免安装目录 ../V-Manager-builds/win-unpacked
npm run pack

# 生成 Windows 安装包
npm run dist
```

生产环境由 Electron 通过 `file://` 加载前端入口，Vite 使用相对 bundle 路径；Cubism Core、内置 Live2D 模型和 Shader 通过受限的 `vivi-asset://` 协议读取安装包内资源，避免开发模式正常但安装后空白的问题。

打包产物默认放在项目同级的 `V-Manager-builds` 目录，避免编辑器、Codex 或文件索引服务锁定项目内的 `app.asar`。重新打包前仍需退出从 `win-unpacked` 启动的 V-Manager。

### 消息联动（后续路线）

AstrBot、微信代发、消息读取与自动回复暂不作为当前版本的正式能力。已有实验代码与配置会保留，方便后续继续验证，但产品界面统一标记为“待开发”，本阶段不承诺可用性。设计记录见 [AstrBot 联动说明](docs/astrbot-weixin.md)。

### EchoBot 参考说明

0.7 的陪伴工作台参考了 [KdaiP/EchoBot](https://github.com/KdaiP/EchoBot) 的“角色舞台 + 对话控制区”信息架构与任务状态表达。V-Manager 保留自己的 Electron、React、Agent Core 与现有 Live2D 资源，没有引入 EchoBot 的角色模型或背景素材；EchoBot 源码采用 MIT License。

## 数据流

```
用户输入
  → 意图路由
    → 日常聊天：deepseek-v4-flash 单次流式响应，不注入工具
    → keyword executor 链（workspace → app → file → system）
      → 命中：显示执行状态并直接返回本地结果
      → 未命中：复杂任务模型 + 当前意图相关工具
       → LLM 决策：调哪些工具、调几次（代码 Agent 最多 12 轮）
      → 工具结果入对话记忆（含 toolCalls + toolResults）
      → 流式生成最终回复
  → 记忆压缩检查（超过 maxMessages × 1.5 触发）
    → 最旧消息 → DeepSeek 结构化提取 → 写入 knowledge/
```

## 目录结构

```
.
├── electron/                  Electron 主进程
│   ├── main.js
│   ├── preload.cjs
│   └── preload.js
├── src/                       React 界面
│   ├── main.tsx
│   ├── App.tsx
│   ├── styles.css
│   └── pet/                   Live2D 渲染
├── src-agent/                 Agent 核心
│   ├── core.js                主协调层（~620 行）
│   ├── tools.js               工具定义
│   ├── tool-executor.js       工具调度
│   ├── memory-compressor.js   记忆压缩
│   ├── router.js              路由
│   ├── rag.js                 RAG
│   ├── app-registry.js        应用注册表
│   ├── workspace-executor.js  工作区
│   ├── code-executor.js       代码检索、精确修改与受限命令执行
│   ├── runtime-paths.js       路径
│   ├── shared/utils.js        工具函数
│   └── executors/             
│       ├── app-executor.js
│       ├── file-executor.js
│       └── system-executor.js
├── data/                      示例配置
├── assets/                    静态资源
├── third_party/               Live2D Cubism SDK
└── agent-data/                运行时数据（自动生成）
    ├── config.json            当前设置
    ├── profile.json           情绪、好感度、关系阶段与互动统计
    ├── memory/
    │   └── conversation.jsonl 对话记忆
    ├── knowledge/             知识库（含记忆压缩产物）
    ├── rag/                   RAG 索引
    ├── registry/              应用缓存
    └── vivi-sandbox/          Vivi 自主兴趣独立空间
        ├── diary/             每日日记（Markdown）
        ├── drawings/          安全过滤后的 SVG 绘画
        ├── games/             强制离线的静态小游戏
        └── activity.jsonl     自主活动与失败记录
```

## 运行方式

```bash
npm install
npm run dev
```

启动后在 `agent-data/knowledge/` 下自动生成：
- `persona.md`：默认人设
- `memory-{date}.md`：每日记忆压缩
- `profile.md`：长期用户档案

## 设置项

| 设置 | 默认值 | 说明 |
|---|---|---|
| 角色名称 | Vivi | 桌宠名称 |
| 系统提示词 | — | 自定义人设指令 |
| DeepSeek API Key | — | 必填 |
| Base URL | api.deepseek.com/v1 | 可切换代理 |
| 日常对话模型 | deepseek-v4-flash | 单次流式回复，不携带工具定义 |
| 复杂任务模型 | deepseek-v4-pro | 电脑操作、代码与工具调用 |
| 最大消息数 | 40 | 上下文窗口大小（10-100） |
| 检索条数 | 3 | RAG 每次召回知识片段数（1-10） |
| 语音提供方式 | 本地离线 | 可切换 Sherpa-ONNX 本地语音或 ElevenLabs API |
| 本地语音包 | Zh-LL | 约 115 MB，包含 5 个中文音色，首次使用按需下载 |
| ElevenLabs API Key | — | 仅切换到 ElevenLabs 时需要 |
| 语音模型 | eleven_v3 | 可切换 Multilingual v2 / Flash v2.5 |
| 默认音色 | Lily | 内置 21 个官方预置音色，也可读取账号音色或填写 Voice ID |
| V3 稳定度 | Natural | 可切换 Creative / Natural / Robust |
| 本地听写模型 | Small Q5 | 可切换 Base Q5；运行时和模型按需安装到应用数据目录 |
| 关系成长 | 开启 | 本地计算情绪与好感阶段；可隐藏进度或完全停用 |

“语音与 ASMR”设置页默认使用免费的 Sherpa-ONNX 本地 TTS。语音包安装在 `%APPDATA%\v-manager\agent-data\tts-models`，安装完成后合成过程无需联网。人物卡可以填写 `语音包ID:音色ID`，例如 `sherpa-zh-ll:2`，从而在切换角色时同步切换声线。

ElevenLabs 仍作为可选的高表现力提供商。V3 会使用 `[whispers]` 音频标签生成耳语；本地 VITS 会过滤这些专用标签，并使用普通语音合成。长文本在两种提供商下都会按句切片并顺序播放。

高质量角色声线可选择 GPT-SoVITS。本项目已收录 ModelScope 的“达妮娅 v2ProPlus”档案，下载时校验 GPT 权重、SoVITS 权重和参考音频；推理由独立的 GPT-SoVITS `api_v2.py` 服务完成。出于隐私考虑，应用只允许连接 `127.0.0.1`、`localhost` 或 `::1`，不会把角色音频和回复文本发送到远程 GPT-SoVITS 服务。

语音输入不调用云端 API。应用通过 `whisper.cpp` 在本机处理 16kHz 单声道录音，模型存放在 `%APPDATA%\v-manager\agent-data\stt-models`，临时录音在识别结束后删除。

## Live2D 模型导入

用户模型目录：`%APPDATA%\v-manager\agent-data\models`

每个模型应保留完整文件夹结构，至少包含 `.model3.json`、其引用的 `.moc3` 和纹理文件：

```text
models/
└── MyModel/
    ├── MyModel.model3.json
    ├── MyModel.moc3
    └── textures/
        └── texture_00.png
```

应用会在启动和目录变化时自动扫描，也可在“设置 → 个性化 → Live2D 模型”中打开目录或手动重新扫描。

## 项目定位

日常二次元赛博陪伴 + 电脑助手辅助。核心方向：向着更拟人化、更真实的桌面伴侣发展——情绪感知、好感成长、语音互动、Live2D 神态联动。

## 版本路线

| 版本 | 目标 | 状态 |
|---|---|---|
| **0.1.0** | 桌面 Agent 完整底座：对话记忆、21 个本地工具、RAG 向量检索、Live2D 桌宠壳 | ✅ 完成 |
| **0.2.0-0.2.2** | Live2D 表情联动、LLM mood/face 工具调用、自动张嘴动画 | ✅ 完成 |
| **0.3.0** | 代码代理：工作区搜代码、改文件、跑命令（写入与命令需确认） | ✅ 完成 |
| 0.4.0 | Live2D 皮肤换壳：多模型加载、皮肤切换、模型配置化 | ✅ 完成 |
| **0.5.0** | 语音全链路：STT 语音输入 + TTS 语音输出（含 ASMR 耳语）+ Live2D 口型同步 | ✅ 完成 |
| **0.6.0** | 人设引擎：情绪计算 + 好感度系统（核心方向） | ✅ 完成 |
| **0.7.0** | 陪伴工作台、双阶段表情、多模型适配与角色化代码 Agent | ✅ 完成 |
| **0.8.0** | 主动陪伴、本地日程、Windows 后台通知与安全文件管家 | ✅ 完成 |
| **0.9.0** | 深层拟人化、人物卡、稳定记忆与 Vivi 私密空间 | ✅ 完成 |
| **0.9.1** | 本地离线 TTS、GPT-SoVITS 角色声线与语音缓存/口型优化 | ✅ 完成 |
| **0.9.2** | 启动加载流程、语音服务生命周期与设置界面整理 | ✅ 当前版本 |

详见 [CHANGELOG.md](./CHANGELOG.md)。

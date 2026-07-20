# V-Manager

一个面向 PC 端的桌面 Agent 应用，以 Live2D 桌宠形象为载体，通过 DeepSeek 大模型实现自然对话，并具备真实系统操作能力。

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

### 本地工具（Function Calling）
通过 OpenAI 兼容的 function calling，复杂任务模型可主动调用 26 个工具，并按当前意图只注入相关工具集合：

| 类别 | 工具 | 说明 |
|---|---|---|
| **系统** | `get_system_resources` | CPU、内存、进程快照 |
| | `get_disk_space` | 指定盘符磁盘空间 |
| | `check_process_running` | 检查进程是否运行 |
| | `kill_process` | 终止进程（需确认） |
| | `list_running_apps` | 可见窗口列表 |
| **应用** | `launch_application` | 启动应用 |
| | `find_application` | 查应用安装入口 |
| | `refresh_app_registry` | 刷新应用注册表 |
| **文件** | `list_directory` | 列目录 |
| | `read_text_file` | 读取文本文件 |
| | `open_file_or_folder` | 打开文件/文件夹 |
| | `create_folder` | 创建文件夹 |
| | `create_text_file` | 创建文本文件 |
| | `append_to_file` | 追加文本 |
| | `delete_file_or_folder` | 删除（需确认） |
| | `search_files` | 文件名搜索 |
| **知识** | `search_knowledge_base` | 检索本地知识库 |
| | `get_rag_status` | 索引状态 |
| | `rebuild_rag_index` | 重建索引 |
| **工作区** | `list_workspace` | 列工作目录 |
| | `switch_workspace` | 切换工作目录 |
| **代码代理** | `search_workspace_code` | 搜索工作区代码，返回文件、行号与上下文 |
| | `read_workspace_code` | 读取工作区内的代码或配置文件 |
| | `apply_workspace_patch` | 精确替换已有文件中的文本片段（需确认） |
| | `create_workspace_file` | 创建工作区内的新文件（需确认） |
| | `run_workspace_command` | 运行受限开发命令（需确认） |

常用操作（"启动QQ"、"关闭网易云"、"网易云还在吗"、"打开桌面"）走本地快速路径，不经过 LLM。应用别名会映射到真实进程名，关闭时先请求正常退出，再按 PID 清理残留并复查。

### RAG 向量检索
- 文件扫描 + 文本切片（chunkSize 800, overlap 120）
- Embedding API 集成（默认 SiliconFlow / BAAI-bge-m3），设置面板可配
- 向量相似度检索（余弦相似度），失败自动降级关键词 → 文件扫描
- 检索模式可控（auto / keyword_only）

### 桌面壳
- Live2D 模型渲染（Hiyori），支持触摸交互
- 透明无边框窗口，可拖拽，常驻置顶
- 气泡式对话浮窗（10 秒自动淡出）
- 二次元陪伴工作台：Live2D 角色舞台、关系状态、快捷对话与聊天记录同屏
- 独立设置窗口、快速输入窗口、模型缩放窗口
- 独立代码工作台：文件树、代码预览、终端式对话，共享日常聊天记忆

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

### 消息联动（后续路线）

AstrBot、微信代发、消息读取与自动回复暂不作为当前版本的正式能力。已有实验代码与配置会保留，方便后续继续验证，但产品界面统一标记为“待开发”，本阶段不承诺可用性。设计记录见 [AstrBot 联动说明](docs/astrbot-weixin.md)。

### EchoBot 参考说明

0.7 的陪伴工作台参考了 [KdaiP/EchoBot](https://github.com/KdaiP/EchoBot) 的“角色舞台 + 对话控制区”信息架构与任务状态表达。V-Manager 保留自己的 Electron、React、Agent Core 与现有 Live2D 资源，没有引入 EchoBot 的角色模型或背景素材；EchoBot 源码采用 MIT License。

## 数据流

```
用户输入
  → 意图路由
    → 日常聊天：deepseek-chat 单次流式响应，不注入工具
    → keyword executor 链（workspace → app → file → system）
      → 命中：显示执行状态并直接返回本地结果
      → 未命中：复杂任务模型 + 当前意图相关工具
       → LLM 决策：调哪些工具、调几次（最多 5 轮）
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
    └── registry/              应用缓存
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
| 日常对话模型 | deepseek-chat | 单次流式回复，不携带工具定义 |
| 复杂任务模型 | deepseek-chat | 电脑操作、代码与工具调用，可切换 V4/reasoner 等模型 |
| 最大消息数 | 40 | 上下文窗口大小（10-100） |
| 检索条数 | 3 | RAG 每次召回知识片段数（1-10） |
| ElevenLabs API Key | — | 用于账号音色读取和文字转语音 |
| 语音模型 | eleven_v3 | 可切换 Multilingual v2 / Flash v2.5 |
| 默认音色 | Lily | 内置 21 个官方预置音色，也可读取账号音色或填写 Voice ID |
| V3 稳定度 | Natural | 可切换 Creative / Natural / Robust |
| 本地听写模型 | Small Q5 | 可切换 Base Q5；运行时和模型按需安装到应用数据目录 |
| 关系成长 | 开启 | 本地计算情绪与好感阶段；可隐藏进度或完全停用 |

“语音与 ASMR”设置页已提供哄睡、闲聊、本地文本导入和 AI 脚本生成。ElevenLabs V3 会使用 `[whispers]` 音频标签生成耳语；长文本按句切片并顺序播放。

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
| **0.7.0** | UI 自动化：VS Code / 浏览器 / 聊天软件适配 | 🚧 开发中 |
| 0.8.0 | 多设备一键接入：profile 初始化脚本 | ⬜ 规划中 |

详见 [CHANGELOG.md](./CHANGELOG.md)。

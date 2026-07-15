# V-Manager

一个面向 PC 端的桌面 Agent 应用，以 Live2D 桌宠形象为载体，通过 DeepSeek 大模型实现自然对话，并具备真实系统操作能力。

## 核心能力

### 对话与记忆
- 可自定义角色人设和系统提示词
- 流式对话（边生成边显示）
- 多轮对话记忆（最大消息数可配置，默认 40 条）
- 记忆自动压缩：超阈值时提取偏好、事实、承诺、决策 → 写入知识库

### 本地工具（Function Calling）
通过 OpenAI 兼容的 function calling，LLM 可主动调用 21 个工具：

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

常用操作（"启动QQ"、"打开桌面"）走 keyword 快速路径，**41ms 内返回**，不经过 LLM。

### RAG 向量检索
- 文件扫描 + 文本切片（chunkSize 800, overlap 120）
- Embedding API 集成（默认 SiliconFlow / BAAI-bge-m3），设置面板可配
- 向量相似度检索（余弦相似度），失败自动降级关键词 → 文件扫描
- 检索模式可控（auto / keyword_only）

### 桌面壳
- Live2D 模型渲染（Hiyori），支持触摸交互
- 透明无边框窗口，可拖拽，常驻置顶
- 气泡式对话浮窗（10 秒自动淡出）
- 独立设置窗口、对话窗口、模型缩放窗口

## 技术架构

```
Electron（桌面壳）
  ├── main.js              IPC 桥接 + 多窗口管理
  └── preload.cjs           27 个 agent:channel 接口

React + Vite（界面层）
  └── src/App.tsx           6 种视图模式（pet/settings/scale/composer/chat/bubble）

Agent Core（Node.js）
  ├── core.js               主协调层：buildAgentReply + 配置/记忆/DeepSeek
  ├── tools.js              21 个工具定义（OpenAI function calling 格式）
  ├── tool-executor.js      工具调度器
  ├── memory-compressor.js  记忆压缩（偏好/事实/承诺/决策 → 知识库）
  ├── router.js             意图路由 + executor 链调度
  ├── rag.js                RAG 索引构建与检索
  ├── app-registry.js       应用注册表（内置预设 + PowerShell 扫描 + 快捷方式发现）
  ├── runtime-paths.js      数据路径解析
  ├── shared/
  │   └── utils.js          统一工具函数（路径、文本、CSV 解析等）
  └── executors/
      ├── app-executor.js   应用启动/定位
      ├── file-executor.js  文件操作/搜索
      └── system-executor.js 系统资源/进程/磁盘

DeepSeek API
  └── /v1/chat/completions  流式对话 + function calling
```

## 数据流

```
用户输入
  → keyword executor 链（workspace → app → file → system）
    → 命中：直接返回（41ms）
    → 未命中：RAG 检索 → DeepSeek（带 21 个工具）
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
| 模型 | deepseek-chat | 支持 flash/pro/reasoner |
| 最大消息数 | 40 | 上下文窗口大小（10-100） |
| 检索条数 | 3 | RAG 每次召回知识片段数（1-10） |

## 项目定位

日常二次元赛博陪伴 + 电脑助手辅助。核心方向：向着更拟人化、更真实的桌面伴侣发展——情绪感知、好感成长、语音互动、Live2D 神态联动。

## 版本路线

| 版本 | 目标 | 状态 |
|---|---|---|
| **0.1.0** | 桌面 Agent 完整底座：对话记忆、21 个本地工具、RAG 向量检索、Live2D 桌宠壳 | ✅ 完成 |
| **0.2.0** | Live2D 表情联动：LLM 驱动神态（思考/待机/抓取/情绪）、对话情绪感知 | ⬜ 下一版 |
| 0.3.0 | 代码代理：工作区搜代码、改文件、跑命令 | ⬜ 规划中 |
| 0.4.0 | Live2D 皮肤换壳：多模型加载、皮肤切换、模型配置化 | ⬜ 规划中 |
| 0.5.0 | 语音全链路：STT 语音输入 + TTS 语音输出（含 ASMR 耳语）+ Live2D 口型同步 | ⬜ 规划中 |
| 0.6.0 | 人设引擎：情绪计算 + 好感度系统（核心方向） | ⬜ 规划中 |
| 0.7.0 | UI 自动化：VS Code / 浏览器 / 聊天软件适配 | ⬜ 规划中 |
| 0.8.0 | 多设备一键接入：profile 初始化脚本 | ⬜ 规划中 |

详见 [CHANGELOG.md](./CHANGELOG.md)。

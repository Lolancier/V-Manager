# V-Manager 开发日志

> 版本 **0.2.2** | 表情管线修复 + 对话自动张嘴动画
>
> **项目定位**：日常二次元赛博陪伴 + 电脑助手辅助
>
> **核心方向**：向着更拟人化、更真实的桌面伴侣发展——情绪感知、好感成长、语音互动、Live2D 神态联动。

---

## 版本路线图

| 版本 | 目标 | 状态 |
|---|---|---|
| **0.1.0** | 桌面 Agent 完整底座：对话记忆、21 个本地工具、RAG 向量检索、Live2D 桌宠壳 | ✅ 完成 |
| **0.2.0** | Live2D 表情联动：LLM 驱动神态、多选组合开关、右键表情面板 | ✅ 完成 |
| **0.2.1** | LLM mood/face 工具调用、8 情绪组合预设、对话动作指令 | ✅ 完成 |
| **0.2.2** | 表情管线修复、参数白名单校准、对话自动张嘴动画 | ✅ 完成 |
| 0.3.0 | 代码代理：工作区搜代码、改文件、跑命令 | ⬜ 规划中 |
| 0.4.0 | Live2D 皮肤换壳：多模型加载、皮肤切换、模型配置化 | ⬜ 规划中 |
| 0.5.0 | 语音全链路：STT 语音输入 + TTS 语音输出（含 ASMR 耳语）+ Live2D 口型同步 | ⬜ 规划中 |
| **0.6.0** | **人设引擎：情绪计算 + 好感度系统（核心方向）** | ⬜ 规划中 |
| 0.7.0 | UI 自动化：VS Code / 浏览器 / 聊天软件适配 | ⬜ 规划中 |
| 0.8.0 | 多设备一键接入：profile 初始化脚本 | ⬜ 规划中 |

---

## 0.2.1 完成清单

### LLM mood/face 工具调用
- [x] `set_mood` function calling 替代文本标签解析
- [x] mood 拦截器：主进程检测 LLM 工具调用 → `agent:mood-updated` IPC 直推 pet 窗口
- [x] face_params 白名单过滤 + clamp（16 标准参数 + 7 自定义参数）
- [x] 系统提示词硬编码动作映射（吐舌=Param70:1 等）
- [x] 修复 LLM mood 标签从未在 pet 窗口生效的历史 bug

### 8 情绪组合预设
- [x] 开心：爱心眼+星星+比心 / 星星眼+吐舌+星星 / 爱心眼+话筒+星星
- [x] 难过：眼泪+垂耳+嘟嘴 / 眼泪+流汗+垂耳
- [x] 惊讶：空白眼+问号+流汗 / 轮回眼+问号2+鼓嘴
- [x] 生气：生气+黑脸+鼓嘴 / 生气+眼珠+黑脸
- [x] 害羞：脸红+爱心眼+嘟嘴 / 脸红+吐舌+垂耳 / 脸红2+鼓嘴+爱心眼
- [x] 思考：问号+眼珠 / 问号2+长发 / 眼珠+笔记本R
- [x] 说话：星星眼+话筒 / 爱心眼+星星 / 吐舌+星星眼
- [x] 待机：随机道具动作（抱狐狸/扇子/镜子/话筒/打游戏/比心）

### 表情参数管线
- [x] `LAppModel.setParamOverrides()` — 在 `onLateUpdate` 后 GPU 上传前注入
- [x] `CubismFramework.getIdManager().getId()` 修复 string→CubismId 转换
- [x] rAF 四层叠加：mood combo → idle prop → 手动面板 → LLM face params
- [x] 待机随机道具改走 override 管线，mood 变化自动清除
- [x] `EXPRESSION_PARAMS` 31 表情完整参数映射

### 表情面板
- [x] 31 按钮开关式多选（情绪/形态/动作三组）
- [x] 全部清除按钮
- [x] 右键菜单「打开表情面板」入口

### 知识库
- [x] `expressions.md` 自动播种（16 参数参考表 + 5 常用预设）
- [x] 面部参数白名单同步 `FACE_PARAM_RANGES` + `FACE_PARAM_WHITELIST`

### 协同修复
- [x] preload 补全 `clearExpressions` / `onClearExpressions` / `onMoodUpdated`
- [x] `vite-env.d.ts` 补全所有缺失类型声明
- [x] `.gitignore` 修复，排除根目录重复模型文件

---

## 0.2.2 完成清单

### 表情管线修复（Critical Bug Fix）

**根因：`ParameterAnimator` 将字符串 ID 直传 Cubism 5 SDK 的 `setParameterValueById()`，但 SDK 要求 `CubismIdHandle` 对象。`getParameterIndex()` 用 `!=` 比对，`CubismId` 无 `toString()`，`"[object Object]" != "ParamBrowLY"` 永远为 true，所有 mood preset 的 targets 和 oscillations 静默失效。**

- [x] Animator 重写：不再直调 SDK，改为每帧返回 `Map<string, number>`，统一通过 `LAppModel.setParamOverrides()` 应用（该路径正确转换 `CubismIdHandle`）
- [x] 删除死代码：`modelWired`、`setModel()`、`CubismModelRef`、`RuntimeModel` 等无效逻辑
- [x] 表达式面板重置改用 per-frame override 重建自动清除

### 参数白名单校准

- [x] `FACE_PARAM_WHITELIST`：23 个参数 → 43 个（全部在 Live2D Cubism Viewer 5.3 中逐个验证）
- [x] 移除无效参数：`ParamEyeLSmile`、`ParamEyeRSmile`、`ParamBrowRY`、`ParamBodyAngleX/Y/Z`、`ParamBreath`
- [x] 新增实测参数：`ParamBrowLForm`（囧眉）、`Param52`（豆豆眼）及全部 toggle 参数
- [x] 修复范围：`ParamEyeLOpen`/`ROpen` 从 `0-1` → `0-2`（1 为居中默认值）
- [x] `QIANQIAN_MOOD_PARAMS` 8 个 mood 预设全部用实测有效参数重写
- [x] `EXPRESSION_PARAMS` 新增 `expression0` → Param52（豆豆眼）
- [x] `MOOD_COMBO_EXPRESSIONS` thinking/surprised 各新增含豆豆眼的组合

### LLM 输出修复

- [x] System prompt 删除内联参数示例（旧版 `"吐舌=Param70:1 皱眉=ParamBrowLY:-0.6+ParamBrowRY:-0.6"` 导致 LLM 把参数名当文本模板抄进回复）
- [x] `set_mood` 工具 description 从 200+ 字参数清单精简为引导式描述
- [x] `FACE_PARAM_RANGES` 与前端白名单完全对齐
- [x] `expressions.md` 知识库模板更新为实测参数
- [x] `agent-data/knowledge/expressions.md` 手动创建（含参数表 + 6 个表情预设）

### 对话自动张嘴动画

- [x] 新增 auto mood 状态机：thinking → talking → idle，基于 `isReplyStreaming` 自动切换
- [x] 嘴巴仅在文字实际到达时开始张合（不包含网络等待和 LLM 思考时间）
- [x] 张嘴频率调优：周期 280ms → 420ms，振幅 0.45 → 0.35
- [x] 流式结束 500ms 宽限期，允许 LLM mood IPC 先到达，避免 idle→happy 中间闪白
- [x] LLM mood 过期后智能回退：还在流式 → talking，已结束 → idle

### 协同修复

- [x] Stale faceParams：新 mood 不含 faceParams 时主动清除上一轮残留
- [x] `agent:mood-updated` 到达时取消 talking→idle 宽限定时器，无缝过渡

---

### 0.4.0 皮肤换壳 — 详细规划

| 子项 | 说明 |
|---|---|
| **模型配置化** | Live2D 模型路径、参数映射从配置文件读取，不硬编码 Hiyori |
| **多模型加载** | 支持 model3.json 切换，预置 2-3 套免费模型 |
| **皮肤商店预留** | 目录结构预留 `assets/models/`，方便后续拖入新模型 |
| **运行时热切换** | 右键菜单切换皮肤，无需重启 |

### 0.5.0 语音全链路 — 详细规划

**目标**：双向语音交互——用户可以说给桌宠听，桌宠可以说给用户听。

#### 语音输入（STT）

| 子项 | 说明 |
|---|---|
| **麦克风接入** | 桌面端捕获麦克风音频流，支持按键/唤醒词触发录音 |
| **STT 转文字** | 接入 ASR API（DeepSeek 代理、Whisper 兼容接口、或讯飞/百度等国内服务），实时或分段转写 |
| **输入通路** | 转写结果注入对话 pipeline → 等同于用户打字输入，走完整 RAG + LLM 链路 |
| **静音检测** | 自动检测用户说完，无需手动停止录音 |

#### 语音输出（TTS + ASMR）

| 子项 | 说明 |
|---|---|
| **TTS API 接入** | 支持 OpenAI TTS 兼容接口，可切换多种音色（活泼、温柔、慵懒等） |
| **ASMR 耳语模式** | 特定场景（晚安、安慰、悄悄话）触发 ASMR 模式——低音量、近场感、气息声增强。可调用专门的 ASMR 音色或调整 TTS 参数（pitch 降低、speed 放慢、volume 柔和） |
| **流式语音输出** | LLM 流式生成 → TTS 逐句合成 → 边播边继续生成 |
| **语音 + 气泡同步** | 气泡文字和语音同时输出 |
| **语速/音调调节** | 跟随后端人设引擎的情绪数据，自动调节语速和语调（开心→轻快、难过→缓慢） |

#### Live2D 口型同步

| 子项 | 说明 |
|---|---|
| **音量驱动** | 根据音频实时音量驱动 Live2D `ParamMouthOpenY` 参数 |
| **音素驱动（进阶）** | 解析 TTS 返回的音素时间戳，精确控制口型变化 |
| **说话态动画** | 说话时配合头部微动、眨眼、手势等辅助动画 |

### 0.6.0 人设引擎（核心方向）— 详细规划

**目标**：后端实时计算情绪数据和好感数据，驱动 LLM 输出的语气、内容、风格，让桌宠从"工具"进化为"角色"。

#### 情绪系统

| 子项 | 说明 |
|---|---|
| **多维情绪向量** | 定义情绪维度（愉悦度、唤醒度、亲密度等），后端根据对话历史、用户行为、时间上下文实时计算 |
| **情绪衰减/累积** | 情绪不是瞬时切换而是渐变——长时间不互动趋近待机基线，连续正向互动累积愉悦 |
| **情绪 → Prompt 注入** | 当前情绪值动态注入 system prompt（如「你现在心情很好」「你有点困了，语气慵懒一些」） |
| **情绪 → 神态联动** | 情绪值实时下发前端，驱动 Live2D 表情参数（眉毛、嘴角、眼神） |

#### 好感度系统

| 子项 | 说明 |
|---|---|
| **好感度维度** | 定义好感因子——互动频率、消息长度、正向/负向评价、用户对桌宠的反馈（夸奖/冷淡/无视） |
| **好感度分层** | 阶段式成长：陌生人 → 熟人 → 朋友 → 挚友 → ???，每阶段解锁不同语气和内容深度 |
| **好感 → 内容调节** | 低好感：礼貌但疏离；中好感：轻松调侃；高好感：主动关心、记住细节、撒娇 |
| **持久化存储** | 情绪和好感数据写入 `agent-data/profile.json`，跨会话保留，不因重启丢失 |
| **用户感知** | 设置面板可选展示好感进度（进度条/阶段名），也可完全隐藏，由用户选择 |

#### 语气生成策略

| 子项 | 说明 |
|---|---|
| **情绪 × 好感 × 人设 → 语气模板** | 三维矩阵决定输出风格——例如「高好感 + 愉悦 + Hiyori 人设 → 活泼撒娇」「低好感 + 平静 + 助手角色 → 克制专业」 |
| **语气标签体系** | 定义 10-15 种语气标签（温柔、活泼、傲娇、慵懒、认真、宠溺...），LLM 根据标签调整措辞 |
| **场景感知** | 识别对话场景（早晨问候、工作讨论、深夜聊天、游戏陪伴），自动匹配语气 |

---

## 系统架构演进

```
0.1.0                              0.6.0
                          
用户输入 ──→ LLM ──→ 回复     用户输入 ──→ STT ──→ 情绪引擎 ──→ 好感引擎
              │                                    │            │
              ▼                                    ▼            ▼
         Live2D 静态渲染                    LLM（带人格 Prompt）  语气策略
                                                    │
                                          ┌─────────┼─────────┐
                                          ▼         ▼         ▼
                                       TTS 语音  气泡文字  Live2D 神态
                                          │                    │
                                          ▼                    ▼
                                      口型同步            情绪动画
                                      (ASMR)            (动作/表情)
```

---

## 0.1.0 完成清单

### 对话与记忆
- [x] 可自定义角色人设和系统提示词
- [x] 流式对话（边生成边显示）
- [x] 多轮对话记忆（最大消息数可配置，默认 40 条）
- [x] 记忆自动压缩（偏好/事实/承诺/决策 → 知识库）

### 本地工具（21 个 Function Calling）
- [x] 系统类（5）：CPU/内存/进程快照、磁盘空间、进程查杀、窗口列表
- [x] 应用类（3）：启动、查找、刷新注册表
- [x] 文件类（7）：目录、读写、增删、搜索
- [x] 知识类（3）：检索、状态、重建索引
- [x] 工作区（2）：列目录、切换目录
- [x] keyword 快速路径（常用操作 41ms 返回，不经过 LLM）

### RAG 向量检索
- [x] 文件扫描 + 文本切片（chunkSize 800, overlap 120）
- [x] Embedding API 集成（默认 SiliconFlow / BAAI-bge-m3）
- [x] 向量相似度检索（余弦相似度 + 阈值 0.3）
- [x] 三级降级：vector → keyword → 文件扫描
- [x] mode 控制（auto / keyword_only）
- [x] 设置界面：Embedding Key 配置、状态查看、重建索引、连通测试

### 桌面壳（Electron）
- [x] Live2D 模型渲染（Hiyori），支持触摸交互
- [x] 透明无边框窗口，可拖拽，常驻置顶
- [x] 气泡式对话浮窗（10 秒自动淡出）
- [x] 独立设置窗口、对话窗口、模型缩放窗口
- [x] 6 种视图模式（pet/settings/scale/composer/chat/bubble）
- [x] 27 个 agent:channel IPC 接口

### 技术架构
- [x] Electron main.js + preload.cjs（IPC 桥接）
- [x] React + Vite（界面层）
- [x] Agent Core：core / tools / tool-executor / memory-compressor / router / rag / app-registry
- [x] 3 个 executor：app / file / system
- [x] DeepSeek API 流式对话 + Function Calling（最多 5 轮工具调用）

---

## 每日进度

### 2026-07-16
- **项目定位明确**：日常二次元赛博陪伴 + 电脑助手辅助
- **核心方向确认**：人设引擎（情绪计算 + 好感度系统）为后续主线
- **语音全链路规划细化**
  - 语音输入：麦克风 → STT（Whisper 兼容/国内 ASR）→ 对话 pipeline
  - 语音输出：TTS 多音色 + ASMR 耳语模式（晚安/安慰/悄悄话场景）
  - Live2D 口型同步：音量驱动 + 音素驱动（进阶）
- **人设引擎规划细化**
  - 多维情绪向量（愉悦度、唤醒度、亲密度），后端实时计算
  - 好感度分层成长（陌生人 → 熟人 → 朋友 → 挚友），跨会话持久化
  - 语气生成策略：情绪 × 好感 × 人设 → 三维矩阵决定输出风格
- **架构演进图**：0.1.0 单线 LLM → 0.6.0 情绪/好感/语气/语音多引擎联动

### 2026-07-17
- **LLM mood/face 工具调用全线跑通**
  - `set_mood` function calling 替代文本标签，LLM 遵从度大幅提升
  - 8 情绪各 2-3 套组合预设上线，右键菜单即时切换
  - 单字指令（「吐舌」「眯眼」「张嘴」）LLM 正确响应 face_params
  - 待机道具改走 override 管线，对话启动时自动清除不再遮挡
- **表情管线架构稳定**：core.js 拦截 → main.js IPC → pet 窗口 → Live2D 四层叠加
- **动作映射硬编码**写入系统提示词 + 工具描述，无需依赖 RAG 检索
- 表情面板 31 按钮全部可用，支持任意多选组合
- CHANGELOG 更新，版本定档 0.2.1

### 2026-07-16
- **表情/动作组合开关系统完成**
  - 31 表情参数映射构建完毕，确认每个表情控制独立参数
  - 实现开关式多选面板 + `setParamOverrides` 参数注入管线
  - 发现并修复 `CubismFramework.getIdManager().getId()` 字符串转换问题
  - 右键菜单接入表情面板入口
- **LLM mood 链路调试**
  - 发现 LLM mood 标签从未在 pet 窗口生效的历史 bug
  - 主进程新增 `agent:mood-updated` IPC 直推
  - 系统提示词多轮迭代优化 LLM 遵从度
  - DeepSeek 文本标签不可靠 → 切换为 function calling 方案
- **8 情绪组合预设**设计完成，替代随机单表情池
- **待机道具与对话分离**，mood 变化自动清除 idle 道具
- **知识库 expressions.md** 自动播种（参数表 + 5 常用预设）
- 清理调试代码、修复 `.gitignore`、版本定档 0.2.0

### 2026-07-15
- **RAG 向量检索升级完成**
  - rag.js mode 字段正式生效（auto / keyword_only）
  - 新增 `testEmbeddingConnection()` 连通性测试
  - 修复 main.js config 保存时漏掉 embedding 字段合并的 bug
  - 设置面板新增 RAG 索引状态卡片 + 重建索引按钮 + Embedding 测试按钮
  - 修复 vite-env.d.ts 类型 `maxHistory` → `maxMessages`
  - 预装 @types/react、@types/react-dom、typescript 依赖
- **后续版本规划确认**
  - 0.2.0 → Live2D 表情联动（LLM 驱动神态/情绪/鼠标交互）
  - 0.4.0 → 皮肤换壳（多模型加载、热切换）
  - 0.5.0 → TTS 语音合成 + Live2D 口型同步（张嘴说话）
- **版本定档 0.1.0**，创建 CHANGELOG.md

### 2026-07-14（推定）
- 初始提交：V-Manager 桌面 Agent 完整底座
- 21 个工具、对话记忆、Live2D 渲染、Electron 壳全部就位

---

## 提交规范

```
<type>: <简短描述>

类型：
  feat     — 新功能
  fix      — 修 bug
  refactor — 重构
  chore    — 工程化（依赖、配置、构建）
  docs     — 文档
  style    — UI/样式
```

### 示例
```
feat: RAG 向量检索升级，设置面板加索引管理
fix: config 保存时 embedding 字段丢失
chore: 安装 TypeScript + React 类型定义
```

---

## 数据文件说明

| 路径 | 用途 |
|---|---|
| `agent-data/config.json` | 用户设置（API Key、人设、记忆参数） |
| `agent-data/memory/conversation.jsonl` | 对话历史 |
| `agent-data/knowledge/` | 知识库文件（persona.md、profile.md、每日记忆） |
| `agent-data/rag/rag-config.json` | RAG 配置 |
| `agent-data/rag/rag-index.json` | RAG 索引（含 embedding 向量） |
| `agent-data/registry/` | 应用注册表缓存 |

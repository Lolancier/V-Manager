# AkaneCompanionLab 与 V-Manager 对照分析

分析基线：AkaneCompanionLab commit `1b59b64aa3f5fe5f13b19f76b563ac4aeadfa0cd`（2026-07-01）。

参考仓库位置：`references/AkaneCompanionLab/`。该项目代码许可证为 Apache-2.0；角色与图片资源另见仓库内 `ASSETS_LICENSE.md`，不能因代码可借鉴就默认资源也可直接复用。

## 1. 总结

Akane 的优势不是某一个模型或某一句人设提示词，而是把“身份、当前表达侧面、近期原话、阶段回忆、长期语义记忆、精确时间线、检索校验”拆成多个层次。这样即使更换模型，角色身份和可验证记忆仍有稳定锚点。

V-Manager 已有固定人设、关系/情绪、本地历史、知识库 RAG、四类陪伴记忆和记忆压缩，但目前这些模块更像几条并行能力：人格是单段配置，陪伴记忆依赖规则抽取，旧对话压缩为 Markdown，知识检索没有独立的“回忆校验”阶段。短期体验已经完整，跨周、跨月的人格与事实稳定性弱于 Akane。

建议吸收 Akane 的分层思想，但不照搬其整体 Python/FastAPI/Tauri 架构。V-Manager 保持 Electron + Node，实现精简版的 SQLite 分层记忆和人物事实校验即可。

## 2. 模型调用

### Akane

- 将模型用途拆成 `TEXT`、`AUX`、`CHAT`、`VISION` 四个角色；缺失时按规则回退。
- 支持 OpenAI 兼容协议、Anthropic 协议和 Ollama；设置层还暴露 DeepSeek、Gemini 等预设。
- 最终回复强制输出结构化 JSON，包括 `emotion`、`speech`、`speech_segments`、`tool_call`、`persona`、`memory_metadata` 和 `state_request`。
- 记忆路由/校验使用 NDJSON 流；最终回复流在顶层 JSON 尚未结束时就能提取 emotion、speech 和语音媒介提示。
- 原生 tools 只对经过能力验证的 provider/model 开启；不稳定的模型回退到提示词工具协议，避免强制 JSON 与 tool calling 冲突。
- 摘要、语义压缩等辅助任务使用低温度（通常 0.2），降低记忆改写漂移。

### V-Manager

- 主要是单一 DeepSeek/OpenAI 兼容配置；聊天、工具调用、记忆压缩和创作共享同一模型配置。
- 普通回复可以流式输出；工具使用 OpenAI function calling。
- Persona、关系状态、陪伴记忆和命中的知识片段在最终 system prompt 中合并。
- 输出表情由工具、文本标签、本地关系推荐三级兜底，不要求整个最终回复遵守统一结构化 schema。

### 判断

Akane 的模型层更适合大型实验平台，稳定性来自“不同任务不同约束”。V-Manager 当前更轻、更容易维护，但当模型同时负责聊天、工具、记忆抽取和人格演出时，一个调用格式异常会影响整轮体验。此前遇到的 orphan `tool` 消息 400 就属于这种耦合风险。

建议 V-Manager 后续至少拆成三个逻辑通道：

1. `chat`：自然对话和工具决策。
2. `memory`：低温度、严格 JSON 的事实/事件抽取与压缩。
3. `creative`：私密空间创作，可独立预算和超时。

不必要求用户配置三组 Key；三通道可以默认共用一个服务，只在内部参数和 schema 上分离。

## 3. 语音输出

### Akane

语音提供方：

- 默认 Edge TTS，默认音色 `zh-CN-XiaoxiaoNeural`，支持 rate/volume/pitch。
- 可选本机 GPT-SoVITS HTTP 服务，并通过角色包声明 provider 和 voice profile。
- GPT-SoVITS 只允许 loopback 地址，避免把本地参考音频路径发送到远端服务。
- GPT-SoVITS 缺失、不可达或合成失败时自动降级到 Edge TTS。
- 另有 OpenAI-compatible TTS/ASR capability adapter；语音输入可回退到 Faster Whisper 路径。

播放方式：

- 模型可返回最多三个 `speech_segments`。
- 桌宠 `TtsPlayer` 对每段分别调用 `/tts`，取得完整 Blob 后顺序播放。
- 新的一次 speak 会停止当前请求、清空旧队列并撤销 Object URL。
- 播放开始/结束回调与桌宠说话状态联动。

需要注意：配置名虽然叫 `STREAMING_TTS_ENABLED`，LLM 回复也能流式提取 speech，但当前检查到的 Electron 桌宠主路径仍是“整段 TTS HTTP 响应完成后播放”，GPT-SoVITS 默认 `streaming_mode=false`。因此它是分段低等待，不是音频字节级真正实时播放。

### V-Manager

- 使用 ElevenLabs V3，支持账号音色、稳定度、相似度、输出格式和 V3 情绪/耳语标签。
- 合成结果以 Base64 返回，并按文本段依次创建 `Audio` 播放。
- 对相同配置与文本做本地 MP3 缓存，重复台词不再扣字符。
- 本地 Whisper.cpp 负责语音输入。
- 已有口型状态与语音播放的联动。

### 判断

- 音质和情绪表现：V-Manager 的 ElevenLabs V3 更强。
- 离线/低成本：Akane 的 Edge TTS + 本地 GPT-SoVITS 更灵活。
- 故障降级：Akane 明显更完整；V-Manager ElevenLabs 失败后主要退回文字计时。
- 角色声线绑定：Akane 的角色包可以声明 voice profile；V-Manager 当前声线更接近全局设置。

建议首先给 V-Manager 增加 provider 抽象：`ElevenLabs -> 本地 GPT-SoVITS -> Windows/Edge TTS -> 纯文字`。保留 ElevenLabs 为高质量首选，不必替换。

## 4. AI 人格保持

Akane 使用四层人格锚定：

1. **格式层**：只规定 JSON、工具、字段，不允许模型把格式规则“演成人格”。
2. **角色包核心层**：`character.json` + `persona.md` 固定身份、自称、关系、边界、说话风格、反应模式和示例。
3. **动态人格侧面层**：`persona_cards` 保存某种稳定表达侧面，例如更亲昵、安静或俏皮；有创建、更新、激活、归档、删除及事件日志。
4. **当前环境层**：好感、饥饿、精力、BGM、礼物、桌面状态和近期经历只影响这一刻的表现，不覆盖核心身份。

它还把记忆总结提示明确写成：“角色设定只决定记忆口吻、在意点和情感余温，不是事实”，避免把人设设定误写进用户事实。

V-Manager 当前人格稳定来源：

- `personaName + personaPrompt + knowledge/persona.md`。
- 关系阶段提示决定亲密程度和边界。
- valence/arousal 决定当前情绪语气。
- facts/episodes/habits/commitments 提供近期陪伴线索。
- Live2D 情绪与模型文本分层，但模型表情不会反写持久情绪。

V-Manager 的优点是关系和情绪数值由本地规则控制，不容易被模型随意篡改；Akane 的动态人格侧面更自然，但也更依赖模型正确判断何时创建或切换侧面。

最值得借鉴的是“核心人格不可变、表达侧面可成长”。可以在 Vivi 上新增：

- `identity-core.json`：名字、自称、底线、价值观、关系边界，只允许用户修改。
- `persona-facets.json`：俏皮、工作搭档、安静陪伴、创作状态等可变侧面。
- `persona-events.jsonl`：记录侧面为何形成、何时切换、依据哪些真实互动。

动态侧面只能改变语气、主动程度和偏好，不能修改核心身份、权限或已确认事实。

## 5. 记忆稳定

### Akane 的分层结构

1. **原始记忆**：每条用户/助手消息进入 SQLite `chat_messages`，带准确时间、角色、会话、角色包、标签和是否索引字段。
2. **本地时间线镜像**：按天生成可重建的 Markdown，方便人查看；SQLite 才是事实源。
3. **情节记忆**：未摘要消息达到 30 条后，把最旧 20 条压缩成一条 `memory_summaries`，保存日记式摘要、关键事件、核心事实和来源消息 ID。
4. **长期语义记忆**：未语义化情节摘要达到 10 条后，把最旧 5 条压缩为 `memory_semantic_summaries`，保存稳定事实、重复话题、重要人物、开放线索和原始摘要 ID。
5. **语义强化**：新长期记忆与近 8 条语义记忆有至少 2 个重叠锚点时，融合进旧记忆而不是不断产生重复记录。
6. **检索**：原始消息、情节摘要、语义摘要都进入向量库；向量相似度与 BM25 关键词结果使用 RRF 融合，再结合意图、时间、类型、重要度等重排。
7. **校验**：候选记忆交给独立 verifier，只有能直接支持当前问题的片段才进入最终回答；失败可重写查询重试一次。
8. **主动回忆工具**：当前可见上下文仍不足时，主模型可调用 `retrieve_memory`；涉及明确日期时还可读取未经摘要的精确时间线。

关键稳定措施：

- 摘要记录保留来源 ID 和时间范围。
- 原始消息只是标记已摘要，没有被摘要文本替代或删除。
- 当前 prompt 已可见的消息/摘要会从检索候选中排除，避免重复放大。
- 记忆测试问题可禁止自身进入向量索引，防止以后检索到“你还记得吗”而不是答案。
- 每条记忆携带 subject scope、category、mood tags、importance、confidence。
- Embedding 首选本地 BGE-M3；不可用时退回 hashed embedding，至少保持系统可运行。

### V-Manager 当前结构

- `conversation.jsonl` 保存近期完整轮次和工具调用。
- 超过约 `maxMessages × 1.5` 时，把旧轮次交给 DeepSeek 压缩为用户偏好、关键事实、待办承诺和决策记录。
- 压缩结果写入每日 `memory-YYYY-MM-DD.md` 和长期 `profile.md`，然后裁剪旧 conversation history。
- 另有规则式 `companion-memory.json`，按 facts/episodes/habits/commitments 保存最多各 100 条。
- RAG 对知识目录做分块，可用远端 BGE-M3 embedding；失败降级到关键词。
- 每轮直接取 Top-K 命中片段进入最终 prompt，没有单独 verifier。

### 差距

- V-Manager 裁剪后，原始旧对话不再是主事实源；如果摘要遗漏或写错，难以精确恢复。
- 规则抽取只能识别固定中文句型，隐含偏好、关系事件和跨句承诺容易漏掉。
- `profile.md` 是按日期追加的半结构化文本，重复、冲突和过时事实缺少版本/置信度管理。
- RAG 没有检索校验；弱相关片段也可能进入回答，模型可能把相似内容当成确定事实。
- 当前没有“用户事实”和“Vivi 当时的主观感受”的硬隔离。

## 6. 推荐吸收顺序

### P0：原始记忆不丢失

- 增加 SQLite，长期保存原始对话；JSONL 作为迁移兼容或导出格式。
- 摘要只改变默认可见性，不删除原文。
- 所有摘要保存 `source_ids` 和准确时间范围。

### P1：三层记忆

- `raw_messages`：原话。
- `episodic_memories`：某段经历和当时 Vivi 的感受。
- `semantic_memories`：稳定事实、偏好、长期目标、开放承诺。
- 用户事实和 Vivi 感受分别存字段，禁止混写。

### P2：检索校验

- 保留现有向量 + 关键词降级。
- 增加轻量规则过滤：人物范围、日期、类别、置信度。
- 对“你还记得……”等高风险回忆问题，再调用低温度模型做一次 verifier；普通聊天无需每轮增加一次模型费用。

### P3：核心人格与表达侧面

- 核心人格只由用户设置修改。
- 表达侧面可由长期互动形成，但必须有事件证据和可查看/撤销记录。
- 日记和创作读取当前侧面、情绪与关系，但不能用创作内容反向制造现实事实。

### P4：多语音降级链

- ElevenLabs 保持首选。
- 增加本地 GPT-SoVITS 声线 profile。
- 增加 Edge TTS 免费兜底。
- provider 与角色配置绑定，播放层继续使用统一队列和取消令牌。

## 7. 不建议直接照搬

- 不迁移成 Python + FastAPI + Tauri；对个人版 V-Manager 会显著增加部署复杂度。
- 不默认每轮做多次 LLM 路由和校验；成本与延迟不适合日常桌宠。只对高风险回忆问题启用 verifier。
- 不允许模型自由修改核心人格。
- 不直接复制 Akane 的角色文字、图片或声线资源；代码许可和资源许可分开。
- 不把“流式 TTS”仅做成配置名。若后续实现，应明确区分“LLM 文本流式”“句段级排队”“音频字节流式”。

## 8. 最终判断

Akane 在“长期记忆可追溯、人格分层、模型输出协议、语音提供方降级”上明显领先；V-Manager 在“Windows 本机事务、Live2D 参数化动作、明确关系数值、个人版轻量性、ElevenLabs 情绪语音”上更贴近当前目标。

最合理的方向不是合并两个项目，而是把 Akane 的以下四个机制移植为 V-Manager 原生实现：

1. 原始对话永久可追溯。
2. 情节记忆和长期语义记忆分层。
3. 核心人格与可成长表达侧面分离。
4. ElevenLabs、本地 GPT-SoVITS、Edge TTS 的降级链。

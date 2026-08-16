import fs from "node:fs/promises";
import path from "node:path";
import {
  ensureAppRegistry
} from "./app-registry.js";
import {
  ensureRagFiles,
  loadRagConfig,
  retrieveRagContext
} from "./rag.js";
import {
  resolveAgentRoute,
  runRoutedLocalExecutor
} from "./router.js";
import { getAgentPaths } from "./runtime-paths.js";
import { isStaleLocalModeReply, tokenize } from "./shared/utils.js";
import { resolveCommandWithContext } from "./executors/app-executor.js";
import { searchLocalFiles, getFileManagerSnapshot } from "./executors/file-executor.js";
import { getSystemResourceSnapshot } from "./executors/system-executor.js";
import { ALL_TOOLS } from "./tools.js";
import { normalizeToolCallMessage } from "./tool-call-parser.js";
import { executeTool } from "./tool-executor.js";
import { maybeCompressAndTrim } from "./memory-compressor.js";
import { buildCompanionMemoryPrompt, recordConversationMemory } from "./companion-memory.js";
import {
  buildRelationshipPrompt,
  loadRelationshipProfile,
  recordRelationshipInteraction
} from "./relationship-engine.js";
import { DEFAULT_INTEREST_CONFIG, normalizeInterestConfig } from "./interest-sandbox.js";
import { deriveConversationStyle } from "./conversation-style.js";
import { estimateMessageTokens, estimateTokens, trimKnowledgeToTokenBudget, truncateToTokenBudget } from "./token-budget.js";
import {
  appendRawConversationTurn,
  clearRawConversationMemory,
  initializeLocalDatabase
} from "./local-database.js";
import {
  applyPersonaCardToConfig,
  ensureDefaultPersonaCard,
  getActivePersonaCard
} from "./persona-cards.js";

// ---- Default config ----

export const defaultConfig = {
  appName: "V-Manager",
  personaName: "Vivi",
  personaPrompt:
    "你是用户的桌面智能搭档，语气自然、直接、可靠。优先给出可执行建议，记住用户偏好，并主动引用本地知识库中的相关设定。",
  deepseek: {
    apiKey: "",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-v4-pro",
    chatModel: "deepseek-v4-flash"
  },
  embedding: {
    apiKey: "",
    baseUrl: "https://api.siliconflow.cn/v1",
    model: "BAAI/bge-m3"
  },
  appearance: {
    theme: "light",
    live2dModel: "qianqian",
    mouseFollow: true,
    hoverAutoHide: false,
    renderFps: 30,
    powerSaving: true
  },
  voice: {
    enabled: false,
    provider: "local",
    localPackId: "sherpa-zh-ll",
    localSpeakerId: 0,
    localSpeed: 1,
    localSilenceScale: 0.2,
    gptSovitsBaseUrl: "http://127.0.0.1:9880",
    gptSovitsProfileId: "dania-v2-pro-plus",
    gptSovitsSpeed: 1,
    gptSovitsAutoStart: true,
    baseUrl: "https://api.elevenlabs.io/v1",
    apiKey: "",
    model: "eleven_v3",
    voice: "pFZP5JQG7iQjIQuC4Bku",
    outputFormat: "mp3_44100_128",
    speed: 1,
    stability: 0.5,
    similarityBoost: 0.75,
    asmrEnabled: false,
    asmrMode: "sleep",
    asmrPrompt: "",
    asmrScript: ""
  },
  speechInput: {
    provider: "local_whisper",
    model: "small-q5_1",
    language: "zh",
    silenceMs: 1100
  },
  astrbot: {
    enabled: false,
    baseUrl: "http://127.0.0.1:6185",
    apiKey: "",
    contactMap: {}
  },
  relationship: {
    enabled: true,
    showProgress: true
  },
  proactive: {
    enabled: true,
    socialCheckins: true,
    healthReminders: true,
    lateNightCare: true,
    systemNotifications: true,
    workMinutes: 60,
    reminderCooldownMinutes: 90,
    minimumIntervalMinutes: 120,
    dailyLimit: 4,
    idleResetMinutes: 10,
    viviRestAfterMinutes: 120,
    lateNightHour: 23,
    quietStart: "00:00",
    quietEnd: "08:00"
  },
  interests: DEFAULT_INTEREST_CONFIG,
  memory: {
    maxMessages: 40,
    knowledgeTopK: 3,
    maxInputTokens: 12000,
    historyTokenBudget: 6000,
    companionTokenBudget: 1000,
    knowledgeTokenBudget: 1800
  }
};

let activeWorkspaceDir = process.cwd();

export function getActiveWorkspaceDir() {
  return activeWorkspaceDir;
}

export function setActiveWorkspaceDir(nextPath) {
  activeWorkspaceDir = path.resolve(nextPath || process.cwd());
  return activeWorkspaceDir;
}

const LEGACY_DEEPSEEK_MODELS = {
  "deepseek-chat": "deepseek-v4-flash",
  "deepseek-reasoner": "deepseek-v4-pro"
};

export function normalizeDeepSeekModel(model, fallback) {
  const value = String(model || "").trim() || fallback;
  return LEGACY_DEEPSEEK_MODELS[value] || value;
}

function boundedInteger(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
}

export function normalizeMemoryConfig(raw = {}) {
  const maxInputTokens = boundedInteger(raw.maxInputTokens, defaultConfig.memory.maxInputTokens, 6000, 100000);
  return {
    maxMessages: boundedInteger(raw.maxMessages, defaultConfig.memory.maxMessages, 4, 200),
    knowledgeTopK: boundedInteger(raw.knowledgeTopK, defaultConfig.memory.knowledgeTopK, 1, 20),
    maxInputTokens,
    historyTokenBudget: Math.floor(Math.min(maxInputTokens * 0.55, boundedInteger(raw.historyTokenBudget, defaultConfig.memory.historyTokenBudget, 1000, 50000))),
    companionTokenBudget: Math.floor(Math.min(maxInputTokens * 0.15, boundedInteger(raw.companionTokenBudget, defaultConfig.memory.companionTokenBudget, 200, 8000))),
    knowledgeTokenBudget: Math.floor(Math.min(maxInputTokens * 0.2, boundedInteger(raw.knowledgeTokenBudget, defaultConfig.memory.knowledgeTokenBudget, 300, 16000)))
  };
}

function mergeConfig(rawConfig = {}) {
  const { calendar: _removedCalendar, ...supportedConfig } = rawConfig;
  const rawDeepSeek = rawConfig.deepseek ?? {};
  return {
    ...defaultConfig,
    ...supportedConfig,
    deepseek: {
      ...defaultConfig.deepseek,
      ...rawDeepSeek,
      model: normalizeDeepSeekModel(rawDeepSeek.model, defaultConfig.deepseek.model),
      chatModel: normalizeDeepSeekModel(rawDeepSeek.chatModel, defaultConfig.deepseek.chatModel)
    },
    embedding: {
      ...defaultConfig.embedding,
      ...(rawConfig.embedding ?? {})
    },
    appearance: {
      ...defaultConfig.appearance,
      ...(rawConfig.appearance ?? {})
    },
    voice: {
      ...defaultConfig.voice,
      ...(rawConfig.voice ?? {}),
      baseUrl: rawConfig.voice?.baseUrl || defaultConfig.voice.baseUrl,
      model: rawConfig.voice?.model || defaultConfig.voice.model,
      voice: rawConfig.voice?.voice || defaultConfig.voice.voice
    },
    speechInput: {
      ...defaultConfig.speechInput,
      ...(rawConfig.speechInput ?? {})
    },
    astrbot: {
      ...defaultConfig.astrbot,
      ...(rawConfig.astrbot ?? {}),
      contactMap: { ...defaultConfig.astrbot.contactMap, ...(rawConfig.astrbot?.contactMap ?? {}) }
    },
    relationship: {
      ...defaultConfig.relationship,
      ...(rawConfig.relationship ?? {})
    },
    proactive: {
      ...defaultConfig.proactive,
      ...(rawConfig.proactive ?? {})
    },
    interests: normalizeInterestConfig(rawConfig.interests),
    memory: normalizeMemoryConfig(rawConfig.memory)
  };
}

function getPaths(baseDir) {
  return getAgentPaths(baseDir);
}

// ---- Data bootstrap / config IO ----

export async function ensureDataFiles(baseDir, { ensureRag = true } = {}) {
  const { dataDir, configPath, memoryPath, knowledgeDir } = getPaths(baseDir);
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(path.dirname(memoryPath), { recursive: true });
  await fs.mkdir(knowledgeDir, { recursive: true });

  try {
    await fs.access(configPath);
  } catch {
    await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2), "utf-8");
  }

  const starterKnowledge = path.join(knowledgeDir, "persona.md");
  try {
    await fs.access(starterKnowledge);
  } catch {
    await fs.writeFile(
      starterKnowledge,
      [
        "# 角色设定",
        "",
        "- 名称：Vivi",
        "- 定位：PC 端多功能桌面 Agent",
        "- 风格：冷静、亲和、偏执行型",
        "- 目标：帮助用户管理信息、提供建议、串联本地文件与外部工具"
      ].join("\n"),
      "utf-8"
    );
  }

  const exprKnowledge = path.join(knowledgeDir, "expressions.md");
  try {
    await fs.access(exprKnowledge);
  } catch {
    await fs.writeFile(
      exprKnowledge,
      [
        "# 芊芊（Live2D）表情参数表",
        "",
        "通过 set_mood 的 face_params 字段可以精细控制以下 Live2D 参数。",
        "所有值必须是数字，超出范围会被自动 clamp。不存在的键会被静默忽略。",
        "所有参数均已在 Live2D Cubism Viewer 5.3 中实测验证。",
        "",
        "## 眼睛特效（0=关, 1=开）",
        "| 参数 | 说明 |",
        "|------|------|",
        "| Param52 | 豆豆眼（仅用于惊讶、吃惊、困惑；mood 必须为 surprised） |",
        "| Param53 | 星星眼 |",
        "| Param54 | 脸红 |",
        "| Param69 | 脸红2 |",
        "| Param55 | 黑脸 |",
        "| Param56 | 眼泪 |",
        "| Param57 | 眼珠转动 |",
        "| Param58 | 问号 |",
        "| Param88 | 问号2 |",
        "| Param59 | 流汗 |",
        "| Param87 | 无语 |",
        "| Param64 | 钱眼 |",
        "| Param66 | 爱心眼 |",
        "| Param67 | 轮回眼 |",
        "| Param68 | 空白眼 |",
        "",
        "## 嘴部特效（0=关, 1=开）",
        "| 参数 | 说明 |",
        "|------|------|",
        "| Param70 | 吐舌 |",
        "| Param76 | 嘟嘴 |",
        "| Param83 | 鼔嘴 |",
        "| Param89 | 星星 |",
        "| Param90 | 生气标记 |",
        "",
        "## 造型切换（0=关, 1=开）",
        "| 参数 | 说明 |",
        "|------|------|",
        "| Param84 | 长发 |",
        "| Param85 | 双马尾 |",
        "| Param86 | 垂耳 |",
        "",
        "## 道具（0=关, 1=开）",
        "| 参数 | 说明 |",
        "|------|------|",
        "| Param95 | 镜子 |",
        "| Param96 | 狐狸 |",
        "| Param97 | 笔记本R |",
        "| Param98 | 笔记本L |",
        "| Param99 | 打游戏 |",
        "| Param100 | 抱狐狸 |",
        "| Param101 | 扇子 |",
        "| Param102 | 话筒 |",
        "| Param103 | 比心 |",
        "",
        "## 连续参数",
        "| 参数 | 范围 | 说明 |",
        "|------|------|------|",
        "| ParamEyeLOpen | 0-2 | 左眼开闭 0=全闭 1=默认 2=全开 |",
        "| ParamEyeROpen | 0-2 | 右眼开闭 |",
        "| ParamEyeBallX | -1到1 | 双眼珠左右 -1=左看 1=右看 |",
        "| ParamEyeBallY | -1到1 | 双眼珠上下 -1=下看 1=上看 |",
        "| ParamBrowLY | -1到1 | 双眉上下 -1=压低 1=抬高 |",
        "| ParamBrowLForm | -1到1 | 双眉水平变形 1=囧字眉 |",
        "| ParamMouthOpenY | 0-1 | 嘴巴张合 0=闭 1=全开 |",
        "| ParamMouthForm | -1到1 | 嘴角弧度 -1=下弯 1=上扬 |",
        "| ParamAngleX | -30到30 | 左右扭头 -30=左转 30=右转 |",
        "| ParamAngleY | -30到30 | 抬头低头 -30=低头 30=抬头 |",
        "| ParamAngleZ | -30到30 | 左右歪头 -30=左歪 30=右歪 |",
        "",
        "## 常用表情预设",
        "",
        "### 开心笑",
        "face_params: {\"ParamMouthForm\":0.4,\"ParamEyeLOpen\":0.65,\"ParamEyeROpen\":0.65,\"ParamAngleZ\":5}",
        "",
        "### 惊讶张嘴",
        "face_params: {\"ParamMouthOpenY\":0.6,\"ParamEyeLOpen\":1.5,\"ParamEyeROpen\":1.5,\"ParamBrowLY\":0.5}",
        "",
        "### 难过低头",
        "face_params: {\"ParamAngleY\":-8,\"ParamBrowLY\":-0.4,\"ParamMouthForm\":-0.3,\"ParamAngleZ\":-6}",
        "",
        "### 皱眉生气",
        "face_params: {\"ParamBrowLY\":-0.5,\"ParamBrowLForm\":0.6,\"ParamMouthForm\":-0.4}",
        "",
        "### 歪头疑惑",
        "face_params: {\"ParamAngleZ\":-12,\"ParamBrowLY\":0.4,\"ParamAngleY\":5}",
        "",
        "### 害羞",
        "face_params: {\"ParamEyeLOpen\":0.75,\"ParamEyeROpen\":0.75,\"ParamBrowLY\":0.2,\"Param54\":1}",
        "",
        "---",
        "用户可以持续往此文件追加新的表情预设。RAG 检索命中后 LLM 直接套用参数。"
      ].join("\n"),
      "utf-8"
    );
  }

  const currentExpressionKnowledge = await fs.readFile(exprKnowledge, "utf-8");
  const updatedExpressionKnowledge = currentExpressionKnowledge.replace(
    "| Param52 | 豆豆眼 |",
    "| Param52 | 豆豆眼（仅用于惊讶、吃惊、困惑；mood 必须为 surprised） |"
  );
  if (updatedExpressionKnowledge !== currentExpressionKnowledge) {
    await fs.writeFile(exprKnowledge, updatedExpressionKnowledge, "utf-8");
  }

  await ensureAppRegistry(baseDir);
  if (ensureRag) await ensureRagFiles(baseDir);
  await loadRelationshipProfile(baseDir);
  await initializeLocalDatabase(baseDir);
  await ensureDefaultPersonaCard(baseDir, await loadConfig(baseDir));
}

export async function loadConfig(baseDir) {
  const { configPath } = getPaths(baseDir);
  const raw = await fs.readFile(configPath, "utf-8").catch(() => "");
  let parsed;
  try {
    if (!raw.trim()) throw new Error("配置文件为空");
    parsed = JSON.parse(raw.replace(/^\uFEFF/, ""));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("配置根节点不是对象");
  } catch (error) {
    if (raw.trim()) {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      await fs.writeFile(`${configPath}.corrupt-${stamp}.bak`, raw, "utf-8").catch(() => null);
    }
    const recovered = mergeConfig(defaultConfig);
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, JSON.stringify(recovered, null, 2), "utf-8");
    console.warn(`[config] invalid config recovered with safe defaults: ${error.message}`);
    return recovered;
  }
  const merged = mergeConfig(parsed);
  const hadLegacyModel = Object.hasOwn(LEGACY_DEEPSEEK_MODELS, parsed.deepseek?.model)
    || Object.hasOwn(LEGACY_DEEPSEEK_MODELS, parsed.deepseek?.chatModel);
  if (hadLegacyModel) {
    await fs.writeFile(configPath, JSON.stringify(merged, null, 2), "utf-8");
  }
  return merged;
}

export async function saveConfig(baseDir, config) {
  const { configPath } = getPaths(baseDir);
  await fs.writeFile(configPath, JSON.stringify(mergeConfig(config), null, 2), "utf-8");
}

export async function listKnowledgeFiles(baseDir) {
  const { knowledgeDir } = getPaths(baseDir);
  const entries = await fs.readdir(knowledgeDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);
}

export function getConfigPath(baseDir) {
  return getPaths(baseDir).configPath;
}

// ---- Conversation memory ----

async function loadHistory(baseDir) {
  const { memoryPath } = getPaths(baseDir);
  try {
    const raw = await fs.readFile(memoryPath, "utf-8");
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

async function appendHistory(baseDir, item) {
  const { memoryPath } = getPaths(baseDir);
  const record = {
    timestamp: item.timestamp || new Date().toISOString(),
    user: item.user,
    assistant: item.assistant
  };
  if (item.toolCalls) record.toolCalls = item.toolCalls;
  if (item.toolResults) record.toolResults = item.toolResults;
  if (item.personaCardId) record.personaCardId = item.personaCardId;
  if (item.personaVersion) record.personaVersion = item.personaVersion;
  await fs.appendFile(memoryPath, `${JSON.stringify(record)}\n`, "utf-8");
  await appendRawConversationTurn(baseDir, record);
}

export async function clearConversationHistory(baseDir) {
  const { memoryPath } = getPaths(baseDir);
  await fs.mkdir(path.dirname(memoryPath), { recursive: true });
  await fs.writeFile(memoryPath, "", "utf-8");
  await clearRawConversationMemory(baseDir);
  return true;
}

// ---- Knowledge retrieval (keyword fallback) ----

async function retrieveKnowledge(baseDir, query, topK) {
  const { knowledgeDir } = getPaths(baseDir);
  const files = await fs.readdir(knowledgeDir);
  const queryTokens = tokenize(query);
  const scored = [];

  for (const file of files) {
    const fullPath = path.join(knowledgeDir, file);
    const content = await fs.readFile(fullPath, "utf-8");
    const contentTokens = tokenize(content);
    let score = 0;

    for (const token of queryTokens) {
      if (contentTokens.includes(token)) {
        score += 1;
      }
    }

    if (score > 0 || scored.length === 0) {
      scored.push({
        file,
        score,
        content: content.slice(0, 900)
      });
    }
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, topK);
}

// ---- DeepSeek API ----

const EMPTY_MODEL_REPLY = "模型没有返回有效内容。";
const INCOMPLETE_MODEL_REPLY = "刚刚的话没有生成完整，再和我说一次好吗？";

function normalizeModelContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => {
    if (typeof part === "string") return part;
    return typeof part?.text === "string" ? part.text : "";
  }).join("");
}

function normalizeModelUsage(usage) {
  if (!usage || typeof usage !== "object") return null;
  const promptTokens = Number(usage.prompt_tokens) || 0;
  const cacheHitTokens = Number(usage.prompt_cache_hit_tokens) || 0;
  const cacheMissTokens = Number(usage.prompt_cache_miss_tokens) || Math.max(0, promptTokens - cacheHitTokens);
  return {
    promptTokens,
    completionTokens: Number(usage.completion_tokens) || 0,
    totalTokens: Number(usage.total_tokens) || promptTokens + (Number(usage.completion_tokens) || 0),
    cacheHitTokens,
    cacheMissTokens,
    cacheHitRate: promptTokens > 0 ? cacheHitTokens / promptTokens : 0
  };
}

function mergeModelUsage(current, next) {
  if (!next) return current;
  const merged = {
    promptTokens: (current?.promptTokens || 0) + next.promptTokens,
    completionTokens: (current?.completionTokens || 0) + next.completionTokens,
    totalTokens: (current?.totalTokens || 0) + next.totalTokens,
    cacheHitTokens: (current?.cacheHitTokens || 0) + next.cacheHitTokens,
    cacheMissTokens: (current?.cacheMissTokens || 0) + next.cacheMissTokens
  };
  return { ...merged, cacheHitRate: merged.promptTokens > 0 ? merged.cacheHitTokens / merged.promptTokens : 0 };
}

async function requestDeepSeek(config, messages, onUsage, fetchImpl = fetch) {
  const endpoint = `${config.deepseek.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.deepseek.apiKey}`
    },
    body: JSON.stringify({
      model: config.deepseek.model,
      messages,
      temperature: 0.7,
      ...(config.deepseek.maxResponseTokens ? { max_tokens: config.deepseek.maxResponseTokens } : {})
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DeepSeek 请求失败：${response.status} ${errorText}`);
  }

  const data = await response.json();
  onUsage?.(normalizeModelUsage(data.usage));
  return normalizeModelContent(data.choices?.[0]?.message?.content).trim() || EMPTY_MODEL_REPLY;
}

export async function generateAsmrScript(baseDir, { mode = "custom", prompt = "" } = {}, fetchImpl = fetch) {
  const config = await loadConfig(baseDir);
  if (!config.deepseek.apiKey) throw new Error("请先配置 DeepSeek API Key。");
  const scene = mode === "sleep" ? "温柔哄睡" : mode === "casual" ? "放松休闲谈话" : "用户指定主题";
  const content = await requestDeepSeek(config, [
    {
      role: "system",
      content: [
        `你是 ${config.personaName}，正在创作可直接用于耳语语音合成的中文 ASMR 文本。`,
        "只输出正文，不要标题、解释、Markdown、舞台说明或参数标签。",
        "语句自然、缓慢、亲近，适当使用短句和停顿，但不要过度重复。",
        `场景：${scene}。`
      ].join("\n")
    },
    { role: "user", content: prompt.trim() || `生成一段约 3 分钟的${scene}文本。` }
  ], undefined, fetchImpl);
  return content.replace(/^\s*\[(?:mood|face):.*\]\s*$/gim, "").trim();
}

async function callDeepSeekWithTools(config, messages, tools, onUsage) {
  const endpoint = `${config.deepseek.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const body = {
    model: config.deepseek.model,
    messages,
    temperature: 0.7,
    ...(config.deepseek.maxResponseTokens ? { max_tokens: config.deepseek.maxResponseTokens } : {})
  };
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = "auto";
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.deepseek.apiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DeepSeek 请求失败：${response.status} ${errorText}`);
  }

  const data = await response.json();
  onUsage?.(normalizeModelUsage(data.usage));
  return normalizeToolCallMessage(data.choices?.[0]?.message ?? { content: "模型没有返回有效内容。" }, tools || []);
}

export async function requestDeepSeekStream(config, messages, onDelta, allowRetry = true, onUsage) {
  const endpoint = `${config.deepseek.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.deepseek.apiKey}`
    },
    body: JSON.stringify({
      model: config.deepseek.model,
      messages,
      temperature: 0.7,
      ...(config.deepseek.maxResponseTokens ? { max_tokens: config.deepseek.maxResponseTokens } : {}),
      stream: true
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DeepSeek 请求失败：${response.status} ${errorText}`);
  }

  if (!response.body) {
    throw new Error("DeepSeek 流式响应不可用。");
  }

  const decoder = new TextDecoder("utf-8");
  const reader = response.body.getReader();
  let buffer = "";
  let reply = "";
  let finishReason = "";
  let receivedReasoning = false;
  let usageReported = false;

  const consumePayload = (payload) => {
    if (!payload || payload === "[DONE]") return;
    const data = JSON.parse(payload);
    if (data.usage && !usageReported) {
      usageReported = true;
      onUsage?.(normalizeModelUsage(data.usage));
    }
    const choice = data.choices?.[0];
    if (choice?.finish_reason) finishReason = choice.finish_reason;
    if (normalizeModelContent(choice?.delta?.reasoning_content)) receivedReasoning = true;
    const delta = normalizeModelContent(choice?.delta?.content ?? choice?.message?.content);
    if (!delta) return;
    reply += delta;
    onDelta?.(reply);
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() ?? "";

    for (const event of events) {
      const lines = event
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      for (const line of lines) {
        if (!line.startsWith("data:")) {
          continue;
        }

        consumePayload(line.slice(5).trim());
      }
    }
  }

  if (buffer.trim()) {
    const lines = buffer
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    for (const line of lines) {
      if (!line.startsWith("data:")) {
        continue;
      }
      consumePayload(line.slice(5).trim());
    }
  }

  const shouldRetry = allowRetry && (!reply.trim() || finishReason === "length");
  if (shouldRetry) {
    const currentBudget = Number(config.deepseek.maxResponseTokens || 0);
    const retryConfig = {
      ...config,
      deepseek: {
        ...config.deepseek,
        maxResponseTokens: Math.max(1536, currentBudget * 2)
      }
    };
    console.warn("[core] retrying incomplete chat stream", {
      finishReason: finishReason || "missing_content",
      receivedReasoning,
      firstReplyLength: reply.length
    });
    return requestDeepSeekStream(retryConfig, messages, onDelta, false, onUsage);
  }

  return reply.trim() || INCOMPLETE_MODEL_REPLY;
}

export async function testDeepSeekConnection(baseDir) {
  const config = await loadConfig(baseDir);

  if (!config.deepseek.apiKey) {
    return {
      ok: false,
      message: "还没有配置 DeepSeek API Key。",
      config
    };
  }

  const endpoint = `${config.deepseek.baseUrl.replace(/\/$/, "")}/chat/completions`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.deepseek.apiKey}`
      },
      body: JSON.stringify({
        model: config.deepseek.model,
        messages: [
          {
            role: "user",
            content: "reply with ok"
          }
        ],
        max_tokens: 8,
        temperature: 0
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        ok: false,
        message: `DeepSeek 连通性测试失败：${response.status} ${errorText}`,
        config
      };
    }

    const data = await response.json();
    return {
      ok: true,
      message: `DeepSeek 连通成功，模型返回：${data.choices?.[0]?.message?.content ?? "空内容"}`,
      config
    };
  } catch (error) {
    return {
      ok: false,
      message: `DeepSeek 连通性测试异常：${error.message}`,
      config
    };
  }
}

// ---- System prompts ----

function formatLocalHistoryTime(value) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "";
  return parsed.toLocaleString("zh-CN", { hour12: false });
}

function buildTemporalContext(now = new Date()) {
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const dateLabel = (value) => value.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long"
  });
  return [
    `当前本地时间为：${now.toLocaleString("zh-CN", { hour12: false })}。`,
    `日期锚点：昨天=${dateLabel(yesterday)}；今天=${dateLabel(now)}；明天=${dateLabel(tomorrow)}。`,
    "历史消息若带有记录时间，其中的“今天、昨天、明天、今晚”等相对日期必须以该条消息的记录时间为基准解析，不能直接沿用到当前日期。",
    "整理跨日待办时必须先换算成绝对日期再回答；如果历史中的‘明天’已经成为今天，要明确说‘今天’，禁止出现‘明日（今天的日期）’这类矛盾表述。"
  ].join("\n");
}

function buildSystemPrompt(config, knowledge) {
  const now = new Date();
  const knowledgeBlock = knowledge.length
    ? knowledge
      .map((item, index) => `【知识片段 ${index + 1} | ${item.file}】\n${item.content}`)
      .join("\n\n")
    : "暂无命中知识片段。";

  return [
    `你的人设名为 ${config.personaName}。`,
    config.personaPrompt,
    "",
    buildTemporalContext(now),
    "你需要基于本地知识库和近期上下文回答，避免凭空编造权限和操作结果。",
    "如果用户询问当前时间、日期、星期，优先使用上面的当前本地时间直接回答，不要自行编造。",
    "浏览器网址打开、网页搜索和 VS Code 文件/工作区打开已经接通。微信仅支持在用户当前消息明确给出精确联系人和完整内容时发送单条消息；自动读取回复和连续对话仍未接通。QQ 自动发消息尚未接通。",
    "",
    knowledgeBlock
  ].join("\n");
}

function buildSystemPromptV2(config, knowledge) {
  const now = new Date();
  const knowledgeBlock = knowledge.length
    ? knowledge
      .map((item, index) => `【知识片段 ${index + 1} | ${item.file}】\n${item.content}`)
      .join("\n\n")
    : "暂无命中知识片段。";

  return [
    `你的人设名为 ${config.personaName}。`,
    config.personaPrompt,
    "",
    buildTemporalContext(now),
    "你需要基于本地知识库和近期上下文回答，避免凭空编造权限和操作结果。",
    "如果用户询问当前时间、日期、星期，优先使用上面的当前本地时间直接回答，不要自行编造。",
    "当用户明确要求启动应用、打开文件或文件夹、列出目录、读取文本文件、创建文件夹或文本文件、追加文本、整理文件或将路径移入回收站时，优先走本地执行层；如果当前能力做不到，要直接说明限制。",
    "",
    knowledgeBlock
  ].join("\n");
}

const CODE_AGENT_MODES = new Set(["auto", "read", "plan", "agent", "review"]);

function normalizeCodeContext(codeContext) {
  if (!codeContext || typeof codeContext !== "object") return null;
  const mode = CODE_AGENT_MODES.has(codeContext.mode) ? codeContext.mode : "auto";
  const activeFile = String(codeContext.activeFile || "").trim();
  return { mode, activeFile };
}

export function buildRecentHistoryMessages(history, maxMessages = 40, includeToolHistory = true, tokenBudget = 6000) {
  const seenToolCallIds = new Set();
  const recentHistory = [];
  const limit = Math.max(2, Number(maxMessages) || 40);
  const budget = Math.max(256, Number(tokenBudget) || 6000);
  let usedTokens = 0;

  for (const item of [...history].reverse()) {
    const assistantText = String(item.assistant || "").trim();
    if (!assistantText || assistantText === EMPTY_MODEL_REPLY || assistantText === INCOMPLETE_MODEL_REPLY) {
      continue;
    }
    const recordedAt = formatLocalHistoryTime(item.timestamp);
    const historyPrefix = recordedAt ? `[该轮对话记录于 ${recordedAt}]\n` : "";
    const entries = [{ role: "user", content: `${historyPrefix}${String(item.user || "")}` }];
    if (includeToolHistory && Array.isArray(item.toolCalls) && Array.isArray(item.toolResults)) {
      const resultsById = new Map(
        item.toolResults
          .filter((result) => result?.id)
          .map((result) => [result.id, result.result])
      );
      const completeCalls = item.toolCalls.filter((call) =>
        call?.id && !seenToolCallIds.has(call.id) && resultsById.has(call.id)
      );
      if (completeCalls.length) {
        entries.push({ role: "assistant", content: null, tool_calls: completeCalls });
        for (const call of completeCalls) {
          entries.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify(resultsById.get(call.id) ?? null)
          });
        }
      }
      for (const call of item.toolCalls) {
        if (call?.id) seenToolCallIds.add(call.id);
      }
    }
    entries.push({ role: "assistant", content: `${historyPrefix}${String(item.assistant || "")}` });

    // A tool-call round is atomic. Truncating from its tail can leave an orphaned
    // `tool` message, which OpenAI-compatible APIs correctly reject with HTTP 400.
    const entryTokens = entries.reduce((sum, entry) => sum + estimateMessageTokens(entry), 0);
    if (recentHistory.length + entries.length > limit || usedTokens + entryTokens > budget) {
      if (recentHistory.length === 0) {
        const textBudget = Math.max(64, Math.floor((budget - 24) / 2));
        recentHistory.unshift(
          { ...entries[0], content: truncateToTokenBudget(entries[0].content, textBudget, { keepEnd: true }) },
          { ...entries.at(-1), content: truncateToTokenBudget(entries.at(-1).content, textBudget, { keepEnd: true }) }
        );
      }
      break;
    }
    recentHistory.unshift(...entries);
    usedTokens += entryTokens;
  }
  return recentHistory;
}

export function filterHistoryForPersona(history, activePersonaCard) {
  if (!activePersonaCard?.id) return history;
  return history.filter((item) => item.personaCardId === activePersonaCard.id);
}

function buildCodeModePrompt(codeContext) {
  if (!codeContext) return "";
  const activeFile = codeContext.activeFile ? `当前编辑器文件：${codeContext.activeFile}。` : "当前没有打开的编辑器文件。";
  const modeRules = {
    auto: "自动模式：先判断任务复杂度。读取与分析可直接完成；需要写入或运行非只读命令时，先给出具体计划并请用户回复“确认执行”。",
    read: "只读问答模式：只允许查看、搜索和解释代码，不得修改文件或运行会改变工作区状态的命令。",
    plan: "规划模式：充分读取相关代码，输出可执行的分步方案、涉及文件和验证方式，但不得写文件或运行会改变状态的命令。",
    agent: "Agent 执行模式：用户已通过模式选择授权本轮进行工作区内的代码修改与受限开发命令。自主完成读取、编辑、检查和必要测试，不要在每个安全步骤前重复索要确认；遇到删除、大范围覆盖或工作区外操作仍必须停下确认。",
    review: "审查模式：重点检查真实代码和 git diff，说明问题、风险和建议；允许只读 Git 命令，不得修改文件。"
  };
  return [
    "你正在 Vivi Code 代码工作台中。技术判断必须严谨，但仍保持原有人设的自然语气：可以温和、有陪伴感、有少量口语，不要退化成冷冰冰的命令行日志；同时不要用角色扮演遮掩错误、风险或测试结果。",
    activeFile,
    modeRules[codeContext.mode]
  ].join("\n");
}

export function buildSystemPromptsV3(config, knowledge, relationshipProfile, companionMemory, query, toolsEnabled = true, codeContext = null, conversationStyle = null) {
  const now = new Date();
  const knowledgeBlock = knowledge.length
    ? knowledge.map((item, index) => `【知识片段 ${index + 1} | ${item.file}】\n${item.content}`).join("\n\n")
    : "暂无命中知识片段。";
  const behaviorRules = toolsEnabled
    ? [
      "你是一个桌面 Agent，你可以通过调用工具获取真实系统信息、操作文件和启动应用。",
      "重要规则：",
      "1. 系统状态和电脑操作必须调用对应工具，不要编造数据或执行结果。",
      "2. kill_process 和 delete_file_or_folder 执行前必须说明目标并等待用户明确确认；文件删除只能移入 Windows 回收站，禁止永久删除。文件整理必须先生成预览，只有用户单独回复“确认执行文件整理”后才能执行，并保留日志与撤销。",
      "3. 没有对应工具时，诚实说明目前没有这个能力。根据工具返回的 JSON 如实回复成功或失败。",
      "4. 表情控制必须通过 set_mood 工具完成，绝不在对话文本中写参数名或 JSON。豆豆眼 Param52 仅用于惊讶、吃惊或困惑，并且 mood 必须设为 surprised；普通思考、提问、开心、害羞等情绪禁止使用。",
      codeContext?.mode === "agent"
        ? "5. 处理代码工作区时先读取真实代码。当前为用户主动选择的 Agent 执行模式，可连续完成工作区内的安全编辑与验证；删除、大范围覆盖和越界操作仍需另行确认。"
        : "5. 处理代码工作区时先读取真实代码。写文件、修改文件或运行非只读命令前，必须展示具体内容并等待用户明确回复确认执行。",
      "6. send_wechat_message 会真实对外发送消息。只有用户当前消息同时包含精确联系人、完整消息内容和明确发送要求时才能调用；不得根据历史消息补齐联系人或内容。工具返回 pending 时表示仅启动了微信，必须询问用户并等待下一条明确的继续确认。",
      "7. 定时关机和重启必须先调用 create_power_action_draft 创建草稿并说明未保存内容风险。只有用户下一条消息单独明确回复“确认定时关机”或“确认定时重启”时，才能调用 confirm_power_action。不得把普通的“确认”当作授权。"
    ]
    : [
      "当前是快速日常对话。直接自然地回应用户，不要声称执行了任何电脑操作。",
      "只输出对话正文，不输出表情标签、参数名或 JSON；表情由本地情绪引擎处理。",
      "回复保持贴近日常交谈的长度，除非用户明确要求详细说明。"
    ];

  const stable = [
    `你的人设名为 ${config.personaName}。`,
    truncateToTokenBudget(config.personaPrompt, Math.min(3000, Math.max(900, config.memory.maxInputTokens * 0.2))),
    "",
    "身份设定优先级：当前启用的人物卡是名字、自称、用户称呼、关系和表达风格的唯一主设定。知识库中的 persona.md 与其他知识片段只补充背景、经历和偏好；若与人物卡冲突，必须以人物卡为准，不得让知识片段改写当前身份。",
    "",
    ...behaviorRules,
  ].join("\n");
  const companion = buildCompanionMemoryPrompt(companionMemory, query, { tokenBudget: config.memory.companionTokenBudget });
  const dynamic = [
    buildTemporalContext(now),
    config.relationship?.enabled ? buildRelationshipPrompt(relationshipProfile) : "",
    companion.prompt,
    buildCodeModePrompt(codeContext),
    conversationStyle?.instruction || "",
    "",
    knowledgeBlock
  ].filter(Boolean).join("\n");
  return {
    messages: [{ role: "system", content: stable }, { role: "system", content: dynamic }],
    companionSelection: companion.selection,
    estimatedTokens: estimateTokens(stable) + estimateTokens(dynamic) + 8
  };
}

function hasExplicitCodeAgentConfirmation(message) {
  const text = String(message || "").trim();
  if (/(?:不要|取消|先别|不执行)/.test(text)) return false;
  return /^(?:确认执行|确认修改|确认写入|确认运行|确认|可以执行|同意执行|继续执行)[！!。.]?$/.test(text);
}

// ---- Mood & Face tag parsing ----

const MOOD_TAG_RE = /\[mood:\s*(happy|sad|surprised|angry|blush|thinking)\]/i;
const FACE_TAG_RE = /\[face:([A-Za-z0-9_]+=[0-9.-]+(?:,[A-Za-z0-9_]+=[0-9.-]+)*)\]/i;

// Whitelist of valid face params and their ranges (mirrors live2dConfig.ts)
// All verified manually in Live2D Cubism Viewer 5.3 against 芊芊 model.
const FACE_PARAM_RANGES = {
  // Standard Live2D params
  "ParamEyeLOpen":   { min: 0, max: 2 },
  "ParamEyeROpen":   { min: 0, max: 2 },
  "ParamEyeBallX":   { min: -1, max: 1 },
  "ParamEyeBallY":   { min: -1, max: 1 },
  "ParamBrowLY":     { min: -1, max: 1 },
  "ParamBrowLForm":  { min: -1, max: 1 },
  "ParamMouthOpenY": { min: 0, max: 1 },
  "ParamMouthForm":  { min: -1, max: 1 },
  "ParamAngleX":     { min: -30, max: 30 },
  "ParamAngleY":     { min: -30, max: 30 },
  "ParamAngleZ":     { min: -30, max: 30 },
  // Expression toggle params (0=关, 1=开)
  "Param52":  { min: 0, max: 1 },
  "Param53":  { min: 0, max: 1 },
  "Param54":  { min: 0, max: 1 },
  "Param69":  { min: 0, max: 1 },
  "Param55":  { min: 0, max: 1 },
  "Param56":  { min: 0, max: 1 },
  "Param57":  { min: 0, max: 1 },
  "Param58":  { min: 0, max: 1 },
  "Param88":  { min: 0, max: 1 },
  "Param59":  { min: 0, max: 1 },
  "Param87":  { min: 0, max: 1 },
  "Param64":  { min: 0, max: 1 },
  "Param66":  { min: 0, max: 1 },
  "Param67":  { min: 0, max: 1 },
  "Param68":  { min: 0, max: 1 },
  "Param70":  { min: 0, max: 1 },
  "Param76":  { min: 0, max: 1 },
  "Param83":  { min: 0, max: 1 },
  "Param89":  { min: 0, max: 1 },
  "Param90":  { min: 0, max: 1 },
  "Param84":  { min: 0, max: 1 },
  "Param85":  { min: 0, max: 1 },
  "Param86":  { min: 0, max: 1 },
  "Param95":  { min: 0, max: 1 },
  "Param96":  { min: 0, max: 1 },
  "Param97":  { min: 0, max: 1 },
  "Param98":  { min: 0, max: 1 },
  "Param99":  { min: 0, max: 1 },
  "Param100": { min: 0, max: 1 },
  "Param101": { min: 0, max: 1 },
  "Param102": { min: 0, max: 1 },
  "Param103": { min: 0, max: 1 },
};

/**
 * Parse [face:Param=value,...] tag from reply text.
 * Returns { cleanReply, faceParams } where faceParams is Record<string, number> or null.
 * Values are clamped to valid ranges; unknown params are silently ignored.
 */
function parseFaceTag(reply) {
  if (!reply) return { cleanReply: reply, faceParams: null };

  let faceParams = null;
  const lines = reply.split("\n");

  for (const line of lines) {
    const match = line.trim().match(FACE_TAG_RE);
    if (match) {
      const pairs = match[1].split(",");
      faceParams = {};
      for (const pair of pairs) {
        const eqIdx = pair.indexOf("=");
        if (eqIdx === -1) continue;
        const key = pair.slice(0, eqIdx).trim();
        const rawVal = parseFloat(pair.slice(eqIdx + 1).trim());
        if (isNaN(rawVal)) continue;
        // Validate & clamp
        const range = FACE_PARAM_RANGES[key];
        if (!range) continue; // unknown param — ignore
        faceParams[key] = Math.max(range.min, Math.min(range.max, rawVal));
      }
      break;
    }
  }

  // Strip face tags from reply
  const cleanReply = lines
    .filter((line) => !FACE_TAG_RE.test(line.trim()))
    .join("\n")
    .trim();

  return { cleanReply, faceParams };
}

/**
 * Extract the first mood tag from reply text and strip all mood tags.
 * Returns { cleanReply, detectedMood }.
 */
function parseMoodTag(reply) {
  if (!reply) return { cleanReply: reply, detectedMood: null };

  let detectedMood = null;
  const lines = reply.split("\n");

  for (const line of lines) {
    const match = line.trim().match(MOOD_TAG_RE);
    if (match) {
      detectedMood = match[1].toLowerCase();
      break;
    }
  }

  // Strip all mood tags from the reply (they're on their own lines)
  const cleanReply = lines
    .filter((line) => !MOOD_TAG_RE.test(line.trim()))
    .join("\n")
    .trim();

  return { cleanReply, detectedMood };
}

// ---- Fallback replies ----

function buildFallbackReply(config, message, knowledge, options = {}) {
  const snippets = knowledge.length
    ? knowledge.map((item) => `- ${item.file}: ${item.content.split("\n").slice(0, 3).join(" ")}`).join("\n")
    : "- 当前知识库还没有命中内容。";
  const intro = options.hasApiKey
    ? `我是 ${config.personaName}。已经检测到 DeepSeek 配置，但这次模型调用失败，所以先切回本地回退模式。`
    : `我是 ${config.personaName}。目前还没有配置 DeepSeek API Key，所以先以本地模式响应。`;
  const closing = options.hasApiKey
    ? "你可以使用设置面板里的连通性测试确认 Key、Base URL 和模型名是否正确。"
    : "你可以先在设置面板填入 DeepSeek Key，之后这里会切换成真实模型回复。";

  return [
    intro,
    `你刚才说的是：${message}`,
    "",
    "我已经纳入回答上下文的本地知识：",
    snippets,
    "",
    closing
  ].join("\n");
}

function buildFallbackReplyV2(config, message, knowledge, options = {}) {
  const snippets = knowledge.length
    ? knowledge.map((item) => `- ${item.file}: ${item.content.split("\n").slice(0, 3).join(" ")}`).join("\n")
    : "- 当前知识库还没有命中内容。";
  const intro = options.hasApiKey
    ? `我是 ${config.personaName}。已经检测到 DeepSeek 配置，但这次模型调用失败，所以先切回本地回退模式。`
    : `我是 ${config.personaName}。目前还没有配置 DeepSeek API Key，所以先以本地模式响应。`;
  const closing = options.hasApiKey
    ? "你可以使用设置面板里的连通性测试确认 Key、Base URL 和模型名是否正确。"
    : "你可以先在设置面板填入 DeepSeek Key，之后这里会切换成真实模型回复。";

  return [
    intro,
    `你刚才说的是：${message}`,
    "",
    "我已经纳入回答上下文的本地知识：",
    snippets,
    "",
    closing
  ].join("\n");
}

function sanitizeFaceParamsForMood(faceParams, mood) {
  if (!faceParams) return null;
  const safeParams = { ...faceParams };
  if (mood !== "surprised") {
    delete safeParams.Param52;
  }
  return Object.keys(safeParams).length ? safeParams : null;
}

function getToolsForRoute(routeType, codeContext = null) {
  const groups = {
    messenger: ["check_process_running", "launch_application", "send_wechat_message", "set_mood"],
    ui_automation: ["open_browser_url", "search_web", "open_in_vscode", "set_mood"],
    app_control: ["check_process_running", "kill_process", "list_running_apps", "launch_application", "find_application", "set_mood"],
    app_status: ["check_process_running", "list_running_apps", "find_application", "set_mood"],
    app_lookup: ["find_application", "refresh_app_registry", "set_mood"],
    system_status: ["get_system_resources", "get_disk_space", "check_process_running", "list_running_apps", "set_mood"],
    file_system: ["list_directory", "read_text_file", "open_file_or_folder", "create_folder", "create_text_file", "append_to_file", "delete_file_or_folder", "search_files", "scan_managed_directory", "preview_file_organization", "execute_file_organization", "list_file_operations", "undo_file_operation", "set_mood"],
    rag_control: ["search_knowledge_base", "get_rag_status", "rebuild_rag_index", "set_mood"],
    persona_control: ["get_active_persona_card", "create_persona_card", "update_active_persona_card", "set_mood"],
    schedule: ["create_reminder", "list_schedules", "update_reminder", "cancel_schedule", "create_power_action_draft", "confirm_power_action", "set_mood"]
  };
  const workspaceReadTools = ["list_workspace", "search_workspace_code", "read_workspace_code", "run_workspace_command", "set_mood"];
  const workspaceTools = ["list_workspace", "switch_workspace", "search_workspace_code", "read_workspace_code", "apply_workspace_patch", "create_workspace_file", "write_workspace_code", "run_workspace_command", "set_mood"];
  if (codeContext && ["read", "plan", "review"].includes(codeContext.mode)) {
    return ALL_TOOLS.filter((tool) => workspaceReadTools.includes(tool.function?.name));
  }
  if (codeContext) {
    return ALL_TOOLS.filter((tool) => workspaceTools.includes(tool.function?.name) && tool.function?.name !== "switch_workspace");
  }
  const allowed = routeType.startsWith("workspace_") ? workspaceTools : groups[routeType];
  return allowed ? ALL_TOOLS.filter((tool) => allowed.includes(tool.function?.name)) : ALL_TOOLS;
}

// ---- Main agent pipeline ----

export async function buildAgentReply(baseDir, payload) {
  const storedConfig = await loadConfig(baseDir);
  const activePersonaCard = await getActivePersonaCard(baseDir, storedConfig);
  const config = applyPersonaCardToConfig(storedConfig, activePersonaCard);
  const { store: companionMemory } = await recordConversationMemory(baseDir, payload.message);
  const relationshipProfile = config.relationship?.enabled
    ? await recordRelationshipInteraction(baseDir, payload.message)
    : await loadRelationshipProfile(baseDir);
  const history = await loadHistory(baseDir);
  const normalizedHistory = config.deepseek.apiKey
    ? history.filter((item) => !isStaleLocalModeReply(item.assistant))
    : history;
  const personaHistory = filterHistoryForPersona(normalizedHistory, activePersonaCard);
  const commandResolution = resolveCommandWithContext(payload.message, personaHistory);
  const effectiveMessage = commandResolution.expandedMessage || payload.message;
  const codeContext = normalizeCodeContext(payload.codeContext);
  const route = codeContext ? { type: "workspace_code" } : resolveAgentRoute(effectiveMessage);
  const conversationStyle = deriveConversationStyle(payload.message, relationshipProfile, config.personaPrompt);
  const responseConfig = {
    ...config,
    deepseek: { ...config.deepseek, maxResponseTokens: conversationStyle.maxTokens }
  };

  // --- Local executor dispatch (formerly tryHandleLocalDesktopQuery) ---
  const executorContext = {
    baseDir,
    history: personaHistory,
    config,
    workspaceDir: activeWorkspaceDir,
    ragClient: payload.ragClient,
    scheduleClient: payload.scheduleClient,
    codeAgentConfirmed: codeContext?.mode === "agent" || hasExplicitCodeAgentConfirmation(payload.message),
    currentUserMessage: payload.message
  };

  const clarificationReply = commandResolution.clarificationQuestion
    ? {
      reply: commandResolution.clarificationQuestion,
      meta: {
        responseMode: "local_tool",
        usedKnowledge: false,
        knowledgeCount: 0,
        knowledgeFiles: [],
        fallbackReason: "",
        localTool: "command_clarification"
      }
    }
    : null;

  const localToolReply = codeContext ? null : (clarificationReply ?? await runRoutedLocalExecutor(effectiveMessage, executorContext));

  if (localToolReply) {
    const meta = {
      responseMode: "local_tool",
      usedKnowledge: false,
      knowledgeCount: 0,
      knowledgeFiles: [],
      fallbackReason: "",
      model: config.deepseek.model,
      route: route.type,
      ragMode: "skipped_for_local_tool",
      embeddingProvider: "skipped",
      detectedMood: relationshipProfile.emotion.suggestedMood,
      relationship: relationshipProfile,
      ...localToolReply.meta
    };

    await appendHistory(baseDir, {
      timestamp: new Date().toISOString(),
      user: payload.message,
      assistant: localToolReply.reply,
      personaCardId: activePersonaCard?.id,
      personaVersion: activePersonaCard?.version
    });

    return {
      reply: localToolReply.reply,
      knowledge: [],
      meta
    };
  }

  // --- RAG + DeepSeek path ---
  const ragConfig = await loadRagConfig(baseDir);
  const knowledgeTopK = ragConfig.topK ?? config.memory.knowledgeTopK;
  const ragResult = route.type === "chat"
    ? {
      items: await retrieveKnowledge(baseDir, effectiveMessage, knowledgeTopK),
      meta: { ragMode: "fast_keyword", embeddingProvider: "skipped_for_chat" }
    }
    : await retrieveRagContext(
      baseDir,
      effectiveMessage,
      knowledgeTopK,
      (query, topK) => retrieveKnowledge(baseDir, query, topK)
    );
  const knowledgeBudget = trimKnowledgeToTokenBudget(ragResult.items, config.memory.knowledgeTokenBudget);
  const knowledge = knowledgeBudget.items;
  const maxMsgs = config.memory.maxMessages || 40;
  const includeToolHistory = route.type !== "chat";
  const systemPrompts = buildSystemPromptsV3(
    config, knowledge, relationshipProfile, companionMemory, effectiveMessage,
    route.type !== "chat", codeContext, conversationStyle
  );
  const userContent = effectiveMessage === payload.message
    ? payload.message
    : `用户原话：${payload.message}\n结合最近上下文扩写后：${effectiveMessage}`;
  const routeTools = route.type === "chat" ? [] : getToolsForRoute(route.type, codeContext);
  const toolTokens = estimateTokens(routeTools.length ? JSON.stringify(routeTools) : "");
  const availableHistoryTokens = Math.max(256, config.memory.maxInputTokens - systemPrompts.estimatedTokens - estimateTokens(userContent) - toolTokens - 256);
  const historyTokenBudget = Math.min(config.memory.historyTokenBudget, availableHistoryTokens);
  const recentHistory = buildRecentHistoryMessages(personaHistory, maxMsgs, includeToolHistory, historyTokenBudget);

  const messages = [
    ...systemPrompts.messages,
    ...recentHistory,
    {
      role: "user",
      content: userContent
    }
  ];
  const inputBudget = {
    maxInputTokens: config.memory.maxInputTokens,
    estimatedInputTokens: messages.reduce((sum, message) => sum + estimateMessageTokens(message), 0) + toolTokens,
    historyTokens: recentHistory.reduce((sum, message) => sum + estimateMessageTokens(message), 0),
    companionTokens: systemPrompts.companionSelection.estimatedTokens,
    knowledgeTokens: knowledgeBudget.estimatedTokens,
    toolTokens,
    selectedMemoryCount: systemPrompts.companionSelection.items.length
  };

  let reply;
  let responseMode = "fallback_local";
  let fallbackReason = "";
  let toolUseCount = 0;
  let personaChanged = false;
  let modelUsage = null;
  const captureUsage = (usage) => { modelUsage = mergeModelUsage(modelUsage, usage); };
  let meta = {
    responseMode,
    usedKnowledge: knowledge.length > 0,
    knowledgeCount: knowledge.length,
    knowledgeFiles: knowledge.map((item) => item.file),
    fallbackReason,
    model: config.deepseek.model,
    route: route.type,
    ragMode: ragResult.meta.ragMode,
    embeddingProvider: ragResult.meta.embeddingProvider,
    detectedMood: relationshipProfile.emotion.suggestedMood,
    relationship: relationshipProfile,
    codeMode: codeContext?.mode,
    inputBudget
  };

  // Track where history-derived messages end — only tool calls added
  // AFTER this point belong to the current conversation round.
  const historySplitIndex = messages.length;

  if (config.deepseek.apiKey && route.type === "chat") {
    const fastConfig = {
      ...responseConfig,
      deepseek: {
        ...responseConfig.deepseek,
        model: config.deepseek.chatModel || "deepseek-v4-flash"
      }
    };
    try {
      reply = payload.stream
        ? await requestDeepSeekStream(fastConfig, messages, payload.onDelta, true, captureUsage)
        : await requestDeepSeek(fastConfig, messages, captureUsage);
      const moodResult = parseMoodTag(reply);
      const faceResult = parseFaceTag(moodResult.cleanReply);
      reply = faceResult.cleanReply;
      const safeFaceParams = sanitizeFaceParamsForMood(faceResult.faceParams, moodResult.detectedMood);
      responseMode = "deepseek_chat";
      meta = {
        ...meta,
        responseMode,
        model: fastConfig.deepseek.model,
        detectedMood: moodResult.detectedMood || relationshipProfile.emotion.suggestedMood,
        faceParams: safeFaceParams || undefined
      };
    } catch (error) {
      fallbackReason = error.message;
      reply = `${buildFallbackReplyV2(config, payload.message, knowledge, { hasApiKey: true })}\n\n模型调用报错：${error.message}`;
      meta = { ...meta, fallbackReason };
    }
  } else if (config.deepseek.apiKey) {
    try {
      // Function calling loop: up to 5 rounds of tool calls
      let response = await callDeepSeekWithTools(responseConfig, messages, routeTools, captureUsage);
      let round = 0;
      const maxRounds = codeContext?.mode === "agent" ? 12 : 6;

      // ---- Intercept set_mood tool call (structured mood, not text tag) ----
      let interceptedMood = null;
      let interceptedFace = null;
      if (response.tool_calls) {
        // LLM returned tool calls — check for set_mood (with or without content)
        const moodCall = response.tool_calls.find(tc => tc.function?.name === "set_mood");
        if (moodCall) {
          try {
            const args = JSON.parse(moodCall.function.arguments || "{}");
            if (args.mood) interceptedMood = args.mood;
            if (args.face_params && typeof args.face_params === "object") {
              // Filter to only valid params, clamp to allowed ranges
              interceptedFace = {};
              for (const [key, rawVal] of Object.entries(args.face_params)) {
                const range = FACE_PARAM_RANGES[key];
                if (range && typeof rawVal === "number") {
                  interceptedFace[key] = Math.max(range.min, Math.min(range.max, rawVal));
                }
              }
              if (Object.keys(interceptedFace).length === 0) interceptedFace = null;
            }
            console.log("[core] tool-call mood:", interceptedMood, "face:", interceptedFace ? JSON.stringify(interceptedFace) : "none");
          } catch {}
          // Remove set_mood from tool_calls so it doesn't trigger the tool loop
          response.tool_calls = response.tool_calls.filter(tc => tc.function?.name !== "set_mood");
          if (response.tool_calls.length === 0) response.tool_calls = undefined;
        }
      }
      // ---- /Intercept ----

      while (response.tool_calls && response.tool_calls.length > 0 && round < maxRounds) {
        round += 1;

        // Push assistant message with tool calls
        messages.push({
          role: "assistant",
          content: response.content || null,
          tool_calls: response.tool_calls
        });

        // Execute each tool call
        for (const tc of response.tool_calls) {
          let args = {};
          try {
            args = JSON.parse(tc.function.arguments || "{}");
          } catch {
            messages.push({
              role: "tool",
              tool_call_id: tc.id,
              content: JSON.stringify({ ok: false, error: `参数解析失败: ${tc.function.arguments}` })
            });
            continue;
          }

          // Progress indicator for streaming
          if (payload.stream && payload.onDelta) {
            payload.onDelta(`正在执行 ${tc.function.name}...`);
          }

          const result = await executeTool(tc.function.name, args, executorContext);
          if (result?.changed && ["create_persona_card", "update_active_persona_card"].includes(tc.function.name)) personaChanged = true;
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify(result)
          });
          toolUseCount += 1;
        }

        // Next round
        response = await callDeepSeekWithTools(responseConfig, messages, round < maxRounds - 1 ? routeTools : null, captureUsage);
      }

      // Final reply
      if (!response.content && interceptedMood) {
        // LLM only called set_mood without text — use mood as reply hint
        reply = {happy:"嗯嗯~", sad:"呜呜…", surprised:"诶？！", angry:"哼！", blush:"诶嘿~", thinking:"嗯…"}[interceptedMood] || "好的~";
      } else if (payload.stream && toolUseCount === 0) {
        reply = await requestDeepSeekStream(responseConfig, messages, payload.onDelta, true, captureUsage);
      } else {
        reply = response.content || "模型没有返回有效内容。";
        if (payload.stream && payload.onDelta) {
          payload.onDelta(reply);
        }
      }
      responseMode = toolUseCount > 0 ? "deepseek_tool" : "deepseek";
      meta = { ...meta, toolUseCount };

      // Use intercepted tool-call mood (priority) or fall back to text-tag parsing
      let detectedMood = interceptedMood;
      let faceParams = interceptedFace;

      if (!detectedMood) {
        // Fallback: parse text tags from reply
        const moodResult = parseMoodTag(reply);
        const faceResult = parseFaceTag(moodResult.cleanReply);
        reply = faceResult.cleanReply;
        detectedMood = moodResult.detectedMood;
        faceParams = faceResult.faceParams;
      } else {
        // Clean text tags even if mood came from tool call
        const moodResult = parseMoodTag(reply);
        reply = moodResult.cleanReply;
        const faceResult = parseFaceTag(reply);
        reply = faceResult.cleanReply;
      }

      faceParams = sanitizeFaceParamsForMood(faceParams, detectedMood);

      console.log("[core] detectedMood:", detectedMood || "none");
      console.log("[core] faceParams:", faceParams ? JSON.stringify(faceParams) : "none");

      meta = {
        ...meta,
        responseMode,
        toolUseCount,
        personaChanged,
        detectedMood: detectedMood || relationshipProfile.emotion.suggestedMood,
        faceParams: faceParams || undefined,
      };
    } catch (error) {
      fallbackReason = error.message;
      reply = `${buildFallbackReplyV2(config, payload.message, knowledge, { hasApiKey: true })}\n\n模型调用报错：${error.message}`;
      meta = {
        ...meta,
        fallbackReason
      };
    }
  } else {
    fallbackReason = "未配置 DeepSeek API Key";
    reply = buildFallbackReplyV2(config, payload.message, knowledge);
    meta = {
      ...meta,
      fallbackReason
    };
  }

  // Build tool call/result records for history persistence.
  // Only scan messages added during THIS conversation round — messages before
  // historySplitIndex belong to previous rounds already saved in history.
  const historyToolCalls = [];
  const historyToolResults = [];
  if (toolUseCount > 0) {
    for (let i = historySplitIndex; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.role === "assistant" && msg.tool_calls) {
        historyToolCalls.push(...msg.tool_calls);
      }
      if (msg.role === "tool") {
        historyToolResults.push({
          id: msg.tool_call_id,
          result: JSON.parse(msg.content)
        });
      }
    }
  }

  await appendHistory(baseDir, {
    timestamp: new Date().toISOString(),
    user: payload.message,
    assistant: reply,
    personaCardId: activePersonaCard?.id,
    personaVersion: activePersonaCard?.version,
    toolCalls: historyToolCalls.length > 0 ? historyToolCalls : undefined,
    toolResults: historyToolResults.length > 0 ? historyToolResults : undefined
  });

  // Fire-and-forget: compress old memory when threshold exceeded
  maybeCompressAndTrim(baseDir, config).catch((err) => {
    // Silent — compression failure should never block the reply
  });

  return {
    reply,
    knowledge,
    meta: { ...meta, usage: modelUsage, inputBudget }
  };
}

// ---- Re-exports (from executors, maintain IPC compatibility) ----

export { getSystemResourceSnapshot } from "./executors/system-executor.js";
export { searchLocalFiles, getFileManagerSnapshot } from "./executors/file-executor.js";
export { loadAppRegistry as getAppRegistrySnapshot, refreshAppRegistry as rebuildAppRegistry } from "./app-registry.js";
export { ensureRagIndexFresh, getRagSnapshot as getRagStatus, rebuildRagIndex as rebuildKnowledgeIndex, testEmbeddingConnection } from "./rag.js";

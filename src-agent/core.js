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
import { executeTool } from "./tool-executor.js";
import { maybeCompressAndTrim } from "./memory-compressor.js";

// ---- Default config ----

export const defaultConfig = {
  appName: "V-Manager",
  personaName: "Vivi",
  personaPrompt:
    "你是用户的桌面智能搭档，语气自然、直接、可靠。优先给出可执行建议，记住用户偏好，并主动引用本地知识库中的相关设定。",
  deepseek: {
    apiKey: "",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat"
  },
  embedding: {
    apiKey: "",
    baseUrl: "https://api.siliconflow.cn/v1",
    model: "BAAI/bge-m3"
  },
  memory: {
    maxMessages: 40,
    knowledgeTopK: 3
  }
};

function mergeConfig(rawConfig = {}) {
  return {
    ...defaultConfig,
    ...rawConfig,
    deepseek: {
      ...defaultConfig.deepseek,
      ...(rawConfig.deepseek ?? {})
    },
    embedding: {
      ...defaultConfig.embedding,
      ...(rawConfig.embedding ?? {})
    },
    memory: {
      ...defaultConfig.memory,
      ...(rawConfig.memory ?? {})
    }
  };
}

function getPaths(baseDir) {
  return getAgentPaths(baseDir);
}

// ---- Data bootstrap / config IO ----

export async function ensureDataFiles(baseDir) {
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
        "# Vivi 表情参数表",
        "",
        "通过 set_mood 的 face_params 字段可以精细控制以下 Live2D 参数。",
        "所有值必须是数字，超出范围会被自动 clamp。不存在的键会被静默忽略。",
        "",
        "## 眼部",
        "| 参数 | 范围 | 说明 |",
        "|------|------|------|",
        "| ParamEyeLOpen | 0-1 | 左眼开合 0=闭眼 1=睁大 |",
        "| ParamEyeROpen | 0-1 | 右眼开合 |",
        "| ParamEyeLSmile | 0-1 | 左眼笑眯 1=完全眯起 |",
        "| ParamEyeRSmile | 0-1 | 右眼笑眯 |",
        "| ParamEyeBallX | -1到1 | 眼球左右 -1=向左看 1=向右看 |",
        "| ParamEyeBallY | -1到1 | 眼球上下 -1=向下看 1=向上看 |",
        "",
        "## 眉毛",
        "| 参数 | 范围 | 说明 |",
        "|------|------|------|",
        "| ParamBrowLY | -1到1 | 左眉 -1=压低(皱眉) 1=抬高 |",
        "| ParamBrowRY | -1到1 | 右眉 |",
        "",
        "## 嘴部",
        "| 参数 | 范围 | 说明 |",
        "|------|------|------|",
        "| ParamMouthOpenY | 0-1 | 张嘴程度 0=闭合 1=张大 |",
        "| ParamMouthForm | -1到1 | 嘴角 -1=下弯(难过) 1=上翘(微笑) |",
        "",
        "## 头部与身体",
        "| 参数 | 范围 | 说明 |",
        "|------|------|------|",
        "| ParamAngleX | -30到30 | 头左右转 负=左转 正=右转 |",
        "| ParamAngleY | -30到30 | 头俯仰 负=低头 正=抬头 |",
        "| ParamAngleZ | -30到30 | 头歪 负=左歪 正=右歪 |",
        "| ParamBodyAngleX | -10到10 | 身体前后倾 负=后仰 正=前倾 |",
        "| ParamBodyAngleZ | -10到10 | 身体左右摇 |",
        "| ParamBreath | 0-1 | 呼吸幅度 |",
        "",
        "## 常用表情预设",
        "",
        "### 张嘴惊讶",
        "face_params: {\"ParamMouthOpenY\": 0.6, \"ParamEyeLOpen\": 1, \"ParamEyeROpen\": 1}",
        "",
        "### 眯眼微笑",
        "face_params: {\"ParamEyeLSmile\": 0.8, \"ParamEyeRSmile\": 0.8, \"ParamMouthForm\": 0.4}",
        "",
        "### 皱眉生气",
        "face_params: {\"ParamBrowLY\": -0.5, \"ParamBrowRY\": -0.5, \"ParamMouthForm\": -0.3}",
        "",
        "### 歪头疑惑",
        "face_params: {\"ParamAngleZ\": -12, \"ParamBrowLY\": 0.4}",
        "",
        "### 害羞低头",
        "face_params: {\"ParamAngleY\": -15, \"ParamBodyAngleX\": -5, \"ParamEyeLSmile\": 0.4}",
        "",
        "---",
        "用户可以持续往此文件追加新的表情预设。RAG 检索命中后 LLM 直接套用参数。"
      ].join("\n"),
      "utf-8"
    );
  }

  await ensureAppRegistry(baseDir);
  await ensureRagFiles(baseDir);
}

export async function loadConfig(baseDir) {
  const { configPath } = getPaths(baseDir);
  const raw = await fs.readFile(configPath, "utf-8");
  return mergeConfig(JSON.parse(raw));
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
  await fs.appendFile(memoryPath, `${JSON.stringify(record)}\n`, "utf-8");
}

export async function clearConversationHistory(baseDir) {
  const { memoryPath } = getPaths(baseDir);
  await fs.mkdir(path.dirname(memoryPath), { recursive: true });
  await fs.writeFile(memoryPath, "", "utf-8");
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

async function requestDeepSeek(config, messages) {
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
      temperature: 0.7
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DeepSeek 请求失败：${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? "模型没有返回有效内容。";
}

async function callDeepSeekWithTools(config, messages, tools) {
  const endpoint = `${config.deepseek.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const body = {
    model: config.deepseek.model,
    messages,
    temperature: 0.7
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
  return data.choices?.[0]?.message ?? { content: "模型没有返回有效内容。" };
}

async function requestDeepSeekStream(config, messages, onDelta) {
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

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
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

        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") {
          continue;
        }

        const data = JSON.parse(payload);
        const delta = data.choices?.[0]?.delta?.content ?? "";
        if (!delta) {
          continue;
        }

        reply += delta;
        onDelta?.(reply);
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
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") {
        continue;
      }
      const data = JSON.parse(payload);
      const delta = data.choices?.[0]?.delta?.content ?? "";
      if (!delta) {
        continue;
      }
      reply += delta;
      onDelta?.(reply);
    }
  }

  return reply || "模型没有返回有效内容。";
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

function buildSystemPrompt(config, knowledge) {
  const now = new Date();
  const currentTimeText = now.toLocaleString("zh-CN", {
    hour12: false
  });
  const knowledgeBlock = knowledge.length
    ? knowledge
      .map((item, index) => `【知识片段 ${index + 1} | ${item.file}】\n${item.content}`)
      .join("\n\n")
    : "暂无命中知识片段。";

  return [
    `你的人设名为 ${config.personaName}。`,
    config.personaPrompt,
    "",
    `当前本地时间为：${currentTimeText}。`,
    "你需要基于本地知识库和近期上下文回答，避免凭空编造权限和操作结果。",
    "如果用户询问当前时间、日期、星期，优先使用上面的当前本地时间直接回答，不要自行编造。",
    "如果遇到浏览器接管、QQ/微信自动发消息等尚未接通的能力，请明确说明当前是规划能力。",
    "",
    knowledgeBlock
  ].join("\n");
}

function buildSystemPromptV2(config, knowledge) {
  const now = new Date();
  const currentTimeText = now.toLocaleString("zh-CN", {
    hour12: false
  });
  const knowledgeBlock = knowledge.length
    ? knowledge
      .map((item, index) => `【知识片段 ${index + 1} | ${item.file}】\n${item.content}`)
      .join("\n\n")
    : "暂无命中知识片段。";

  return [
    `你的人设名为 ${config.personaName}。`,
    config.personaPrompt,
    "",
    `当前本地时间为：${currentTimeText}。`,
    "你需要基于本地知识库和近期上下文回答，避免凭空编造权限和操作结果。",
    "如果用户询问当前时间、日期、星期，优先使用上面的当前本地时间直接回答，不要自行编造。",
    "当用户明确要求启动应用、打开文件或文件夹、列出目录、读取文本文件、创建文件夹或文本文件、追加文本、删除路径时，优先走本地执行层；如果当前能力做不到，要直接说明限制。",
    "",
    knowledgeBlock
  ].join("\n");
}

function buildSystemPromptV3(config, knowledge) {
  const now = new Date();
  const currentTimeText = now.toLocaleString("zh-CN", { hour12: false });
  const knowledgeBlock = knowledge.length
    ? knowledge.map((item, index) => `【知识片段 ${index + 1} | ${item.file}】\n${item.content}`).join("\n\n")
    : "暂无命中知识片段。";

  return [
    `你的人设名为 ${config.personaName}。`,
    config.personaPrompt,
    "",
    `当前本地时间为：${currentTimeText}。`,
    "你是一个桌面 Agent，你可以通过调用工具来获取真实的系统信息、操作文件和启动应用。",
    "重要规则：",
    "1. 当用户问到系统状态（CPU、内存、磁盘空间、运行的应用等），你必须调用对应工具获取真实数据，不要编造任何数字。",
    "2. 当用户要求启动应用、打开文件、关闭应用等操作，你必须调用对应工具执行，然后报告实际结果（成功或失败）。",
    "3. kill_process（终止进程）和 delete_file_or_folder（删除文件/文件夹）是破坏性操作，执行前必须先向用户确认：说明你要终止/删除的是什么，等用户明确同意后再调用工具。",
    "4. 如果某个操作你没有对应的工具（例如没有工具能执行某操作），必须诚实告诉用户'我目前没有这个能力'，绝对不能编造执行结果。",
    "5. 工具调用结果会以 JSON 格式返回给你，请基于真实数据用自然语言回复用户。如果工具返回 ok: false，如实告诉用户失败原因。",
    "6. 如果用户只是普通聊天，不需要调用工具，直接回复即可。",
    "7. 你拥有的工具包括：获取系统资源、查询磁盘空间、检查进程是否运行、终止进程（需确认）、启动应用、查找应用、文件操作（列出/读取/打开/创建/删除（需确认）/搜索）、知识库检索（向量相似度搜索）等。",
    "8. 你是 Live2D 桌宠。用 set_mood 工具执行表情，不要在文字里写「*调用 set_mood*」或 JSON。",
    "   参数值必须够大才有效果：吐舌=Param70:1 张嘴=ParamMouthOpenY:1 嘟嘴=Param76:1 脸红=Param54:1",
    "   眼泪=Param56:1 生气=Param90:1 眯眼=ParamEyeLSmile:0.9+ParamEyeRSmile:0.9",
    "   闭眼=ParamEyeLOpen:0+ParamEyeROpen:0 睁大眼=ParamEyeLOpen:1+ParamEyeROpen:1",
    "   歪头=ParamAngleZ:-15 皱眉=ParamBrowLY:-0.6+ParamBrowRY:-0.6 微笑=ParamMouthForm:0.6",
    "   即使用户只发一个词（如「眯眼」），也必须调用 set_mood 工具。不说「我试试」，直接做。",
    "",
    knowledgeBlock,
  ].join("\n");
}

// ---- Mood & Face tag parsing ----

const MOOD_TAG_RE = /\[mood:\s*(happy|sad|surprised|angry|blush|thinking)\]/i;
const FACE_TAG_RE = /\[face:([A-Za-z0-9_]+=[0-9.-]+(?:,[A-Za-z0-9_]+=[0-9.-]+)*)\]/i;

// Whitelist of valid face params and their ranges (mirrors live2dConfig.ts)
const FACE_PARAM_RANGES = {
  "ParamEyeLOpen":   { min: 0, max: 1 },
  "ParamEyeROpen":   { min: 0, max: 1 },
  "ParamEyeLSmile":  { min: 0, max: 1 },
  "ParamEyeRSmile":  { min: 0, max: 1 },
  "ParamEyeBallX":   { min: -1, max: 1 },
  "ParamEyeBallY":   { min: -1, max: 1 },
  "ParamBrowLY":     { min: -1, max: 1 },
  "ParamBrowRY":     { min: -1, max: 1 },
  "ParamMouthOpenY": { min: 0, max: 1 },
  "ParamMouthForm":  { min: -1, max: 1 },
  "ParamAngleX":     { min: -30, max: 30 },
  "ParamAngleY":     { min: -30, max: 30 },
  "ParamAngleZ":     { min: -30, max: 30 },
  "ParamBodyAngleX": { min: -10, max: 10 },
  "ParamBodyAngleZ": { min: -10, max: 10 },
  "ParamBreath":     { min: 0, max: 1 },
  // Custom expression params (action overlays)
  "Param70":         { min: 0, max: 1 },  // 吐舌
  "Param76":         { min: 0, max: 1 },  // 嘟嘴
  "Param83":         { min: 0, max: 1 },  // 鼓嘴
  "Param54":         { min: 0, max: 1 },  // 脸红
  "Param56":         { min: 0, max: 1 },  // 眼泪
  "Param90":         { min: 0, max: 1 },  // 生气标记
  "Param87":         { min: 0, max: 1 },  // 无语
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

// ---- Main agent pipeline ----

export async function buildAgentReply(baseDir, payload) {
  const config = await loadConfig(baseDir);
  const history = await loadHistory(baseDir);
  const normalizedHistory = config.deepseek.apiKey
    ? history.filter((item) => !isStaleLocalModeReply(item.assistant))
    : history;
  const commandResolution = resolveCommandWithContext(payload.message, normalizedHistory);
  const effectiveMessage = commandResolution.expandedMessage || payload.message;

  // --- Local executor dispatch (formerly tryHandleLocalDesktopQuery) ---
  const executorContext = { baseDir, history: normalizedHistory, config };

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

  const localToolReply = clarificationReply ?? await runRoutedLocalExecutor(effectiveMessage, executorContext);

  if (localToolReply) {
    const route = resolveAgentRoute(effectiveMessage);
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
      ...localToolReply.meta
    };

    await appendHistory(baseDir, {
      timestamp: new Date().toISOString(),
      user: payload.message,
      assistant: localToolReply.reply
    });

    return {
      reply: localToolReply.reply,
      knowledge: [],
      meta
    };
  }

  // --- RAG + DeepSeek path ---
  const ragConfig = await loadRagConfig(baseDir);
  const ragResult = await retrieveRagContext(
    baseDir,
    effectiveMessage,
    ragConfig.topK ?? config.memory.knowledgeTopK,
    (query, topK) => retrieveKnowledge(baseDir, query, topK)
  );
  const knowledge = ragResult.items;
  // Build recent messages from history, limited by maxMessages count.
  // Track seen tool_call_ids to deduplicate — corrupted history may contain
  // the same tool_call_id across multiple entries.
  const seenToolCallIds = new Set();
  const maxMsgs = config.memory.maxMessages || 40;
  const recentHistory = [];
  const reversed = [...normalizedHistory].reverse();
  for (const item of reversed) {
    const entries = [];
    entries.push({ role: "user", content: item.user });
    if (item.toolCalls && Array.isArray(item.toolCalls)) {
      // Deduplicate tool_calls: only include calls with a fresh id
      const freshCalls = item.toolCalls.filter((tc) => !seenToolCallIds.has(tc.id));
      if (freshCalls.length > 0) {
        entries.push({
          role: "assistant",
          content: null,
          tool_calls: freshCalls
        });
        if (item.toolResults && Array.isArray(item.toolResults)) {
          for (const tr of item.toolResults) {
            if (seenToolCallIds.has(tr.id)) continue;
            seenToolCallIds.add(tr.id);
            entries.push({
              role: "tool",
              tool_call_id: tr.id,
              content: JSON.stringify(tr.result)
            });
          }
        }
      }
      // Mark all calls as seen (even if filtered out, prevent future dupes)
      for (const tc of item.toolCalls) {
        seenToolCallIds.add(tc.id);
      }
    }
    entries.push({ role: "assistant", content: item.assistant });

    // Prepend entries (we're iterating newest-first)
    if (recentHistory.length + entries.length <= maxMsgs) {
      recentHistory.unshift(...entries);
    } else {
      // Partial: fit what we can from newest rounds
      const remaining = maxMsgs - recentHistory.length;
      if (remaining > 0) {
        recentHistory.unshift(...entries.slice(-remaining));
      }
      break;
    }
  }

  const messages = [
    {
      role: "system",
      content: buildSystemPromptV3(config, knowledge)
    },
    ...recentHistory,
    {
      role: "user",
      content:
        effectiveMessage === payload.message
          ? payload.message
          : `用户原话：${payload.message}\n结合最近上下文扩写后：${effectiveMessage}`
    }
  ];

  let reply;
  let responseMode = "fallback_local";
  let fallbackReason = "";
  let toolUseCount = 0;
  let meta = {
    responseMode,
    usedKnowledge: knowledge.length > 0,
    knowledgeCount: knowledge.length,
    knowledgeFiles: knowledge.map((item) => item.file),
    fallbackReason,
    model: config.deepseek.model,
    route: resolveAgentRoute(effectiveMessage).type,
    ragMode: ragResult.meta.ragMode,
    embeddingProvider: ragResult.meta.embeddingProvider
  };

  // Track where history-derived messages end — only tool calls added
  // AFTER this point belong to the current conversation round.
  const historySplitIndex = messages.length;

  if (config.deepseek.apiKey) {
    try {
      // Function calling loop: up to 5 rounds of tool calls
      let response = await callDeepSeekWithTools(config, messages, ALL_TOOLS);
      let round = 0;
      const maxRounds = 5;

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

          const result = await executeTool(tc.function.name, args, { baseDir });
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify(result)
          });
          toolUseCount += 1;
        }

        // Next round
        response = await callDeepSeekWithTools(config, messages, round < maxRounds - 1 ? ALL_TOOLS : null);
      }

      // Final reply
      if (!response.content && interceptedMood) {
        // LLM only called set_mood without text — use mood as reply hint
        reply = {happy:"嗯嗯~", sad:"呜呜…", surprised:"诶？！", angry:"哼！", blush:"诶嘿~", thinking:"嗯…"}[interceptedMood] || "好的~";
      } else if (payload.stream) {
        reply = await requestDeepSeekStream(config, messages, payload.onDelta);
      } else {
        reply = response.content || "模型没有返回有效内容。";
      }
      responseMode = toolUseCount > 0 ? "deepseek_tool" : "deepseek";

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

      console.log("[core] detectedMood:", detectedMood || "none");
      console.log("[core] faceParams:", faceParams ? JSON.stringify(faceParams) : "none");

      meta = {
        ...meta,
        responseMode,
        toolUseCount,
        detectedMood: detectedMood || undefined,
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
    meta
  };
}

// ---- Re-exports (from executors, maintain IPC compatibility) ----

export { getSystemResourceSnapshot } from "./executors/system-executor.js";
export { searchLocalFiles, getFileManagerSnapshot } from "./executors/file-executor.js";
export { loadAppRegistry as getAppRegistrySnapshot, refreshAppRegistry as rebuildAppRegistry } from "./app-registry.js";
export { getRagSnapshot as getRagStatus, rebuildRagIndex as rebuildKnowledgeIndex, testEmbeddingConnection } from "./rag.js";

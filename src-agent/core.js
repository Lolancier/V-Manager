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
import {
  buildRelationshipPrompt,
  loadRelationshipProfile,
  recordRelationshipInteraction
} from "./relationship-engine.js";

// ---- Default config ----

export const defaultConfig = {
  appName: "V-Manager",
  personaName: "Vivi",
  personaPrompt:
    "你是用户的桌面智能搭档，语气自然、直接、可靠。优先给出可执行建议，记住用户偏好，并主动引用本地知识库中的相关设定。",
  deepseek: {
    apiKey: "",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    chatModel: "deepseek-chat"
  },
  embedding: {
    apiKey: "",
    baseUrl: "https://api.siliconflow.cn/v1",
    model: "BAAI/bge-m3"
  },
  appearance: {
    theme: "light",
    live2dModel: "qianqian",
    mouseFollow: true
  },
  voice: {
    enabled: false,
    provider: "elevenlabs",
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
  memory: {
    maxMessages: 40,
    knowledgeTopK: 3
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
  await ensureRagFiles(baseDir);
  await loadRelationshipProfile(baseDir);
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

export async function generateAsmrScript(baseDir, { mode = "custom", prompt = "" } = {}) {
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
  ]);
  return content.replace(/^\s*\[(?:mood|face):.*\]\s*$/gim, "").trim();
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
    "浏览器网址打开、网页搜索和 VS Code 文件/工作区打开已经接通。微信仅支持在用户当前消息明确给出精确联系人和完整内容时发送单条消息；自动读取回复和连续对话仍未接通。QQ 自动发消息尚未接通。",
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

const CODE_AGENT_MODES = new Set(["auto", "read", "plan", "agent", "review"]);

function normalizeCodeContext(codeContext) {
  if (!codeContext || typeof codeContext !== "object") return null;
  const mode = CODE_AGENT_MODES.has(codeContext.mode) ? codeContext.mode : "auto";
  const activeFile = String(codeContext.activeFile || "").trim();
  return { mode, activeFile };
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

function buildSystemPromptV3(config, knowledge, relationshipProfile, toolsEnabled = true, codeContext = null) {
  const now = new Date();
  const currentTimeText = now.toLocaleString("zh-CN", { hour12: false });
  const knowledgeBlock = knowledge.length
    ? knowledge.map((item, index) => `【知识片段 ${index + 1} | ${item.file}】\n${item.content}`).join("\n\n")
    : "暂无命中知识片段。";
  const behaviorRules = toolsEnabled
    ? [
      "你是一个桌面 Agent，你可以通过调用工具获取真实系统信息、操作文件和启动应用。",
      "重要规则：",
      "1. 系统状态和电脑操作必须调用对应工具，不要编造数据或执行结果。",
      "2. kill_process 和 delete_file_or_folder 属于破坏性操作，执行前必须说明目标并等待用户明确确认。",
      "3. 没有对应工具时，诚实说明目前没有这个能力。根据工具返回的 JSON 如实回复成功或失败。",
      "4. 表情控制必须通过 set_mood 工具完成，绝不在对话文本中写参数名或 JSON。豆豆眼 Param52 仅用于惊讶、吃惊或困惑，并且 mood 必须设为 surprised；普通思考、提问、开心、害羞等情绪禁止使用。",
      codeContext?.mode === "agent"
        ? "5. 处理代码工作区时先读取真实代码。当前为用户主动选择的 Agent 执行模式，可连续完成工作区内的安全编辑与验证；删除、大范围覆盖和越界操作仍需另行确认。"
        : "5. 处理代码工作区时先读取真实代码。写文件、修改文件或运行非只读命令前，必须展示具体内容并等待用户明确回复确认执行。",
      "6. send_wechat_message 会真实对外发送消息。只有用户当前消息同时包含精确联系人、完整消息内容和明确发送要求时才能调用；不得根据历史消息补齐联系人或内容。工具返回 pending 时表示仅启动了微信，必须询问用户并等待下一条明确的继续确认。"
    ]
    : [
      "当前是快速日常对话。直接自然地回应用户，不要声称执行了任何电脑操作。",
      "只输出对话正文，不输出表情标签、参数名或 JSON；表情由本地情绪引擎处理。",
      "回复保持贴近日常交谈的长度，除非用户明确要求详细说明。"
    ];

  return [
    `你的人设名为 ${config.personaName}。`,
    config.personaPrompt,
    "",
    `当前本地时间为：${currentTimeText}。`,
    config.relationship?.enabled ? buildRelationshipPrompt(relationshipProfile) : "",
    buildCodeModePrompt(codeContext),
    "",
    ...behaviorRules,
    "",
    knowledgeBlock,
  ].join("\n");
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
    file_system: ["list_directory", "read_text_file", "open_file_or_folder", "create_folder", "create_text_file", "append_to_file", "delete_file_or_folder", "search_files", "set_mood"],
    rag_control: ["search_knowledge_base", "get_rag_status", "rebuild_rag_index", "set_mood"]
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
  const config = await loadConfig(baseDir);
  const relationshipProfile = config.relationship?.enabled
    ? await recordRelationshipInteraction(baseDir, payload.message)
    : await loadRelationshipProfile(baseDir);
  const history = await loadHistory(baseDir);
  const normalizedHistory = config.deepseek.apiKey
    ? history.filter((item) => !isStaleLocalModeReply(item.assistant))
    : history;
  const commandResolution = resolveCommandWithContext(payload.message, normalizedHistory);
  const effectiveMessage = commandResolution.expandedMessage || payload.message;
  const codeContext = normalizeCodeContext(payload.codeContext);
  const route = codeContext ? { type: "workspace_code" } : resolveAgentRoute(effectiveMessage);

  // --- Local executor dispatch (formerly tryHandleLocalDesktopQuery) ---
  const executorContext = {
    baseDir,
    history: normalizedHistory,
    config,
    workspaceDir: activeWorkspaceDir,
    codeAgentConfirmed: codeContext?.mode === "agent" || hasExplicitCodeAgentConfirmation(payload.message)
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
  const knowledge = ragResult.items;
  // Build recent messages from history, limited by maxMessages count.
  // Track seen tool_call_ids to deduplicate — corrupted history may contain
  // the same tool_call_id across multiple entries.
  const seenToolCallIds = new Set();
  const maxMsgs = config.memory.maxMessages || 40;
  const recentHistory = [];
  const includeToolHistory = route.type !== "chat";
  const reversed = [...normalizedHistory].reverse();
  for (const item of reversed) {
    const entries = [];
    entries.push({ role: "user", content: item.user });
    if (includeToolHistory && item.toolCalls && Array.isArray(item.toolCalls)) {
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
      content: buildSystemPromptV3(config, knowledge, relationshipProfile, route.type !== "chat", codeContext)
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
    route: route.type,
    ragMode: ragResult.meta.ragMode,
    embeddingProvider: ragResult.meta.embeddingProvider,
    detectedMood: relationshipProfile.emotion.suggestedMood,
    relationship: relationshipProfile,
    codeMode: codeContext?.mode
  };

  // Track where history-derived messages end — only tool calls added
  // AFTER this point belong to the current conversation round.
  const historySplitIndex = messages.length;

  if (config.deepseek.apiKey && route.type === "chat") {
    const fastConfig = {
      ...config,
      deepseek: {
        ...config.deepseek,
        model: config.deepseek.chatModel || "deepseek-chat"
      }
    };
    try {
      reply = payload.stream
        ? await requestDeepSeekStream(fastConfig, messages, payload.onDelta)
        : await requestDeepSeek(fastConfig, messages);
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
      const routeTools = getToolsForRoute(route.type, codeContext);
      let response = await callDeepSeekWithTools(config, messages, routeTools);
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
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify(result)
          });
          toolUseCount += 1;
        }

        // Next round
        response = await callDeepSeekWithTools(config, messages, round < maxRounds - 1 ? routeTools : null);
      }

      // Final reply
      if (!response.content && interceptedMood) {
        // LLM only called set_mood without text — use mood as reply hint
        reply = {happy:"嗯嗯~", sad:"呜呜…", surprised:"诶？！", angry:"哼！", blush:"诶嘿~", thinking:"嗯…"}[interceptedMood] || "好的~";
      } else if (payload.stream && toolUseCount === 0) {
        reply = await requestDeepSeekStream(config, messages, payload.onDelta);
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

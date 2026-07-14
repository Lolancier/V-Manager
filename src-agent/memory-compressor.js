import fs from "node:fs/promises";
import path from "node:path";
import { getAgentPaths } from "./runtime-paths.js";

const COMPRESSION_PROMPT = `你是一个对话记忆整理器。请从以下对话片段中提取关键信息，按下面的 Markdown 格式输出。

只输出 Markdown，不要加任何解释或前缀。

## 用户偏好
<!-- 用户喜欢什么、不喜欢什么、常用什么、工作习惯、沟通风格等。没有就写"暂无"。 -->

## 关键事实
<!-- 名字、路径、设置、重要数字、项目名称、工具版本等。没有就写"暂无"。 -->

## 待办和承诺
<!-- 用户或助手承诺要做的事、下次要处理的、提醒等。没有就写"暂无"。 -->

## 决策记录
<!-- 用户做过的选择、为什么选、不走的原因等。没有就写"暂无"。 -->`;

function buildCompressionMessages(oldMessages) {
  // oldMessages is an array of { role, content } objects
  const conversationText = oldMessages
    .map((msg) => `[${msg.role === "user" ? "用户" : "助手"}]: ${msg.content || (msg.tool_calls ? "[调用了工具]" : "")}`)
    .join("\n\n");

  return [
    { role: "system", content: COMPRESSION_PROMPT },
    { role: "user", content: `请整理以下对话片段：\n\n${conversationText}` }
  ];
}

async function callDeepSeekForCompression(config, messages) {
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
      temperature: 0.3,
      max_tokens: 1500
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`压缩请求失败：${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? "";
}

function todayDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

async function appendToProfile(baseDir, summary) {
  const { knowledgeDir } = getAgentPaths(baseDir);
  const profilePath = path.join(knowledgeDir, "profile.md");

  let existing = "";
  try {
    existing = await fs.readFile(profilePath, "utf-8");
  } catch {
    // profile doesn't exist yet — create header
    existing = `# 用户长期档案\n\n> 自动维护，每周合并。最后更新：${todayDateString()}\n\n`;
  }

  // Extract only the content sections from the summary (skip the ## headers already in profile)
  // Append with date marker
  const sections = summary
    .replace(/^## /gm, `### ${todayDateString()} - `);

  // Simple merge: append sections after the header
  const headerEnd = existing.indexOf("\n\n") + 2;
  const header = existing.slice(0, headerEnd);

  // Update the timestamp
  const updatedHeader = header.replace(/最后更新：\d{4}-\d{2}-\d{2}/, `最后更新：${todayDateString()}`);

  // Merge new sections with existing — overwrite same-date entries if present
  let body = existing.slice(headerEnd);
  const dateMarker = `${todayDateString()} - `;
  if (body.includes(dateMarker)) {
    // Remove today's previous entries and replace
    const lines = body.split("\n");
    const filtered = [];
    let skipToday = false;
    for (const line of lines) {
      if (line.includes(dateMarker)) {
        skipToday = true;
        continue;
      }
      if (skipToday && line.startsWith("### ")) {
        skipToday = false;
      }
      if (skipToday) continue;
      filtered.push(line);
    }
    body = filtered.join("\n");
  }

  const newProfile = updatedHeader + body + "\n" + sections + "\n";
  await fs.writeFile(profilePath, newProfile, "utf-8");
}

/**
 * Compress old conversation messages into structured knowledge.
 * Saves daily memory file and updates the long-term profile.
 * @param {string} baseDir - Agent data directory
 * @param {object} config - Agent config (for DeepSeek API)
 * @param {Array} oldMessages - Array of {role, content} to compress
 */
export async function compressMemory(baseDir, config, oldMessages) {
  if (!config.deepseek?.apiKey) {
    return null;
  }

  if (oldMessages.length < 6) {
    return null; // Not enough to compress
  }

  try {
    const messages = buildCompressionMessages(oldMessages);
    const summary = await callDeepSeekForCompression(config, messages);

    if (!summary || summary.length < 50) {
      return null;
    }

    // Save daily memory file
    const { knowledgeDir } = getAgentPaths(baseDir);
    const dateStr = todayDateString();
    const dailyPath = path.join(knowledgeDir, `memory-${dateStr}.md`);

    let dailyContent = "";
    try {
      dailyContent = await fs.readFile(dailyPath, "utf-8");
    } catch {
      dailyContent = `# 对话记忆 - ${dateStr}\n\n`;
    }

    // Append new summary to today's file
    const timestamp = new Date().toLocaleTimeString("zh-CN", { hour12: false });
    const entry = `\n## 压缩于 ${timestamp}\n\n${summary}\n`;
    await fs.appendFile(dailyPath, entry, "utf-8");

    // Update long-term profile
    await appendToProfile(baseDir, summary);

    return {
      dailyFile: dailyPath,
      summaryLength: summary.length
    };
  } catch (error) {
    console.error("[memory-compressor] 压缩失败:", error.message);
    return null;
  }
}

/**
 * Check if compression is needed and trim old messages from history.
 * Returns the trimmed history if compression happened.
 */
export async function maybeCompressAndTrim(baseDir, config) {
  if (!config.deepseek?.apiKey) return null;

  const { memoryPath } = getAgentPaths(baseDir);
  const maxMessages = config.memory?.maxMessages || 40;
  const triggerThreshold = Math.floor(maxMessages * 1.5);

  try {
    // Read current history
    const raw = await fs.readFile(memoryPath, "utf-8");
    const lines = raw.split("\n").filter(Boolean);
    const historyItems = lines.map((line) => JSON.parse(line));

    // Count total messages
    let totalMessages = 0;
    for (const item of historyItems) {
      totalMessages += 1; // user
      if (item.toolCalls && Array.isArray(item.toolCalls)) {
        totalMessages += 1; // assistant tool_calls
        if (item.toolResults && Array.isArray(item.toolResults)) {
          totalMessages += item.toolResults.length; // tool results
        }
      }
      totalMessages += 1; // assistant
    }

    if (totalMessages <= triggerThreshold) {
      return null; // Not enough to compress
    }

    // Find the split point: keep maxMessages worth of newest items, compress the rest
    let keptItems = [];
    let keptMsgCount = 0;

    for (let i = historyItems.length - 1; i >= 0; i--) {
      const item = historyItems[i];
      let itemMsgCount = 1; // user
      if (item.toolCalls && Array.isArray(item.toolCalls)) {
        itemMsgCount += 1; // assistant tool_calls
        if (item.toolResults && Array.isArray(item.toolResults)) {
          itemMsgCount += item.toolResults.length;
        }
      }
      itemMsgCount += 1; // assistant

      if (keptMsgCount + itemMsgCount <= maxMessages) {
        keptItems.unshift(item);
        keptMsgCount += itemMsgCount;
      } else {
        break;
      }
    }

    const oldItems = historyItems.slice(0, historyItems.length - keptItems.length);

    if (oldItems.length < 3) {
      return null; // Not enough old items worth compressing
    }

    // Convert old items to message format for compression
    const oldMessages = [];
    for (const item of oldItems) {
      oldMessages.push({ role: "user", content: item.user });
      if (item.toolCalls && Array.isArray(item.toolCalls)) {
        oldMessages.push({ role: "assistant", content: "[调用了工具]", tool_calls: item.toolCalls });
      }
      oldMessages.push({ role: "assistant", content: item.assistant });
    }

    // Compress (async, but we can await here since this is called after the reply)
    const result = await compressMemory(baseDir, config, oldMessages);

    if (result) {
      // Trim the history file: keep only the recent items
      const newContent = keptItems.map((item) => JSON.stringify(item)).join("\n") + "\n";
      await fs.writeFile(memoryPath, newContent, "utf-8");
    }

    return result;
  } catch (error) {
    console.error("[memory-compressor] 检查失败:", error.message);
    return null;
  }
}

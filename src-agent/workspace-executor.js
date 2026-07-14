import fs from "node:fs/promises";
import path from "node:path";
import { extractQuotedPath, normalizeText, stripWrappingQuotes } from "./shared/utils.js";

export function detectWorkspaceIntent(message) {
  const normalized = normalizeText(message).toLowerCase();
  const workspaceKeywords = ["工作目录", "workspace", "项目目录", "当前目录", "代码目录"];
  const listKeywords = ["看看", "查看", "列出", "浏览"];

  if (workspaceKeywords.some((keyword) => normalized.includes(keyword))) {
    if (listKeywords.some((keyword) => normalized.includes(keyword)) || normalized.includes("有什么")) {
      return {
        type: "workspace_list",
        targetPath: extractQuotedPath(message)
      };
    }

    return {
      type: "workspace_status",
      targetPath: extractQuotedPath(message)
    };
  }

  if (/^(?:进入|切到|切换到)(.+?)(?:项目|目录|工作区)?$/i.test(normalized)) {
    const match = normalized.match(/^(?:进入|切到|切换到)(.+?)(?:项目|目录|工作区)?$/i);
    return {
      type: "workspace_switch",
      targetPath: stripWrappingQuotes(match?.[1] ?? "")
    };
  }

  return null;
}

function toAbsoluteWorkspacePath(targetPath, fallbackCwd) {
  const raw = stripWrappingQuotes(targetPath);
  if (!raw) {
    return fallbackCwd;
  }

  if (/^[A-Za-z]:\\/.test(raw)) {
    return path.normalize(raw);
  }

  return path.resolve(fallbackCwd, raw);
}

export async function executeWorkspaceIntent(intent, options = {}) {
  const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd();
  const targetPath = toAbsoluteWorkspacePath(intent.targetPath, cwd);

  if (intent.type === "workspace_status") {
    return {
      reply: `当前工作目录我先按这个理解：${targetPath}`,
      meta: {
        responseMode: "local_tool",
        localTool: "workspace_status",
        workspacePath: targetPath
      }
    };
  }

  if (intent.type === "workspace_switch") {
    return {
      reply: `收到，我后续可以按 ${targetPath} 作为工作目录继续处理。`,
      meta: {
        responseMode: "local_tool",
        localTool: "workspace_switch",
        workspacePath: targetPath
      }
    };
  }

  if (intent.type !== "workspace_list") {
    return null;
  }

  let entries;
  try {
    entries = await fs.readdir(targetPath, { withFileTypes: true });
  } catch (error) {
    return {
      reply: `我没法读取这个工作目录：${error.message}`,
      meta: {
        responseMode: "local_tool",
        localTool: "workspace_list",
        workspacePath: targetPath,
        fallbackReason: error.message
      }
    };
  }

  const preview = entries.slice(0, 18).map((entry) => `${entry.isDirectory() ? "[目录]" : "[文件]"} ${entry.name}`);
  return {
    reply: `我看了下工作目录 ${targetPath}，当前大约有 ${entries.length} 项。前面这些比较关键：\n${preview.join("\n")}`,
    meta: {
      responseMode: "local_tool",
      localTool: "workspace_list",
      workspacePath: targetPath
    }
  };
}

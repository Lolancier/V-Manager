import { normalizeText } from "./shared/utils.js";
import { detectWorkspaceIntent, executeWorkspaceIntent } from "./workspace-executor.js";
import { handle as appHandle } from "./executors/app-executor.js";
import { handle as fileHandle } from "./executors/file-executor.js";
import { handle as systemHandle } from "./executors/system-executor.js";

function detectAppIntent(message) {
  const normalized = normalizeText(message).toLowerCase();
  if (/(?:启动|打开|运行|拉起).*(?:qq|微信|网易云|浏览器|chrome|edge|vscode|记事本|画图)/.test(normalized)) {
    return { type: "app_control" };
  }
  if (/(?:路径|安装位置|启动入口|appid).*(?:qq|微信|网易云|浏览器|chrome|edge|vscode)/.test(normalized)) {
    return { type: "app_lookup" };
  }
  return null;
}

function detectFileIntent(message) {
  const normalized = normalizeText(message).toLowerCase();
  if (/(?:文件夹|目录|文件|文档|桌面|下载|d盘)/.test(normalized) && /(打开|查看|列出|读取|创建|删除|追加|写入)/.test(normalized)) {
    return { type: "file_system" };
  }
  return null;
}

function detectRagIntent(message) {
  const normalized = normalizeText(message).toLowerCase();
  if (/(?:知识库|rag|检索|索引|embedding|向量)/.test(normalized)) {
    return { type: "rag_control" };
  }
  return null;
}

export function resolveAgentRoute(message) {
  return (
    detectWorkspaceIntent(message)
    || detectAppIntent(message)
    || detectFileIntent(message)
    || detectRagIntent(message)
    || { type: "chat" }
  );
}

/**
 * Try each executor in priority order. First executor that returns a result wins.
 * workspace → app → file → system
 */
export async function runRoutedLocalExecutor(message, context = {}) {
  const executors = [
    { name: "workspace", fn: workspaceHandle },
    { name: "app", fn: appHandle },
    { name: "file", fn: fileHandle },
    { name: "system", fn: systemHandle }
  ];

  for (const { fn } of executors) {
    const result = await fn(message, context);
    if (result) return result;
  }

  return null;
}

// workspace executor needs its own handle wrapper
async function workspaceHandle(message, context) {
  const intent = detectWorkspaceIntent(message);
  if (!intent) return null;
  return executeWorkspaceIntent(intent, { cwd: context.cwd || process.cwd() });
}

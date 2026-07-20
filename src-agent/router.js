import { normalizeText } from "./shared/utils.js";
import { detectWorkspaceIntent, executeWorkspaceIntent } from "./workspace-executor.js";
import { handle as appHandle } from "./executors/app-executor.js";
import { handle as fileHandle } from "./executors/file-executor.js";
import { handle as systemHandle } from "./executors/system-executor.js";
import { handle as uiAutomationHandle } from "./executors/ui-automation-executor.js";
import { handle as wechatHandle } from "./executors/wechat-executor.js";

function detectAppIntent(message) {
  const normalized = normalizeText(message).toLowerCase();
  const mentionsKnownApp = /qq|微信|wechat|weixin|网易云(?:音乐)?|cloudmusic|浏览器|chrome|edge|vscode|vs code|记事本|notepad|画图|mspaint/.test(normalized);
  const mentionsGenericApp = /应用|程序|软件|进程|\.exe\b/.test(normalized);
  const commandLike = /^(?:请)?(?:帮我|替我|给我)?(?:启动|打开|运行|拉起|关闭|关掉|退出|结束|终止)/.test(normalized)
    || /^(?:请)?(?:帮我)?把.{1,30}(?:打开|启动|运行|关闭|关掉|退出|结束|终止)(?:吧|一下)?$/.test(normalized);

  if (commandLike && (mentionsKnownApp || mentionsGenericApp)) {
    return { type: "app_control" };
  }
  if (mentionsKnownApp && /(?:开了吗|打开了吗|在运行吗|有没有运行|是不是开着|是否启动|启动了吗|还在吗)/.test(normalized)) {
    return { type: "app_status" };
  }
  if (/(?:路径|安装位置|启动入口|appid).*(?:qq|微信|网易云|浏览器|chrome|edge|vscode)/.test(normalized)) {
    return { type: "app_lookup" };
  }
  return null;
}

function detectUiAutomationIntent(message) {
  const normalized = normalizeText(message).toLowerCase();
  if (/(?:浏览器|百度|谷歌|bing|google).*(?:搜索|搜一下|查一下|打开|访问)/.test(normalized)) {
    return { type: "ui_automation" };
  }
  if (/(?:vscode|vs code).*(?:打开|载入)/.test(normalized)) {
    return { type: "ui_automation" };
  }
  return null;
}

function detectMessengerIntent(message) {
  const normalized = normalizeText(message).toLowerCase();
  if (/(?:微信|wechat|weixin)/.test(normalized) && /(?:发送|发)(?:一条)?(?:微信)?消息/.test(normalized)) {
    return { type: "messenger" };
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

function detectSystemIntent(message) {
  const normalized = normalizeText(message).toLowerCase();
  if (/cpu|内存|磁盘|运行中的应用|进程列表|系统资源|电脑状态/.test(normalized)) {
    return { type: "system_status" };
  }
  return null;
}

export function resolveAgentRoute(message) {
  return (
    detectWorkspaceIntent(message)
    || detectMessengerIntent(message)
    || detectUiAutomationIntent(message)
    || detectAppIntent(message)
    || detectFileIntent(message)
    || detectRagIntent(message)
    || detectSystemIntent(message)
    || { type: "chat" }
  );
}

/**
 * Try each executor in priority order. First executor that returns a result wins.
 * workspace → app → file → system
 */
export async function runRoutedLocalExecutor(message, context = {}) {
  const executors = [
    { name: "wechat", fn: wechatHandle },
    { name: "ui-automation", fn: uiAutomationHandle },
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

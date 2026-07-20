import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { normalizeText } from "../shared/utils.js";
import { launchAppByTarget } from "./app-executor.js";
import { sendAstrBotMessage } from "../astrbot-client.js";

const execFileAsync = promisify(execFile);
const executorDir = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.resolve(executorDir, "..", "scripts", "wechat-send.ps1");
const MAX_CONTACT_LENGTH = 80;
const MAX_MESSAGE_LENGTH = 2000;
const PENDING_MESSAGE_TTL_MS = 10 * 60 * 1000;
let pendingWeChatMessage = null;

async function isWeChatRunning() {
  const probe = [
    "$process = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -match '^(WeChat|Weixin)$' } | Select-Object -First 1",
    "if ($null -ne $process) { 'true' } else { 'false' }"
  ].join("; ");
  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", probe],
      { windowsHide: true, timeout: 5000, encoding: "utf8" }
    );
    return stdout.trim() === "true";
  } catch {
    return false;
  }
}

function rememberPendingMessage(request) {
  pendingWeChatMessage = { ...request, createdAt: Date.now() };
}

function peekPendingMessage() {
  if (!pendingWeChatMessage) return null;
  if (Date.now() - pendingWeChatMessage.createdAt > PENDING_MESSAGE_TTL_MS) {
    pendingWeChatMessage = null;
    return null;
  }
  return pendingWeChatMessage;
}

export function isWeChatContinuation(message) {
  return /^(?:继续|继续发送|确认发送|可以继续|继续吧|确认继续)$/i.test(normalizeText(message));
}

export function isWeChatCancellation(message) {
  return /^(?:取消|取消发送|别发了|不用发了)$/i.test(normalizeText(message));
}

export function validateWeChatMessageRequest(input = {}) {
  const rawContact = String(input.contact || "");
  const message = String(input.message || "").trim();
  if (/[\r\n\0]/.test(rawContact)) throw new Error("联系人名称不能包含换行或空字符。");
  if (/\0/.test(message)) throw new Error("微信消息不能包含空字符。");
  const contact = normalizeText(rawContact).replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/g, "");
  const sendMode = input.sendMode === "ctrl_enter" ? "ctrl_enter" : "enter";

  if (!contact) throw new Error("微信联系人不能为空。");
  if (!message) throw new Error("微信消息内容不能为空。");
  if (contact.length > MAX_CONTACT_LENGTH) throw new Error(`联系人名称不能超过 ${MAX_CONTACT_LENGTH} 个字符。`);
  if (message.length > MAX_MESSAGE_LENGTH) throw new Error(`单条微信消息不能超过 ${MAX_MESSAGE_LENGTH} 个字符。`);
  return { contact, message, sendMode };
}

export function parseWeChatSendIntent(message) {
  const normalized = String(message || "").trim();
  const patterns = [
    /^(?:请)?(?:帮我|替我)?用微信(?:给|向)\s*[“\"']?(.+?)[”\"']?\s*(?:发送|发)(?:一条)?消息(?:\s*[：:]\s*|\s*说\s*|\s*内容是\s*)([\s\S]+)$/i,
    /^(?:请)?(?:帮我|替我)?微信(?:上)?\s*(?:给|向)?\s*[“\"']?(.+?)[”\"']?\s*(?:发送|发)(?:一条)?消息(?:\s*[：:]\s*|\s*说\s*|\s*内容是\s*)([\s\S]+)$/i,
    /^(?:请)?(?:帮我)?给我微信上\s*[“\"']?(.+?)[”\"']?\s*(?:发送|发)(?:一条)?消息(?:\s*[：:]\s*|\s*说\s*|\s*内容是\s*)([\s\S]+)$/i
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[1] && match?.[2]) {
      try {
        return validateWeChatMessageRequest({ contact: match[1], message: match[2] });
      } catch {
        return null;
      }
    }
  }
  return null;
}

function parseAutomationOutput(stdout, stderr) {
  const lines = String(stdout || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(lines[index]);
    } catch {
      continue;
    }
  }
  throw new Error(String(stderr || "微信自动化脚本没有返回有效结果。").trim());
}

export async function sendWeChatMessage(input) {
  const request = validateWeChatMessageRequest(input);
  await fs.access(scriptPath);
  const escapedScriptPath = scriptPath.replace(/'/g, "''");
  const bootstrap = [
    `$source = [IO.File]::ReadAllText('${escapedScriptPath}', [Text.Encoding]::UTF8)`,
    "& ([ScriptBlock]::Create($source))"
  ].join("; ");
  const encodedBootstrap = Buffer.from(bootstrap, "utf16le").toString("base64");
  const environment = {
    ...process.env,
    VM_WECHAT_CONTACT: request.contact,
    VM_WECHAT_MESSAGE: request.message,
    VM_WECHAT_SEND_MODE: request.sendMode,
    VM_WECHAT_KEYBOARD_FALLBACK: input.allowKeyboardFallback === true ? "true" : "false"
  };

  try {
    const { stdout, stderr } = await execFileAsync(
      "powershell.exe",
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-Sta", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encodedBootstrap],
      { windowsHide: true, timeout: 20000, maxBuffer: 1024 * 1024, encoding: "utf8", env: environment }
    );
    return parseAutomationOutput(stdout, stderr);
  } catch (error) {
    try {
      const result = parseAutomationOutput(error.stdout, error.stderr);
      return result.ok === false ? result : { ok: false, contact: request.contact, error: error.message };
    } catch {
      return { ok: false, contact: request.contact, error: error.message };
    }
  }
}

export async function requestWeChatMessage(input, context = {}) {
  const request = validateWeChatMessageRequest(input);
  if (context.config?.astrbot?.enabled) {
    try {
      return await sendAstrBotMessage(context.config.astrbot, request);
    } catch (error) {
      return { ok: false, contact: request.contact, provider: "astrbot", error: error.message };
    }
  }
  const existingPending = peekPendingMessage();
  if (existingPending) {
    return {
      ok: false,
      pending: true,
      launched: false,
      contact: existingPending.contact,
      message: existingPending.message,
      requiresConfirmation: true
    };
  }
  if (await isWeChatRunning()) {
    return await sendWeChatMessage({ ...input, ...request });
  }

  rememberPendingMessage({ ...request, allowKeyboardFallback: input.allowKeyboardFallback === true });
  try {
    const launch = await launchAppByTarget(context.baseDir, "微信");
    return {
      ok: false,
      pending: true,
      launched: true,
      contact: request.contact,
      message: request.message,
      launchMode: launch.launchMode
    };
  } catch (error) {
    pendingWeChatMessage = null;
    return { ok: false, pending: false, launched: false, contact: request.contact, error: `微信没有运行，并且启动失败：${error.message}` };
  }
}

export async function handle(message, context = {}) {
  const pending = peekPendingMessage();
  if (pending && isWeChatCancellation(message)) {
    pendingWeChatMessage = null;
    return {
      reply: `好的，已取消给“${pending.contact}”的微信消息。`,
      meta: { responseMode: "local_tool", localTool: "wechat_sender_cancelled", fallbackReason: "" }
    };
  }
  if (pending && isWeChatContinuation(message)) {
    const result = await sendWeChatMessage(pending);
    if (!result.ok) {
      return {
        reply: `微信消息还没有发送：${result.error} 待发送内容仍为你保留，微信准备好后可以再次回复“继续”，或回复“取消”。`,
        meta: { responseMode: "local_tool", localTool: "wechat_sender", fallbackReason: result.error }
      };
    }
    pendingWeChatMessage = null;
    return {
      reply: `已继续向微信联系人“${result.contact}”发送消息。`,
      meta: { responseMode: "local_tool", localTool: "wechat_sender", fallbackReason: "" }
    };
  }

  const intent = parseWeChatSendIntent(message);
  if (!intent) return null;
  const result = await requestWeChatMessage(intent, context);
  if (result.pending) {
    return {
      reply: `微信刚才没有运行，我已经先帮你打开了。等登录和窗口就绪后，要继续给“${result.contact}”发送“${result.message}”吗？你可以回复“继续”或“取消”。`,
      meta: { responseMode: "local_tool", localTool: "wechat_sender_pending", fallbackReason: "" }
    };
  }
  if (!result.ok) {
    return {
      reply: `微信消息没有发送：${result.error}`,
      meta: { responseMode: "local_tool", localTool: "wechat_sender", fallbackReason: result.error }
    };
  }
  return {
    reply: result.provider === "astrbot"
      ? `已通过 AstrBot 向微信联系人“${result.contact}”发送消息。`
      : `已在微信中找到联系人“${result.contact}”并执行发送。`,
    meta: { responseMode: "local_tool", localTool: result.provider === "astrbot" ? "astrbot_wechat_sender" : "wechat_sender", fallbackReason: "" }
  };
}

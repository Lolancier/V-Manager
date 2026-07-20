import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { normalizeText } from "../shared/utils.js";

const execFileAsync = promisify(execFile);
const executorDir = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.resolve(executorDir, "..", "scripts", "wechat-send.ps1");
const MAX_CONTACT_LENGTH = 80;
const MAX_MESSAGE_LENGTH = 2000;

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

export async function handle(message) {
  const intent = parseWeChatSendIntent(message);
  if (!intent) return null;
  const result = await sendWeChatMessage(intent);
  if (!result.ok) {
    return {
      reply: `微信消息没有发送：${result.error}`,
      meta: { responseMode: "local_tool", localTool: "wechat_sender", fallbackReason: result.error }
    };
  }
  return {
    reply: `已在微信中找到联系人“${result.contact}”并执行发送。`,
    meta: { responseMode: "local_tool", localTool: "wechat_sender", fallbackReason: "" }
  };
}

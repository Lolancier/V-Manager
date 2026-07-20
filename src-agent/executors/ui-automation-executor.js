import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import electron from "electron";
import { normalizeText, pathExists, stripWrappingQuotes } from "../shared/utils.js";

const { shell } = electron;

const SEARCH_ENGINES = {
  bing: "https://www.bing.com/search?q=",
  google: "https://www.google.com/search?q=",
  baidu: "https://www.baidu.com/s?wd="
};

function normalizeSearchEngine(engine) {
  const normalized = String(engine || "bing").trim().toLowerCase();
  if (["百度", "baidu"].includes(normalized)) return "baidu";
  if (["谷歌", "google"].includes(normalized)) return "google";
  return "bing";
}

export function buildSearchUrl(query, engine = "bing") {
  const normalizedQuery = String(query || "").trim();
  if (!normalizedQuery) throw new Error("搜索关键词不能为空。");
  const selectedEngine = normalizeSearchEngine(engine);
  return `${SEARCH_ENGINES[selectedEngine]}${encodeURIComponent(normalizedQuery)}`;
}

export function normalizeBrowserUrl(input) {
  const raw = stripWrappingQuotes(String(input || "").trim());
  if (!raw) throw new Error("网址不能为空。");
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error(`无法识别网址：${raw}`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error("只允许打开 http 或 https 网页。");
  }
  return parsed.toString();
}

export async function openBrowserUrl(url) {
  const targetUrl = normalizeBrowserUrl(url);
  await shell.openExternal(targetUrl);
  return { ok: true, targetUrl, action: "open_url" };
}

export async function searchWeb(query, engine = "bing") {
  const targetUrl = buildSearchUrl(query, engine);
  await shell.openExternal(targetUrl);
  return {
    ok: true,
    query: String(query).trim(),
    engine: normalizeSearchEngine(engine),
    targetUrl,
    action: "web_search"
  };
}

async function resolveVscodeExecutable() {
  const candidates = [
    path.join(process.env.LOCALAPPDATA || "", "Programs", "Microsoft VS Code", "Code.exe"),
    path.join(process.env.ProgramFiles || "", "Microsoft VS Code", "Code.exe"),
    path.join(process.env["ProgramFiles(x86)"] || "", "Microsoft VS Code", "Code.exe"),
    path.join(os.homedir(), "scoop", "apps", "vscode", "current", "Code.exe")
  ].filter((candidate) => path.isAbsolute(candidate));

  for (const candidate of candidates) {
    if (await pathExists(candidate)) return candidate;
  }
  throw new Error("没有找到 VS Code。请先安装 VS Code，或把 Code.exe 放在常用安装目录中。");
}

function launchDetached(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      detached: true,
      stdio: "ignore",
      windowsHide: true
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve(child.pid ?? null);
    });
  });
}

export async function openInVscode(targetPath, line) {
  const rawPath = stripWrappingQuotes(String(targetPath || "").trim());
  const resolvedPath = rawPath ? path.resolve(rawPath) : process.cwd();
  let stat;
  try {
    stat = await fs.stat(resolvedPath);
  } catch {
    throw new Error(`路径不存在：${resolvedPath}`);
  }

  const executable = await resolveVscodeExecutable();
  const parsedLine = Number.parseInt(line, 10);
  const useGoto = stat.isFile() && Number.isInteger(parsedLine) && parsedLine > 0;
  const target = useGoto ? `${resolvedPath}:${parsedLine}` : resolvedPath;
  const launcherPid = await launchDetached(executable, ["--reuse-window", ...(useGoto ? ["--goto"] : []), target]);
  return { ok: true, targetPath: resolvedPath, line: useGoto ? parsedLine : null, launcherPid, action: "open_in_vscode" };
}

function extractSearchIntent(message) {
  const normalized = normalizeText(message);
  const match = normalized.match(/^(?:(?:请)?(?:帮我)?(?:用|在)?(?:浏览器|百度|谷歌|bing)?)?(?:搜索|搜一下|查一下|查找)\s*(.+)$/i);
  if (!match?.[1]) return null;
  const engine = /百度/i.test(normalized) ? "baidu" : /谷歌|google/i.test(normalized) ? "google" : "bing";
  return { query: match[1].trim(), engine };
}

function extractVscodeIntent(message) {
  const normalized = normalizeText(message);
  const match = normalized.match(/^(?:请)?(?:帮我)?(?:用\s*)?(?:vscode|vs code)(?:\s*帮我)?(?:打开|载入)\s*(.+)$/i);
  if (!match?.[1]) return null;
  const lineMatch = match[1].match(/^(.*?)(?::|[，,]?\s*第)\s*(\d+)\s*行?$/);
  return {
    targetPath: stripWrappingQuotes((lineMatch?.[1] || match[1]).trim()),
    line: lineMatch?.[2] || null
  };
}

function extractUrlIntent(message) {
  const normalized = normalizeText(message);
  const match = normalized.match(/^(?:请)?(?:帮我)?(?:用浏览器)?(?:打开|访问)\s*((?:https?:\/\/)?[^\s]+\.[^\s]+)$/i);
  return match?.[1] || "";
}

export async function handle(message) {
  const vscodeIntent = extractVscodeIntent(message);
  if (vscodeIntent) {
    try {
      const result = await openInVscode(vscodeIntent.targetPath, vscodeIntent.line);
      return {
        reply: `已经用 VS Code 打开 ${result.targetPath}${result.line ? `，并定位到第 ${result.line} 行` : ""}。`,
        meta: { responseMode: "local_tool", localTool: "vscode_automation", fallbackReason: "" }
      };
    } catch (error) {
      return {
        reply: `这次没能用 VS Code 打开目标：${error.message}`,
        meta: { responseMode: "local_tool", localTool: "vscode_automation", fallbackReason: error.message }
      };
    }
  }

  const url = extractUrlIntent(message);
  if (url) {
    try {
      const result = await openBrowserUrl(url);
      return {
        reply: `已经在默认浏览器中打开 ${result.targetUrl}。`,
        meta: { responseMode: "local_tool", localTool: "browser_automation", fallbackReason: "" }
      };
    } catch (error) {
      return {
        reply: `这次没能打开网页：${error.message}`,
        meta: { responseMode: "local_tool", localTool: "browser_automation", fallbackReason: error.message }
      };
    }
  }

  const searchIntent = extractSearchIntent(message);
  if (!searchIntent) return null;
  try {
    await searchWeb(searchIntent.query, searchIntent.engine);
    return {
      reply: `已经在默认浏览器中搜索“${searchIntent.query}”。`,
      meta: { responseMode: "local_tool", localTool: "browser_search", fallbackReason: "" }
    };
  } catch (error) {
    return {
      reply: `这次没能打开浏览器搜索：${error.message}`,
      meta: { responseMode: "local_tool", localTool: "browser_search", fallbackReason: error.message }
    };
  }
}

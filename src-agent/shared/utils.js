import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// ---- Window title filter ----
export const ignoredWindowTitles = new Set([
  "N/A",
  "Default IME",
  "MSCTFIME UI",
  "OleMainThreadWndName",
  "Hidden Window",
  "DWM Notification Window"
]);

// ---- Text / tokenization ----

export function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

export function normalizeText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

export function normalizeRuntimeName(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\.exe$/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

export function stripWrappingQuotes(text) {
  return String(text || "").trim().replace(/^["'""'']+|["'""'']+$/g, "");
}

// ---- Array / collection ----

export function ensureArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value == null) {
    return [];
  }
  return [value];
}

export function dedupeItems(items) {
  return [...new Map(items.map((item) => [item, item])).values()];
}

// ---- Path / filesystem ----

export async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function statPath(targetPath) {
  try {
    return await fs.stat(targetPath);
  } catch {
    return null;
  }
}

export function extractQuotedPath(message) {
  const quotedMatch = message.match(/[""](.+?)[""]/);
  if (quotedMatch?.[1]) {
    return stripWrappingQuotes(quotedMatch[1]);
  }

  const pathMatch = message.match(/[A-Za-z]:\\[^\n\r""]+/);
  if (pathMatch?.[0]) {
    return stripWrappingQuotes(pathMatch[0]);
  }

  return "";
}

export function getLocalRoots() {
  const homeDir = os.homedir();
  return {
    homeDir,
    desktopDir: path.join(homeDir, "Desktop"),
    documentsDir: path.join(homeDir, "Documents"),
    downloadsDir: path.join(homeDir, "Downloads"),
    driveDDir: "D:\\"
  };
}

export function resolveUserPath(input) {
  const raw = stripWrappingQuotes(input);
  if (!raw) {
    return "";
  }

  const roots = getLocalRoots();
  const lowered = raw.toLowerCase();
  const desktopKeywords = ["桌面", "desktop"];
  const documentsKeywords = ["文档", "documents", "我的文档"];
  const downloadsKeywords = ["下载", "downloads"];
  const homeKeywords = ["用户目录", "home", "主目录"];

  if (desktopKeywords.includes(lowered)) {
    return roots.desktopDir;
  }
  if (documentsKeywords.includes(lowered)) {
    return roots.documentsDir;
  }
  if (downloadsKeywords.includes(lowered)) {
    return roots.downloadsDir;
  }
  if (homeKeywords.includes(lowered)) {
    return roots.homeDir;
  }
  if (lowered === "d盘" || lowered === "d:" || lowered === "d:\\") {
    return roots.driveDDir;
  }

  const keywordBases = [
    ["桌面\\", roots.desktopDir],
    ["desktop\\", roots.desktopDir],
    ["文档\\", roots.documentsDir],
    ["documents\\", roots.documentsDir],
    ["下载\\", roots.downloadsDir],
    ["downloads\\", roots.downloadsDir],
    ["用户目录\\", roots.homeDir],
    ["home\\", roots.homeDir],
    ["d盘\\", roots.driveDDir],
    ["d:\\", roots.driveDDir]
  ];

  for (const [prefix, baseDir] of keywordBases) {
    if (lowered.startsWith(prefix)) {
      const rest = raw.slice(prefix.length).replace(/^\\+/, "");
      return path.join(baseDir, rest);
    }
  }

  if (/^[A-Za-z]:\\/.test(raw)) {
    return path.normalize(raw);
  }

  if (raw.startsWith(".\\")) {
    return path.resolve(process.cwd(), raw);
  }

  if (raw.startsWith("~\\")) {
    return path.join(roots.homeDir, raw.slice(2));
  }

  return "";
}

// ---- Async / misc ----

export function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function escapePowerShellLiteral(text) {
  return String(text || "").replace(/'/g, "''");
}

export function isStaleLocalModeReply(text) {
  return (
    text.includes("本地模式") ||
    text.includes("还没有配置 DeepSeek API Key") ||
    text.includes("Key 配置似乎没有保存成功") ||
    text.includes("依然在本地模式运行")
  );
}

// ---- CSV / string parsing ----

export function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current);
  return cells;
}

export function parseMemoryToMB(text) {
  const digits = text.replace(/[^\d]/g, "");
  const memoryKB = Number(digits || 0);
  return Number((memoryKB / 1024).toFixed(1));
}

export function parseCpuTimeToSeconds(text) {
  const parts = String(text || "0:00:00")
    .split(":")
    .map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
    return 0;
  }

  const [hours, minutes, seconds] = parts;
  return hours * 3600 + minutes * 60 + seconds;
}

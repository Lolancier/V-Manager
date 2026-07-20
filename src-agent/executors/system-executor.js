import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  ignoredWindowTitles,
  normalizeRuntimeName,
  wait
} from "../shared/utils.js";

const execFileAsync = promisify(execFile);

// ---- CPU sampling ----

function readCpuSnapshot() {
  return os.cpus().map((cpu) => ({ ...cpu.times }));
}

function calculateCpuUsage(start, end) {
  let idleDelta = 0;
  let totalDelta = 0;

  for (let index = 0; index < start.length; index += 1) {
    const startTimes = start[index];
    const endTimes = end[index];
    const startIdle = startTimes.idle;
    const endIdle = endTimes.idle;
    const startTotal = startTimes.user + startTimes.nice + startTimes.sys + startTimes.irq + startTimes.idle;
    const endTotal = endTimes.user + endTimes.nice + endTimes.sys + endTimes.irq + endTimes.idle;

    idleDelta += endIdle - startIdle;
    totalDelta += endTotal - startTotal;
  }

  if (!totalDelta) {
    return 0;
  }

  return Math.max(0, Math.min(100, Number((((totalDelta - idleDelta) / totalDelta) * 100).toFixed(1))));
}

async function sampleCpuUsage() {
  const start = readCpuSnapshot();
  await wait(350);
  const end = readCpuSnapshot();
  return calculateCpuUsage(start, end);
}

// ---- Process snapshot ----

async function getProcessSnapshot() {
  const script = [
    "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
    "$items = @(Get-Process -ErrorAction SilentlyContinue | ForEach-Object {",
    "  [pscustomobject]@{",
    "    name = ($_.ProcessName + '.exe')",
    "    pid = $_.Id",
    "    memoryMB = [math]::Round($_.WorkingSet64 / 1MB, 1)",
    "    cpuSeconds = if ($null -eq $_.CPU) { 0 } else { [math]::Round($_.CPU, 1) }",
    "    windowTitle = $_.MainWindowTitle",
    "    status = if ($_.Responding) { 'Running' } else { 'Not Responding' }",
    "  }",
    "})",
    "$items | ConvertTo-Json -Compress"
  ].join("\n");
  const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024,
    encoding: "utf8"
  });
  const parsed = JSON.parse(stdout.trim() || "[]");
  const rows = (Array.isArray(parsed) ? parsed : [parsed]).map((item) => ({
    name: String(item.name || ""),
    pid: Number(item.pid) || 0,
    memoryMB: Number(item.memoryMB) || 0,
    cpuSeconds: Number(item.cpuSeconds) || 0,
    windowTitle: String(item.windowTitle || ""),
    status: String(item.status || "Unknown")
  }));

  const visibleAppMap = new Map();
  for (const item of rows) {
    if (!item.windowTitle || ignoredWindowTitles.has(item.windowTitle)) {
      continue;
    }
    if (item.status !== "Running" && item.status !== "Unknown") {
      continue;
    }
    if (!visibleAppMap.has(item.windowTitle)) {
      visibleAppMap.set(item.windowTitle, {
        name: item.name,
        pid: item.pid,
        windowTitle: item.windowTitle
      });
    }
  }
  const visibleApps = [...visibleAppMap.values()];

  const topProcesses = [...rows]
    .sort((a, b) => b.memoryMB - a.memoryMB)
    .slice(0, 8)
    .map((item) => ({
      name: item.name,
      pid: item.pid,
      cpuSeconds: item.cpuSeconds,
      memoryMB: item.memoryMB,
      windowTitle: item.windowTitle === "N/A" ? "" : item.windowTitle
    }));

  return {
    processCount: rows.length,
    visibleAppCount: visibleApps.length,
    processes: rows.map((item) => ({
      name: item.name,
      pid: item.pid,
      windowTitle: item.windowTitle === "N/A" ? "" : item.windowTitle,
      status: item.status
    })),
    visibleApps: visibleApps.slice(0, 12),
    topProcesses
  };
}

export function matchRunningProcesses(processes, terms) {
  const normalizedTerms = [...new Set((Array.isArray(terms) ? terms : [terms])
    .map((term) => normalizeRuntimeName(String(term || "").replace(/\.exe$/i, "")))
    .filter((term) => term.length >= 2))];

  if (!normalizedTerms.length) {
    return [];
  }

  return (processes || [])
    .filter((item) => item.pid && item.pid !== process.pid)
    .map((item) => {
      const normalizedName = normalizeRuntimeName(String(item.name || "").replace(/\.exe$/i, ""));
      const normalizedTitle = isNoiseWindow(item.windowTitle) ? "" : normalizeRuntimeName(item.windowTitle);
      const pidMatch = normalizedTerms.some((term) => /^\d+$/.test(term) && Number(term) === item.pid);
      const exactName = normalizedTerms.some((term) => normalizedName === term);
      const partialName = normalizedTerms.some((term) => normalizedName.includes(term) || term.includes(normalizedName));
      const titleMatch = normalizedTerms.some((term) => normalizedTitle.includes(term));
      return pidMatch || exactName || partialName || titleMatch
        ? { ...item, matchType: pidMatch ? "pid_exact" : exactName ? "process_exact" : partialName ? "process_partial" : "window_title" }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => {
      const priority = { pid_exact: 0, process_exact: 1, process_partial: 2, window_title: 3 };
      return priority[a.matchType] - priority[b.matchType] || a.pid - b.pid;
    });
}

export async function findRunningProcesses(terms) {
  const snapshot = await getProcessSnapshot();
  return {
    processCount: snapshot.processCount,
    matches: matchRunningProcesses(snapshot.processes, terms)
  };
}

export async function closeRunningProcesses(terms) {
  const initial = await findRunningProcesses(terms);
  const realInitialMatches = initial.matches.filter((item) => item.matchType !== "window_title");
  const initialMatches = realInitialMatches.length ? realInitialMatches : initial.matches;
  if (!initialMatches.length) {
    return { ok: false, found: false, matched: [], remaining: [], forcedCount: 0 };
  }

  const pids = initialMatches.map((item) => item.pid);
  const script = `$ids = @(${pids.join(",")}); Get-Process -Id $ids -ErrorAction SilentlyContinue | ForEach-Object { $_.CloseMainWindow() | Out-Null }`;
  await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    windowsHide: true,
    encoding: "utf8"
  }).catch(() => null);

  await wait(700);
  const afterGracefulResult = await findRunningProcesses(terms);
  const afterGraceful = realInitialMatches.length
    ? afterGracefulResult.matches.filter((item) => item.matchType !== "window_title")
    : afterGracefulResult.matches.filter((item) => pids.includes(item.pid));
  let forcedCount = 0;
  for (const item of afterGraceful) {
    try {
      await execFileAsync("taskkill", ["/PID", String(item.pid), "/T", "/F"], {
        windowsHide: true,
        encoding: "utf8"
      });
      forcedCount += 1;
    } catch {
      // The process may have exited between verification and taskkill.
    }
  }

  if (afterGraceful.length) {
    await wait(250);
  }
  const finalResult = await findRunningProcesses(terms);
  const remaining = realInitialMatches.length
    ? finalResult.matches.filter((item) => item.matchType !== "window_title")
    : finalResult.matches.filter((item) => pids.includes(item.pid));
  return {
    ok: remaining.length === 0,
    found: true,
    matched: initialMatches,
    remaining,
    forcedCount
  };
}

// ---- Public resource snapshot ----

export async function getSystemResourceSnapshot() {
  const [cpuUsagePercent, processSnapshot] = await Promise.all([sampleCpuUsage(), getProcessSnapshot()]);
  const totalMemoryGB = Number((os.totalmem() / 1024 / 1024 / 1024).toFixed(1));
  const freeMemoryGB = Number((os.freemem() / 1024 / 1024 / 1024).toFixed(1));
  const usedMemoryGB = Number((totalMemoryGB - freeMemoryGB).toFixed(1));
  const memoryUsagePercent = totalMemoryGB ? Number(((usedMemoryGB / totalMemoryGB) * 100).toFixed(1)) : 0;

  return {
    hostname: os.hostname(),
    cpuModel: os.cpus()[0]?.model ?? "未知 CPU",
    cpuUsagePercent,
    totalMemoryGB,
    usedMemoryGB,
    memoryUsagePercent,
    processCount: processSnapshot.processCount,
    visibleAppCount: processSnapshot.visibleAppCount,
    processes: processSnapshot.processes,
    visibleApps: processSnapshot.visibleApps,
    topProcesses: processSnapshot.topProcesses
  };
}

// ---- Formatting helpers ----

function formatVisibleApps(visibleApps) {
  if (!visibleApps.length) {
    return "当前没有识别到带窗口标题的前台应用。";
  }

  return visibleApps
    .slice(0, 8)
    .map((item, index) => `${index + 1}. ${item.windowTitle}${item.name ? `（${item.name}）` : ""}`)
    .join("\n");
}

function summarizeProcessMatches(matches) {
  return matches
    .slice(0, 4)
    .map((item) => {
      const titlePart = item.windowTitle && !ignoredWindowTitles.has(item.windowTitle)
        ? `，窗口是"${item.windowTitle}"`
        : "";
      return `${item.name}（PID ${item.pid}${titlePart}）`;
    })
    .join("；");
}

function buildNaturalProcessReply(targetLabel, matches, snapshot) {
  const summary = `我刚查了本机进程列表：当前大约有 ${snapshot.processCount} 个进程、${snapshot.visibleAppCount} 个可见窗口。`;

  if (matches.length > 0) {
    const details = summarizeProcessMatches(matches);
    if (matches.length === 1) {
      return `${targetLabel} 现在是在运行的。${summary} 我命中的记录是 ${details}。`;
    }

    return `${targetLabel} 现在是开着的，而且我命中了 ${matches.length} 条相关记录。${summary} 例如：${details}。`;
  }

  const visibleHint = snapshot.visibleApps
    .slice(0, 4)
    .map((item) => item.windowTitle)
    .filter(Boolean)
    .join("、");
  const tail = visibleHint ? ` 当前能看到的窗口里有：${visibleHint}。` : "";
  return `这次我没有在正在运行的进程和可见窗口里匹配到"${targetLabel}"。${summary}${tail}`;
}

function buildNaturalAppCountReply(snapshot) {
  const examples = snapshot.visibleApps
    .slice(0, 6)
    .map((item) => item.windowTitle || item.name)
    .filter(Boolean)
    .join("、");

  return examples
    ? `我刚看了一下，你这台机器现在大约跑着 ${snapshot.processCount} 个进程，可见窗口有 ${snapshot.visibleAppCount} 个。眼下比较明显的有：${examples}。`
    : `我刚看了一下，你这台机器现在大约跑着 ${snapshot.processCount} 个进程，可见窗口有 ${snapshot.visibleAppCount} 个。`;
}

function buildNaturalResourceReply(snapshot) {
  const topProcess = snapshot.topProcesses[0];
  const topHint = topProcess
    ? ` 当前内存占用比较靠前的是 ${topProcess.name}，大约 ${topProcess.memoryMB} MB。`
    : "";

  return `现在 CPU 大约 ${snapshot.cpuUsagePercent}% ，内存用了 ${snapshot.usedMemoryGB} / ${snapshot.totalMemoryGB} GB（${snapshot.memoryUsagePercent}%）。同时我看到 ${snapshot.processCount} 个进程、${snapshot.visibleAppCount} 个可见窗口。${topHint}`;
}

// ---- Intent extraction ----

function extractRequestedProcessName(message) {
  const normalized = message.trim();
  const patterns = [
    /(?:看看|帮我看看|帮我查查|查查|查一下|看下|看一下)?(.+?)(?:有没有打开|开了吗|打开了吗|在运行吗|有没有运行|是不是开着|是否启动|启动了吗|还在吗)/i,
    /(?:有没有打开|开了吗|打开了吗|在运行吗|有没有运行|是不是开着|是否启动|启动了吗)(.+)/i,
    /(.+?)(?:项目|程序|应用)(?:有没有打开|开了吗|在运行吗|是否启动)/i
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) {
      return match[1]
        .replace(/^(一下|一下子|这个|那个|当前|现在|我这边|电脑里|电脑上)/, "")
        .replace(/(这个|那个|项目|程序|应用)$/g, "")
        .trim();
    }
  }

  return "";
}

function findProcessMatches(snapshot, target) {
  const normalizedTarget = normalizeRuntimeName(target);
  if (!normalizedTarget) {
    return [];
  }

  const candidates = snapshot.processes ?? [];
  return candidates.filter((item) => {
    const normalizedName = normalizeRuntimeName(item.name);
    const normalizedTitle = normalizeRuntimeName(item.windowTitle);
    return normalizedName.includes(normalizedTarget)
      || normalizedTarget.includes(normalizedName)
      || normalizedTitle.includes(normalizedTarget);
  });
}

// ---- Executor handle ----

/**
 * Handle system resource / process queries.
 * Returns null if the message does not match any system intent.
 */
export async function handle(message) {
  const lowered = message.toLowerCase();
  const requestedProcessName = extractRequestedProcessName(message);
  const asksForQq = lowered.includes("qq");
  const asksForWeChat = lowered.includes("微信") || lowered.includes("wechat") || lowered.includes("weixin");
  const asksForAppCount =
    lowered.includes("多少应用") ||
    lowered.includes("几个应用") ||
    lowered.includes("开了多少") ||
    lowered.includes("当前应用");
  const asksForResource =
    lowered.includes("cpu") || lowered.includes("内存占用") || (lowered.includes("内存") && lowered.includes("多少"));

  if (!asksForQq && !asksForWeChat && !asksForAppCount && !asksForResource && !requestedProcessName) {
    return null;
  }

  const snapshot = await getSystemResourceSnapshot();

  if (asksForQq) {
    const qqMatches = findProcessMatches(snapshot, "qq");
    return {
      reply: buildNaturalProcessReply("QQ", qqMatches, snapshot),
      meta: {
        responseMode: "local_tool",
        usedKnowledge: false,
        knowledgeCount: 0,
        knowledgeFiles: [],
        fallbackReason: "",
        localTool: "process_snapshot"
      }
    };
  }

  if (asksForWeChat) {
    const weChatMatches = [...findProcessMatches(snapshot, "weixin"), ...findProcessMatches(snapshot, "微信")];
    const uniqueMatches = [...new Map(weChatMatches.map((item) => [`${item.name}-${item.pid}`, item])).values()];
    return {
      reply: buildNaturalProcessReply("微信", uniqueMatches, snapshot),
      meta: {
        responseMode: "local_tool",
        usedKnowledge: false,
        knowledgeCount: 0,
        knowledgeFiles: [],
        fallbackReason: "",
        localTool: "process_snapshot"
      }
    };
  }

  if (requestedProcessName) {
    const matches = findProcessMatches(snapshot, requestedProcessName);
    return {
      reply: buildNaturalProcessReply(requestedProcessName, matches, snapshot),
      meta: {
        responseMode: "local_tool",
        usedKnowledge: false,
        knowledgeCount: 0,
        knowledgeFiles: [],
        fallbackReason: "",
        localTool: "process_snapshot"
      }
    };
  }

  if (asksForAppCount) {
    return {
      reply: buildNaturalAppCountReply(snapshot),
      meta: {
        responseMode: "local_tool",
        usedKnowledge: false,
        knowledgeCount: 0,
        knowledgeFiles: [],
        fallbackReason: "",
        localTool: "process_snapshot"
      }
    };
  }

  return {
    reply: buildNaturalResourceReply(snapshot),
    meta: {
      responseMode: "local_tool",
      usedKnowledge: false,
      knowledgeCount: 0,
      knowledgeFiles: [],
      fallbackReason: "",
      localTool: "system_resource"
    }
  };
}

// ---- Tool-callable functions ----

export async function getDiskSpace(drive) {
  const letter = String(drive || "D").replace(/[:\\]/g, "").toUpperCase();
  const script = `Get-PSDrive -Name ${letter} -PSProvider FileSystem | Select-Object @{N='Total';E={[math]::Round($_.Used/1GB+$_.Free/1GB,1)}},@{N='Used';E={[math]::Round($_.Used/1GB,1)}},@{N='Free';E={[math]::Round($_.Free/1GB,1)}} | ConvertTo-Json -Compress`;

  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
      { windowsHide: true, encoding: "utf8" }
    );
    const parsed = JSON.parse(stdout.trim() || "{}");
    const total = parsed.Total || 0;
    const used = parsed.Used || 0;
    const free = parsed.Free || 0;
    const usagePercent = total > 0 ? Math.round((used / total) * 100) : 0;
    return {
      ok: true,
      drive: `${letter}:`,
      totalGB: total,
      usedGB: used,
      freeGB: free,
      usagePercent
    };
  } catch (error) {
    return { ok: false, drive: `${letter}:`, error: error.message };
  }
}

const noiseWindowTitles = [
  "跳转列表", "notification", "notifications", "popup", "tooltip",
  "dwm notification", "default ime", "msctfime", "hidden window",
  "olemainthread", "taskbar", "start menu", "action center"
];

function isNoiseWindow(title) {
  const lowered = String(title || "").toLowerCase();
  return noiseWindowTitles.some((noise) => lowered.includes(noise));
}

export async function checkProcessRunning(name) {
  const result = await findRunningProcesses([name]);
  const realMatches = result.matches.filter((item) => item.matchType !== "window_title");
  const topMatches = (realMatches.length > 0 ? realMatches : result.matches).slice(0, 5).map((item) => ({
    name: item.name,
    pid: item.pid,
    windowTitle: isNoiseWindow(item.windowTitle) ? "" : item.windowTitle || ""
  }));

  return {
    ok: true,
    target: name,
    running: realMatches.length > 0,
    realMatchCount: realMatches.length,
    totalMatchCount: result.matches.length,
    matches: topMatches,
    totalProcesses: result.processCount
  };
}

export async function killProcess(name) {
  const target = String(name || "").trim();
  if (!target) {
    return { ok: false, error: "请指定要终止的进程名称或 PID。" };
  }

  // Check if target is a PID (all digits)
  const isPid = /^\d+$/.test(target);

  try {
    const args = isPid
      ? ["/PID", target, "/F"]
      : ["/IM", target, "/F"];

    const { stdout } = await execFileAsync("taskkill", args, {
      windowsHide: true,
      encoding: "utf8"
    });

    return {
      ok: true,
      target: name,
      byPid: isPid,
      output: stdout.trim()
    };
  } catch (error) {
    // taskkill returns non-zero if process not found — that's expected
    const msg = error.message || "";
    if (msg.includes("没有找到") || msg.includes("not found") || msg.includes("无法终止")) {
      return { ok: false, target: name, error: `没有找到运行中的进程"${name}"。` };
    }
    return { ok: false, target: name, error: msg };
  }
}

export async function listRunningApps() {
  const snapshot = await getSystemResourceSnapshot();
  const apps = (snapshot.visibleApps || []).slice(0, 12).map((item) => ({
    name: item.name,
    windowTitle: item.windowTitle,
    pid: item.pid
  }));
  return { ok: true, count: apps.length, apps };
}

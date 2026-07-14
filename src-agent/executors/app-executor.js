import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import electron from "electron";
import { loadAppRegistry, findAppRegistryEntry, getBuiltinAppLaunchMap } from "../app-registry.js";
import {
  dedupeItems,
  escapePowerShellLiteral,
  ensureArray,
  extractQuotedPath,
  normalizeRuntimeName,
  normalizeText,
  pathExists,
  resolveUserPath,
  stripWrappingQuotes
} from "../shared/utils.js";

const execFileAsync = promisify(execFile);
const { shell } = electron;

// ---- Preset map ----

function getKnownAppLaunchMap() {
  return getBuiltinAppLaunchMap();
}

function findLaunchPreset(target, registry = null) {
  const normalizedTarget = normalizeRuntimeName(target);
  if (!normalizedTarget) {
    return null;
  }

  const registryApps = Array.isArray(registry?.apps) ? registry.apps : [];
  const registryHit = findAppRegistryEntry({ apps: registryApps }, target);
  if (registryHit) {
    return {
      aliases: registryHit.aliases ?? [],
      label: registryHit.label,
      commands: registryHit.commands ?? [],
      appIds: registryHit.appIds ?? []
    };
  }

  return (
    getKnownAppLaunchMap().find((item) =>
      item.aliases.some((alias) => {
        const normalizedAlias = normalizeRuntimeName(alias);
        return normalizedAlias === normalizedTarget || normalizedAlias.includes(normalizedTarget) || normalizedTarget.includes(normalizedAlias);
      })
    ) ?? null
  );
}

// ---- Shortcut / installed app discovery ----

async function searchInDirectory(basePath, lowered, maxDepth, results) {
  if (results.length >= 30) {
    return;
  }

  let entries;
  try {
    entries = await fs.readdir(basePath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (results.length >= 30) {
      return;
    }

    const fullPath = path.join(basePath, entry.name);
    if (entry.name.toLowerCase().includes(lowered)) {
      results.push({
        name: entry.name,
        location: basePath,
        type: entry.isDirectory() ? "folder" : "file"
      });
    }

    if (entry.isDirectory() && maxDepth > 0) {
      await searchInDirectory(fullPath, lowered, maxDepth - 1, results);
    }
  }
}

async function findShortcutForApp(target) {
  const normalizedTarget = normalizeRuntimeName(target);
  if (!normalizedTarget) {
    return "";
  }

  const roots = [
    path.join(process.env.APPDATA ?? "", "Microsoft", "Windows", "Start Menu", "Programs"),
    "C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs",
    path.join(os.homedir(), "Desktop")
  ].filter(Boolean);

  for (const root of roots) {
    if (!(await pathExists(root))) {
      continue;
    }

    const results = [];
    await searchInDirectory(root, normalizedTarget, 3, results);
    const shortcut = results.find((item) => item.type === "file" && item.name.toLowerCase().endsWith(".lnk"));
    if (shortcut) {
      return path.join(shortcut.location, shortcut.name);
    }
  }

  return "";
}

async function lookupInstalledApps(target) {
  const normalizedTarget = normalizeText(target);
  if (!normalizedTarget) {
    return {
      startApps: [],
      appxPackages: []
    };
  }

  const escapedTarget = escapePowerShellLiteral(normalizedTarget);
  const script = [
    `$target = '${escapedTarget}'`,
    `$startApps = @(Get-StartApps | Where-Object { $_.Name -like "*$target*" -or $_.AppID -like "*$target*" } | Select-Object Name, AppID)`,
    `$appx = @(Get-AppxPackage | Where-Object { $_.Name -like "*$target*" -or $_.PackageFamilyName -like "*$target*" -or $_.InstallLocation -like "*$target*" } | Select-Object Name, PackageFamilyName, InstallLocation)`,
    `[pscustomobject]@{ startApps = $startApps; appxPackages = $appx } | ConvertTo-Json -Depth 5 -Compress`
  ].join("; ");

  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
      {
        windowsHide: true,
        maxBuffer: 2 * 1024 * 1024,
        encoding: "utf8"
      }
    );
    const parsed = JSON.parse(stdout.trim() || "{}");
    return {
      startApps: ensureArray(parsed.startApps),
      appxPackages: ensureArray(parsed.appxPackages)
    };
  } catch {
    return {
      startApps: [],
      appxPackages: []
    };
  }
}

// ---- App launcher ----

async function launchAppByTarget(baseDir, target) {
  const registry = baseDir ? await loadAppRegistry(baseDir) : null;
  const preset = findLaunchPreset(target, registry);
  const directPath = resolveUserPath(target);

  const launchExecutable = (targetPath) =>
    new Promise((resolve, reject) => {
      try {
        const child = spawn(targetPath, [], {
          detached: true,
          stdio: "ignore",
          windowsHide: true
        });
        child.once("error", reject);
        child.once("spawn", () => {
          child.unref();
          resolve({
            launchMode: "executable",
            launcherPid: child.pid ?? null
          });
        });
      } catch (error) {
        reject(error);
      }
    });

  const launchAppUserModelId = (appId) =>
    new Promise((resolve, reject) => {
      try {
        const child = spawn("explorer.exe", [`shell:AppsFolder\\${appId}`], {
          detached: true,
          stdio: "ignore",
          windowsHide: true
        });
        child.once("error", reject);
        child.once("spawn", () => {
          child.unref();
          resolve({
            launchMode: "app_user_model_id",
            launcherPid: child.pid ?? null
          });
        });
      } catch (error) {
        reject(error);
      }
    });

  const isExecutablePath = (targetPath) => /\.(exe|cmd|bat|com)$/i.test(targetPath);
  const isAppUserModelId = (targetPath) => !resolveUserPath(targetPath) && targetPath.includes("!");

  if (directPath) {
    const exists = await pathExists(directPath);
    if (!exists) {
      throw new Error(`没有找到路径：${directPath}`);
    }
    if (isExecutablePath(directPath)) {
      const launchInfo = await launchExecutable(directPath);
      return {
        label: path.basename(directPath) || directPath,
        targetPath: directPath,
        launchMode: launchInfo.launchMode,
        launcherPid: launchInfo.launcherPid
      };
    } else {
      const openResult = await shell.openPath(directPath);
      if (openResult) {
        throw new Error(openResult);
      }
      return {
        label: path.basename(directPath) || directPath,
        targetPath: directPath,
        launchMode: "shell_open",
        launcherPid: null
      };
    }
  }

  if (!preset) {
    const installedAppInfo = await lookupInstalledApps(target);
    const discoveredAppId = installedAppInfo.startApps[0]?.AppID;
    if (discoveredAppId) {
      const launchInfo = await launchAppUserModelId(discoveredAppId);
      return {
        label: installedAppInfo.startApps[0]?.Name || target,
        targetPath: `shell:AppsFolder\\${discoveredAppId}`,
        launchMode: launchInfo.launchMode,
        launcherPid: launchInfo.launcherPid
      };
    }

    const shortcutPath = await findShortcutForApp(target);
    if (shortcutPath) {
      const openResult = await shell.openPath(shortcutPath);
      if (openResult) {
        throw new Error(openResult);
      }
      return {
        label: path.basename(shortcutPath, ".lnk") || target,
        targetPath: shortcutPath,
        launchMode: "shortcut",
        launcherPid: null
      };
    }

    throw new Error(`暂时没有收录"${target}"的启动方式，请直接给我 exe 路径。`);
  }

  let lastAttempt = "";
  for (const appId of dedupeItems(preset.appIds ?? [])) {
    lastAttempt = `shell:AppsFolder\\${appId}`;
    try {
      const launchInfo = await launchAppUserModelId(appId);
      return {
        label: preset.label,
        targetPath: `shell:AppsFolder\\${appId}`,
        launchMode: launchInfo.launchMode,
        launcherPid: launchInfo.launcherPid
      };
    } catch {
      continue;
    }
  }

  for (const command of dedupeItems(preset.commands)) {
    lastAttempt = command;
    if (command.includes("\\") || /^[A-Za-z]:/.test(command)) {
      if (!(await pathExists(command))) {
        continue;
      }
    }

    try {
      if (isAppUserModelId(command)) {
        const launchInfo = await launchAppUserModelId(command);
        return {
          label: preset.label,
          targetPath: command,
          launchMode: launchInfo.launchMode,
          launcherPid: launchInfo.launcherPid
        };
      } else if (isExecutablePath(command)) {
        const launchInfo = await launchExecutable(command);
        return {
          label: preset.label,
          targetPath: command,
          launchMode: launchInfo.launchMode,
          launcherPid: launchInfo.launcherPid
        };
      } else {
        const openResult = await shell.openPath(command);
        if (openResult) {
          throw new Error(openResult);
        }
        return {
          label: preset.label,
          targetPath: command,
          launchMode: "shell_open",
          launcherPid: null
        };
      }
    } catch {
      continue;
    }
  }

  const installedAppInfo = await lookupInstalledApps(target);
  const discoveredAppId = installedAppInfo.startApps[0]?.AppID;
  if (discoveredAppId) {
    const launchInfo = await launchAppUserModelId(discoveredAppId);
    return {
      label: installedAppInfo.startApps[0]?.Name || preset.label,
      targetPath: `shell:AppsFolder\\${discoveredAppId}`,
      launchMode: launchInfo.launchMode,
      launcherPid: launchInfo.launcherPid
    };
  }

  const shortcutPath = await findShortcutForApp(target);
  if (shortcutPath) {
    const openResult = await shell.openPath(shortcutPath);
    if (!openResult) {
      return {
        label: path.basename(shortcutPath, ".lnk") || preset.label,
        targetPath: shortcutPath,
        launchMode: "shortcut",
        launcherPid: null
      };
    }
  }

  throw new Error(`尝试启动 ${preset.label} 失败。最后一次尝试是：${lastAttempt || "无可用路径"}`);
}

// ---- Intent extraction ----

function extractLaunchTarget(message) {
  const normalized = normalizeText(message);
  const patterns = [
    /^(?:请)?(?:帮我)?(?:启动|打开|运行|拉起)\s*(.+?)(?:应用|程序|软件)?(?:吧|一下|一下子)?$/i,
    /^(?:请)?(?:帮我)?(?:把)\s*(.+?)\s*(?:打开|启动|运行)(?:吧|一下|一下子)?$/i
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) {
      const candidate = stripWrappingQuotes(match[1])
        .replace(/^(一下|一下子|这个|那个)/, "")
        .replace(/(应用|程序|软件)$/g, "")
        .trim();
      if (!candidate) {
        continue;
      }

      if (
        candidate.length > 24 ||
        /怎么|为什么|回复|回答|语境|记忆|规则|刚才|但是|不过|对话|聊天|和你说话|太慢|很慢|太快|挺快/i.test(candidate)
      ) {
        return "";
      }

      return candidate;
    }
  }

  return "";
}

function extractAppLocatorTarget(message) {
  const normalized = normalizeText(message);
  const patterns = [
    /(?:查|看看|看下|告诉我|找下|找一下|帮我查下|帮我看看)?(.+?)(?:的)?(?:路径|安装位置|文件位置|启动入口|启动路径|appid|app id)(?:是啥|是什么|在哪|在哪里)?$/i,
    /(?:路径|安装位置|文件位置|启动入口|启动路径|appid|app id)(?:是啥|是什么|在哪|在哪里)?.*?(.+)$/i
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) {
      return stripWrappingQuotes(match[1])
        .replace(/^(一下|一下子|这个|那个)/, "")
        .replace(/(应用|程序|软件)$/g, "")
        .trim();
    }
  }

  return "";
}

function looksLikeLaunchCommand(message) {
  const normalized = normalizeText(message);
  return /^(?:请)?(?:帮我)?(?:启动|打开|运行|拉起)(?:一下|一下子|吧)?$/i.test(normalized)
    || /^(?:请)?(?:帮我)?(?:把)(?:它|这个|那个|这个应用|那个应用|这个程序|那个程序)?(?:打开|启动|运行)(?:一下|一下子|吧)?$/i.test(normalized);
}

function isAmbiguousReference(target) {
  const normalized = normalizeText(target).toLowerCase();
  return [
    "它", "他", "她", "这个", "那个",
    "这个应用", "那个应用", "这个程序", "那个程序",
    "这个软件", "那个软件", "我的程序", "我那个程序",
    "刚才那个", "前面那个", "上一个", "上个",
    "这个app", "那个app",
    "这个进程", "那个进程", "这个文件", "那个文件",
    "这个目录", "那个目录", "这个文件夹", "那个文件夹",
    "这个pid", "那个pid"
  ].includes(normalized);
}

// ---- Context-aware disambiguation ----

function extractRecentEntities(history, limit = 6) {
  const entities = { apps: [], pids: [], paths: [], processNames: [] };
  const recentItems = history.slice(-limit).reverse();

  for (const item of recentItems) {
    // Extract from both user and assistant messages
    for (const text of [item.user, item.assistant]) {
      if (!text) continue;

      // PIDs: match "PID 34252" or "pid 12345"
      for (const match of text.matchAll(/[Pp][Ii][Dd]\s*(\d{3,})/g)) {
        if (!entities.pids.includes(match[1])) {
          entities.pids.push(match[1]);
        }
      }

      // File paths: match "C:\..." or "D:\..."
      for (const match of text.matchAll(/([A-Za-z]:\\[^\s,，。]+)/g)) {
        const p = match[1];
        if (!entities.paths.includes(p)) entities.paths.push(p);
      }

      // Process names: match "xxx.exe"
      for (const match of text.matchAll(/\b(\w+\.exe)\b/gi)) {
        const pn = match[1].toLowerCase();
        if (!entities.processNames.includes(pn)) entities.processNames.push(pn);
      }

      // App names from known presets
      const normalizedText = normalizeRuntimeName(text);
      if (normalizedText) {
        for (const preset of getKnownAppLaunchMap()) {
          const hit = preset.aliases.some((alias) => {
            const normalizedAlias = normalizeRuntimeName(alias);
            return normalizedAlias && normalizedText.includes(normalizedAlias);
          });
          if (hit && !entities.apps.includes(preset.label)) {
            entities.apps.push(preset.label);
          }
        }
      }
    }
  }

  return entities;
}

function buildClarificationQuestion(actionLabel, entities) {
  const { apps, pids, processNames, paths } = entities;
  const allHints = [...apps, ...pids.map((p) => `PID ${p}`), ...processNames, ...paths.slice(0, 2)];
  const hints = allHints.slice(0, 5);

  if (hints.length === 1) {
    return `你说的"它"我现在倾向于理解成"${hints[0]}"。如果你就是指它，可以直接确认；如果不是，请告诉我具体是什么。`;
  }

  if (hints.length > 1) {
    return `我还不确定你说的是哪个。你最近提到过：${hints.join("、")}。你可以直接说清楚是哪一个。`;
  }

  return `我还不确定你指的是什么。你可以直接说完整名称，比如"${actionLabel}QQ"，或者把路径/PID发我。`;
}

export function resolveCommandWithContext(message, history) {
  const entities = extractRecentEntities(history);
  const launchTarget = extractLaunchTarget(message);
  const appLocatorTarget = extractAppLocatorTarget(message);

  // Extract kill/close target
  const killTarget = (() => {
    const normalized = normalizeText(message);
    const match = normalized.match(/(?:关闭|关掉|终止|杀掉|结束)\s*(.+?)(?:应用|程序|进程|软件)?(?:吧|一下|一下子)?$/i);
    if (match?.[1] && !/怎么|为什么|回复|回答/i.test(match[1])) {
      return match[1].replace(/^(一下|一下子|这个|那个)/, "").trim();
    }
    return "";
  })();

  const ambiguousTarget = launchTarget || appLocatorTarget || killTarget;

  if (ambiguousTarget && isAmbiguousReference(ambiguousTarget)) {
    // Try to resolve from context entities
    if (entities.apps.length === 1 && !entities.pids.length) {
      const action = killTarget ? `关闭${entities.apps[0]}` : launchTarget ? `启动${entities.apps[0]}` : `${entities.apps[0]}路径在哪`;
      return {
        expandedMessage: action,
        expansionReason: `结合最近对话，把"${ambiguousTarget}"扩写成了"${entities.apps[0]}"`
      };
    }

    if (entities.pids.length === 1 && killTarget) {
      return {
        expandedMessage: `关闭进程${entities.pids[0]}`,
        expansionReason: `结合最近对话中提到的 PID，把"${ambiguousTarget}"扩写成了"PID ${entities.pids[0]}"`
      };
    }

    const actionLabel = killTarget ? "关闭" : launchTarget ? "启动" : "查询";
    return {
      expandedMessage: message,
      clarificationQuestion: buildClarificationQuestion(actionLabel, entities)
    };
  }

  if (!launchTarget && looksLikeLaunchCommand(message)) {
    return {
      expandedMessage: message,
      clarificationQuestion: buildClarificationQuestion("启动", entities)
    };
  }

  return {
    expandedMessage: message,
    clarificationQuestion: ""
  };
}

// ---- Reply builders ----

function buildAppLocatorReply(target, appInfo, preset) {
  const startApps = ensureArray(appInfo.startApps);
  const appxPackages = ensureArray(appInfo.appxPackages);
  const lines = [`我查了"${target}"的本地启动入口。`];

  if (startApps.length) {
    const startApp = startApps[0];
    lines.push(`开始菜单入口：${startApp.Name}（AppID: ${startApp.AppID}）`);
  }

  if (appxPackages.length) {
    const appxPackage = appxPackages[0];
    lines.push(`安装位置：${appxPackage.InstallLocation || "系统未返回 InstallLocation"}`);
    lines.push(`包族名：${appxPackage.PackageFamilyName}`);
  }

  const presetHints = [...(preset?.appIds ?? []), ...(preset?.commands ?? [])].slice(0, 4);
  if (presetHints.length) {
    lines.push(`当前执行层会优先尝试：${presetHints.join("；")}`);
  }

  if (lines.length === 1) {
    return `这次我没有查到"${target}"的开始菜单入口或安装位置。`;
  }

  return lines.join("\n");
}

// ---- Tool-callable exports ----

export { launchAppByTarget };

export async function locateApplication(name, baseDir) {
  const registry = baseDir ? await loadAppRegistry(baseDir) : null;
  const preset = findLaunchPreset(name, registry);
  const appInfo = await lookupInstalledApps(name);
  const reply = buildAppLocatorReply(name, appInfo, preset);
  return { ok: true, target: name, reply, preset: preset ? { label: preset.label } : null };
}

// ---- Executor handle ----

/**
 * Handle app launch / app locator / app registry intents.
 * Returns null if the message does not match any app-management intent.
 */
export async function handle(message, context = {}) {
  const { baseDir, history = [] } = context;
  const lowered = message.toLowerCase();

  // RAG / app-registry admin commands
  const wantsRefreshAppRegistry =
    lowered.includes("刷新应用库") ||
    lowered.includes("重建应用库") ||
    lowered.includes("更新应用库") ||
    lowered.includes("refresh app registry");
  const wantsRebuildRagIndex =
    lowered.includes("重建索引") ||
    lowered.includes("重建知识库") ||
    lowered.includes("刷新索引") ||
    lowered.includes("rebuild rag") ||
    lowered.includes("rebuild index");
  const wantsGetRagStatus =
    lowered.includes("索引状态") ||
    lowered.includes("知识库状态") ||
    lowered.includes("rag状态") ||
    lowered.includes("rag status");

  if (wantsRefreshAppRegistry && baseDir) {
    const { refreshAppRegistry } = await import("../app-registry.js");
    const registry = await refreshAppRegistry(baseDir);
    return {
      reply: `应用库已经刷新好了。目前登记了 ${registry.apps.length} 个应用入口。`,
      meta: {
        responseMode: "local_tool",
        usedKnowledge: false,
        knowledgeCount: 0,
        knowledgeFiles: [],
        fallbackReason: "",
        localTool: "app_registry_refresh"
      }
    };
  }

  if (wantsRebuildRagIndex && baseDir) {
    const { rebuildRagIndex } = await import("../rag.js");
    const ragIndex = await rebuildRagIndex(baseDir);
    return {
      reply: `知识索引已经重建完成。这次一共写入了 ${ragIndex.files.length} 个文件、${ragIndex.chunks.length} 个片段。`,
      meta: {
        responseMode: "local_tool",
        usedKnowledge: false,
        knowledgeCount: 0,
        knowledgeFiles: [],
        fallbackReason: "",
        localTool: "rag_rebuild"
      }
    };
  }

  if (wantsGetRagStatus && baseDir) {
    const { getRagSnapshot } = await import("../rag.js");
    const ragSnapshot = await getRagSnapshot(baseDir);
    return {
      reply: `当前知识索引里有 ${ragSnapshot.status.indexedFileCount} 个文件、${ragSnapshot.status.indexedChunkCount} 个片段，最近一次更新时间是 ${ragSnapshot.status.updatedAt || "还没构建过"}。`,
      meta: {
        responseMode: "local_tool",
        usedKnowledge: false,
        knowledgeCount: 0,
        knowledgeFiles: [],
        fallbackReason: "",
        localTool: "rag_status"
      }
    };
  }

  // App locator
  const appLocatorTarget = extractAppLocatorTarget(message);
  if (appLocatorTarget && baseDir) {
    const registry = await loadAppRegistry(baseDir);
    const preset = findLaunchPreset(appLocatorTarget, registry);
    const appInfo = await lookupInstalledApps(appLocatorTarget);
    return {
      reply: buildAppLocatorReply(appLocatorTarget, appInfo, preset),
      meta: {
        responseMode: "local_tool",
        usedKnowledge: false,
        knowledgeCount: 0,
        knowledgeFiles: [],
        fallbackReason: "",
        localTool: "app_locator"
      }
    };
  }

  // App launch
  const launchTarget = extractLaunchTarget(message);
  if (launchTarget && baseDir) {
    try {
      const launchResult = await launchAppByTarget(baseDir, launchTarget);
      const evidence = launchResult.launcherPid
        ? ` 启动句柄 PID 是 ${launchResult.launcherPid}。`
        : "";
      return {
        reply: `已经帮你启动 ${launchResult.label} 了。我这次调用的是 ${launchResult.targetPath}。${evidence}`,
        meta: {
          responseMode: "local_tool",
          usedKnowledge: false,
          knowledgeCount: 0,
          knowledgeFiles: [],
          fallbackReason: "",
          localTool: "app_launcher"
        }
      };
    } catch (error) {
      return {
        reply: `我试着启动"${launchTarget}"了，但这次没成功：${error.message}`,
        meta: {
          responseMode: "local_tool",
          usedKnowledge: false,
          knowledgeCount: 0,
          knowledgeFiles: [],
          fallbackReason: error.message,
          localTool: "app_launcher"
        }
      };
    }
  }

  return null;
}

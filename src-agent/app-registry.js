import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getAgentPaths } from "./runtime-paths.js";
import { ensureArray, normalizeRuntimeName, pathExists } from "./shared/utils.js";

const execFileAsync = promisify(execFile);

async function walkForFiles(rootDir, maxDepth, visitor, currentDepth = 0) {
  if (!rootDir || currentDepth > maxDepth || !(await pathExists(rootDir))) {
    return;
  }

  let entries;
  try {
    entries = await fs.readdir(rootDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      await walkForFiles(fullPath, maxDepth, visitor, currentDepth + 1);
      continue;
    }
    await visitor(fullPath, entry.name);
  }
}

function mergeUniqueStrings(...groups) {
  return [...new Set(groups.flat().filter(Boolean))];
}

function createRegistryItem(partial) {
  const label = partial.label || partial.name || "";
  const aliases = mergeUniqueStrings(partial.aliases ?? [], label);
  return {
    id: normalizeRuntimeName(partial.id || label || partial.name || partial.appIds?.[0] || ""),
    label,
    aliases,
    appIds: mergeUniqueStrings(partial.appIds ?? []),
    commands: mergeUniqueStrings(partial.commands ?? []),
    installLocations: mergeUniqueStrings(partial.installLocations ?? []),
    shortcutPaths: mergeUniqueStrings(partial.shortcutPaths ?? []),
    source: partial.source || "unknown",
    lastValidatedAt: partial.lastValidatedAt ?? null
  };
}

function mergeRegistryItems(baseItem, nextItem) {
  const merged = createRegistryItem({
    ...baseItem,
    ...nextItem,
    label: baseItem.label || nextItem.label,
    aliases: mergeUniqueStrings(baseItem.aliases ?? [], nextItem.aliases ?? []),
    appIds: mergeUniqueStrings(baseItem.appIds ?? [], nextItem.appIds ?? []),
    commands: mergeUniqueStrings(baseItem.commands ?? [], nextItem.commands ?? []),
    installLocations: mergeUniqueStrings(baseItem.installLocations ?? [], nextItem.installLocations ?? []),
    shortcutPaths: mergeUniqueStrings(baseItem.shortcutPaths ?? [], nextItem.shortcutPaths ?? [])
  });
  merged.lastValidatedAt = nextItem.lastValidatedAt ?? baseItem.lastValidatedAt ?? null;
  return merged;
}

export function getBuiltinAppLaunchMap() {
  return [
    {
      aliases: ["qq"],
      label: "QQ",
      commands: [
        "C:\\Program Files (x86)\\Tencent\\QQ\\Bin\\QQScLauncher.exe",
        "C:\\Program Files (x86)\\Tencent\\QQNT\\QQ.exe",
        "C:\\Program Files\\Tencent\\QQNT\\QQ.exe"
      ]
    },
    {
      aliases: ["微信", "wechat", "weixin"],
      label: "微信",
      commands: [
        "C:\\Program Files (x86)\\Tencent\\WeChat\\WeChat.exe",
        "C:\\Program Files\\Tencent\\WeChat\\WeChat.exe"
      ]
    },
    {
      aliases: ["edge", "microsoft edge", "浏览器"],
      label: "Microsoft Edge",
      commands: [
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
        "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
      ]
    },
    {
      aliases: ["chrome", "谷歌", "谷歌浏览器"],
      label: "Google Chrome",
      commands: [
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
      ]
    },
    {
      aliases: ["vscode", "vs code", "code"],
      label: "VS Code",
      commands: [
        "C:\\Users\\Public\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe",
        path.join(os.homedir(), "AppData", "Local", "Programs", "Microsoft VS Code", "Code.exe")
      ]
    },
    {
      aliases: ["记事本", "notepad"],
      label: "记事本",
      commands: ["notepad.exe"]
    },
    {
      aliases: ["画图", "mspaint", "paint"],
      label: "画图",
      commands: ["mspaint.exe"]
    },
    {
      aliases: ["网易云", "网易云音乐", "cloudmusic"],
      label: "网易云音乐",
      appIds: ["1F8B0F94.122165AE053F_j2p0p5q0044a6!CLOUDMUSIC"],
      commands: [
        "C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\网易云音乐.lnk",
        path.join(os.homedir(), "AppData", "Local", "NetEase", "CloudMusic", "cloudmusic.exe"),
        path.join(
          os.homedir(),
          "AppData",
          "Local",
          "Packages",
          "1F8B0F94.122165AE053F_j2p0p5q0044a6",
          "LocalCache",
          "Local",
          "NetEase",
          "CloudMusic",
          "cloudmusic.exe"
        ),
        "C:\\Program Files (x86)\\NetEase\\CloudMusic\\cloudmusic.exe",
        "C:\\Program Files\\NetEase\\CloudMusic\\cloudmusic.exe"
      ]
    }
  ];
}

function buildBuiltinRegistryItems() {
  return getBuiltinAppLaunchMap().map((item) =>
    createRegistryItem({
      id: normalizeRuntimeName(item.label) || item.label,
      label: item.label,
      aliases: item.aliases,
      appIds: item.appIds ?? [],
      commands: item.commands ?? [],
      source: "builtin",
      lastValidatedAt: null
    })
  );
}

export function createEmptyAppRegistry() {
  return {
    version: 2,
    updatedAt: null,
    apps: buildBuiltinRegistryItems()
  };
}

export async function ensureAppRegistry(baseDir) {
  const { registryDir, appRegistryPath } = getAgentPaths(baseDir);
  await fs.mkdir(registryDir, { recursive: true });

  let isNew = false;
  try {
    await fs.access(appRegistryPath);
  } catch {
    isNew = true;
    const initialRegistry = createEmptyAppRegistry();
    initialRegistry.updatedAt = new Date().toISOString();
    await fs.writeFile(appRegistryPath, JSON.stringify(initialRegistry, null, 2), "utf-8");
  }

  // Auto-scan on first launch so the registry isn't stuck with just 8 builtins
  if (isNew) {
    try {
      await refreshAppRegistry(baseDir);
    } catch {
      // Silent — scan failure shouldn't block startup
    }
  }

  return appRegistryPath;
}

export async function loadAppRegistry(baseDir) {
  await ensureAppRegistry(baseDir);
  const { appRegistryPath } = getAgentPaths(baseDir);
  const raw = await fs.readFile(appRegistryPath, "utf-8");
  const parsed = JSON.parse(raw);
  const registryMap = new Map(buildBuiltinRegistryItems().map((item) => [item.id, item]));

  for (const stored of ensureArray(parsed.apps)) {
    const candidate = createRegistryItem(stored);
    const existing = registryMap.get(candidate.id);
    registryMap.set(candidate.id, existing ? mergeRegistryItems(existing, candidate) : candidate);
  }

  return {
    version: parsed.version ?? 2,
    updatedAt: parsed.updatedAt ?? null,
    apps: [...registryMap.values()].sort((a, b) => a.label.localeCompare(b.label, "zh-CN"))
  };
}

export async function saveAppRegistry(baseDir, registry) {
  const { appRegistryPath } = getAgentPaths(baseDir);
  const payload = {
    version: registry.version ?? 2,
    updatedAt: new Date().toISOString(),
    apps: ensureArray(registry.apps).map((item) => createRegistryItem(item))
  };
  await fs.writeFile(appRegistryPath, JSON.stringify(payload, null, 2), "utf-8");
  return payload;
}

async function queryInstalledAppsFromSystem() {
  const script = [
    "[Console]::OutputEncoding = [Text.Encoding]::UTF8",
    "$startApps = @(Get-StartApps | Select-Object Name, AppID)",
    "$appx = @(Get-AppxPackage | Select-Object Name, PackageFamilyName, InstallLocation)",
    "[pscustomobject]@{ startApps = $startApps; appxPackages = $appx } | ConvertTo-Json -Depth 5 -Compress"
  ].join("; ");

  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
      {
        windowsHide: true,
        maxBuffer: 8 * 1024 * 1024,
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

async function discoverShortcuts() {
  const roots = [
    path.join(process.env.APPDATA ?? "", "Microsoft", "Windows", "Start Menu", "Programs"),
    "C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs",
    path.join(os.homedir(), "Desktop")
  ].filter(Boolean);

  const shortcutMap = new Map();

  for (const root of roots) {
    await walkForFiles(root, 4, async (fullPath, fileName) => {
      const lowered = fileName.toLowerCase();
      if (!lowered.endsWith(".lnk") && !lowered.endsWith(".url")) {
        return;
      }

      const label = fileName.replace(/\.(lnk|url)$/i, "").trim();
      const id = normalizeRuntimeName(label);
      if (!id) {
        return;
      }

      const existing = shortcutMap.get(id) ?? createRegistryItem({
        id,
        label,
        aliases: [label],
        source: "shortcut_scan"
      });

      shortcutMap.set(
        id,
        mergeRegistryItems(existing, {
          id,
          label,
          aliases: [label],
          commands: [fullPath],
          shortcutPaths: [fullPath],
          source: "shortcut_scan"
        })
      );
    });
  }

  return [...shortcutMap.values()];
}

function mapAppxPackages(appxPackages) {
  const familyMap = new Map();
  for (const item of appxPackages) {
    const familyName = String(item.PackageFamilyName || "").trim();
    if (!familyName) {
      continue;
    }
    familyMap.set(familyName, {
      installLocation: String(item.InstallLocation || "").trim(),
      packageName: String(item.Name || "").trim()
    });
  }
  return familyMap;
}

function derivePackageFamilyFromAppId(appId) {
  return String(appId || "").split("!")[0].trim();
}

export async function refreshAppRegistry(baseDir) {
  const existing = await loadAppRegistry(baseDir);
  const discovered = await queryInstalledAppsFromSystem();
  const discoveredShortcuts = await discoverShortcuts();
  const appxFamilyMap = mapAppxPackages(discovered.appxPackages);
  const registryMap = new Map(existing.apps.map((item) => [item.id, createRegistryItem(item)]));

  for (const startApp of discovered.startApps) {
    const label = String(startApp.Name || "").trim();
    const appId = String(startApp.AppID || "").trim();
    if (!label && !appId) {
      continue;
    }

    const familyName = derivePackageFamilyFromAppId(appId);
    const packageInfo = familyName ? appxFamilyMap.get(familyName) : null;
    const id = normalizeRuntimeName(label || appId);
    const candidate = createRegistryItem({
      id,
      label: label || appId,
      aliases: [label],
      appIds: appId ? [appId] : [],
      installLocations: packageInfo?.installLocation ? [packageInfo.installLocation] : [],
      source: "system_scan",
      lastValidatedAt: new Date().toISOString()
    });

    const existingItem = registryMap.get(candidate.id);
    registryMap.set(candidate.id, existingItem ? mergeRegistryItems(existingItem, candidate) : candidate);
  }

  for (const shortcut of discoveredShortcuts) {
    const existingItem = registryMap.get(shortcut.id);
    registryMap.set(shortcut.id, existingItem ? mergeRegistryItems(existingItem, shortcut) : shortcut);
  }

  for (const [id, item] of registryMap) {
    const validatedCommands = [];
    for (const command of item.commands ?? []) {
      if (!command.includes("\\") && !/^[A-Za-z]:/.test(command)) {
        validatedCommands.push(command);
        continue;
      }

      if (await pathExists(command)) {
        validatedCommands.push(command);
      }
    }

    registryMap.set(id, {
      ...item,
      commands: validatedCommands.length ? validatedCommands : item.commands ?? [],
      lastValidatedAt: new Date().toISOString()
    });
  }

  return saveAppRegistry(baseDir, {
    version: 2,
    apps: [...registryMap.values()].sort((a, b) => a.label.localeCompare(b.label, "zh-CN"))
  });
}

export function findAppRegistryEntry(registry, target) {
  const normalizedTarget = normalizeRuntimeName(target);
  if (!normalizedTarget) {
    return null;
  }

  return (
    ensureArray(registry.apps).find((item) => {
      const labels = [item.label, ...(item.aliases ?? [])];
      return labels.some((label) => {
        const normalizedLabel = normalizeRuntimeName(label);
        return normalizedLabel === normalizedTarget
          || normalizedLabel.includes(normalizedTarget)
          || normalizedTarget.includes(normalizedLabel);
      });
    }) ?? null
  );
}

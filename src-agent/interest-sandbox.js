import fs from "node:fs/promises";
import path from "node:path";
import { resolveDeepSeekEndpoint } from "./deepseek-endpoint.js";

export const DEFAULT_INTEREST_CONFIG = Object.freeze({
  enabled: false,
  permissionLevel: "diary_only",
  activities: { diary: true, miniGames: false, drawing: false },
  dailyTaskLimit: 1,
  dailyTokenBudget: 2500,
  maxTaskMinutes: 5,
  maxDiskMB: 100,
  idleMinutes: 30,
  minimumHoursBetweenTasks: 6,
  activeStart: "09:00",
  activeEnd: "22:00",
  diaryHour: 21,
  diaryTime: "21:00",
  autoOpenPreview: false,
  selfPlayGames: true,
  selfPlayMaxSeconds: 20,
  selfPlayMaxActions: 40,
  selfRepairAttempts: 1,
  autonomousLifeEnabled: true,
  virtualScheduleEnabled: true,
  autonomousRoutineLimit: 9,
  entertainmentDailyLimit: 2,
  autonomousActivities: {
    collectDiaryMaterials: true,
    browseInformation: true,
    organizeMemory: true,
    playExistingGame: true,
    improveExistingGame: true,
    reviewDrawing: true,
    planCreation: true,
    rest: true,
    prepareChatTopics: true
  },
  networkAccess: "off",
  autoLocation: true,
  weatherLocation: "",
  newsTopics: { hot: true, gaming: true, science: true, ai: true },
  newsFeeds: []
});

export const CURATED_INTEREST_FEEDS = Object.freeze({
  hot: [
    { name: "Google 新闻焦点", url: "https://news.google.com/rss?hl=zh-CN&gl=CN&ceid=CN:zh-Hans" }
  ],
  gaming: [
    { name: "PC Gamer", url: "https://www.pcgamer.com/rss/" }
  ],
  science: [
    { name: "NASA", url: "https://www.nasa.gov/news-release/feed/" },
    { name: "NASA JPL", url: "https://www.jpl.nasa.gov/feeds/news/" }
  ],
  ai: [
    { name: "OpenAI News", url: "https://openai.com/news/rss.xml" },
    { name: "MIT AI", url: "https://news.mit.edu/rss/topic/artificial-intelligence2" }
  ]
});

export const CREATIVE_ACTIVITY_TYPES = new Set(["diary", "mini_game", "drawing"]);
export const AUTONOMOUS_ACTIVITY_TYPES = new Set([
  "collect_diary_materials", "browse_information", "organize_memory", "play_existing_game",
  "improve_existing_game", "review_drawing", "plan_creation", "rest", "prepare_chat_topics"
]);
const ACTIVITY_TYPES = new Set([...CREATIVE_ACTIVITY_TYPES, ...AUTONOMOUS_ACTIVITY_TYPES]);
export const AUTONOMOUS_ACTIVITY_META = Object.freeze({
  collect_diary_materials: { category: "light", label: "收集日记素材", configKey: "collectDiaryMaterials" },
  browse_information: { category: "light", label: "看看天气和资讯", configKey: "browseInformation" },
  organize_memory: { category: "light", label: "整理记忆和近期话题", configKey: "organizeMemory" },
  play_existing_game: { category: "entertainment", label: "玩一个已有游戏", configKey: "playExistingGame" },
  improve_existing_game: { category: "entertainment", label: "改进以前的游戏", configKey: "improveExistingGame" },
  review_drawing: { category: "light", label: "回顾自己的画作", configKey: "reviewDrawing" },
  plan_creation: { category: "light", label: "规划下一次创作", configKey: "planCreation" },
  rest: { category: "light", label: "休息和发呆", configKey: "rest" },
  prepare_chat_topics: { category: "companion", label: "准备聊天话题", configKey: "prepareChatTopics" }
});
const PERMISSION_LEVELS = new Set(["off", "diary_only", "create", "preview", "autonomous"]);
const NETWORK_LEVELS = new Set(["off", "weather", "weather_news"]);
const GAME_FORBIDDEN_RULES = [
  { label: "联网请求", pattern: /\b(fetch|XMLHttpRequest|WebSocket|EventSource)\b|https?:\/\//i },
  { label: "浏览器存储", pattern: /\b(indexedDB|localStorage|sessionStorage|document\.cookie)\b/i },
  { label: "动态代码执行", pattern: /\beval\s*\(|\bFunction\s*\(/ },
  { label: "窗口或页面跳转", pattern: /\bwindow\.open\b|\b(?:window\.)?location(?:\.href)?\s*=|\blocation\.(?:assign|replace)\s*\(/i },
  { label: "危险 HTML 标签", pattern: /<\s*(iframe|object|embed|form|base|link)\b/i },
  { label: "无限循环", pattern: /while\s*\(\s*true\s*\)|for\s*\(\s*;\s*;\s*\)/i }
];
const SVG_FORBIDDEN = /<\s*(script|foreignObject|iframe|object|embed)\b|\bon\w+\s*=|\b(?:href|xlink:href)\s*=\s*["'](?!#|data:image\/)/i;

function clampInteger(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
}

export function normalizeInterestConfig(raw = {}) {
  const permissionLevel = PERMISSION_LEVELS.has(raw.permissionLevel) ? raw.permissionLevel : DEFAULT_INTEREST_CONFIG.permissionLevel;
  const networkAccess = NETWORK_LEVELS.has(raw.networkAccess) ? raw.networkAccess : DEFAULT_INTEREST_CONFIG.networkAccess;
  return {
    ...DEFAULT_INTEREST_CONFIG,
    ...raw,
    enabled: Boolean(raw.enabled),
    permissionLevel,
    activities: {
      ...DEFAULT_INTEREST_CONFIG.activities,
      ...(raw.activities ?? {}),
      diary: raw.activities?.diary !== false
    },
    dailyTaskLimit: clampInteger(raw.dailyTaskLimit, 1, 1, 48),
    dailyTokenBudget: clampInteger(raw.dailyTokenBudget, 2500, 500, 2_000_000),
    maxTaskMinutes: clampInteger(raw.maxTaskMinutes, 5, 1, 60),
    maxDiskMB: clampInteger(raw.maxDiskMB, 100, 10, 2048),
    idleMinutes: clampInteger(raw.idleMinutes, 30, 5, 240),
    minimumHoursBetweenTasks: clampInteger(raw.minimumHoursBetweenTasks, 6, 0, 24),
    activeStart: /^\d{2}:\d{2}$/.test(raw.activeStart) ? raw.activeStart : DEFAULT_INTEREST_CONFIG.activeStart,
    activeEnd: /^\d{2}:\d{2}$/.test(raw.activeEnd) ? raw.activeEnd : DEFAULT_INTEREST_CONFIG.activeEnd,
    diaryHour: clampInteger(raw.diaryHour, 21, 0, 23),
    diaryTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(raw.diaryTime)
      ? raw.diaryTime
      : `${String(clampInteger(raw.diaryHour, 21, 0, 23)).padStart(2, "0")}:00`,
    autoOpenPreview: Boolean(raw.autoOpenPreview),
    selfPlayGames: raw.selfPlayGames !== false,
    selfPlayMaxSeconds: clampInteger(raw.selfPlayMaxSeconds, 20, 5, 60),
    selfPlayMaxActions: clampInteger(raw.selfPlayMaxActions, 40, 8, 120),
    selfRepairAttempts: clampInteger(raw.selfRepairAttempts, 1, 0, 2),
    autonomousLifeEnabled: raw.autonomousLifeEnabled !== false,
    virtualScheduleEnabled: raw.virtualScheduleEnabled !== false,
    autonomousRoutineLimit: clampInteger(raw.autonomousRoutineLimit, 9, 3, 24),
    entertainmentDailyLimit: clampInteger(raw.entertainmentDailyLimit, 2, 0, 12),
    autonomousActivities: {
      ...DEFAULT_INTEREST_CONFIG.autonomousActivities,
      ...(raw.autonomousActivities ?? {})
    },
    autoLocation: raw.autoLocation !== false,
    networkAccess,
    weatherLocation: String(raw.weatherLocation || "").trim().slice(0, 100),
    newsTopics: {
      ...DEFAULT_INTEREST_CONFIG.newsTopics,
      ...(raw.newsTopics ?? {})
    },
    newsFeeds: Array.isArray(raw.newsFeeds)
      ? raw.newsFeeds.map((item) => String(item).trim()).filter((item) => /^https:\/\//i.test(item)).slice(0, 3)
      : []
  };
}

export function getInterestSandboxPaths(baseDir) {
  const root = path.join(baseDir, "agent-data", "vivi-sandbox");
  return {
    root,
    diaryDir: path.join(root, "diary"),
    gamesDir: path.join(root, "games"),
    drawingsDir: path.join(root, "drawings"),
    personasDir: path.join(root, "personas"),
    activityLogPath: path.join(root, "activity.jsonl"),
    statePath: path.join(root, "state.json"),
    locationPath: path.join(root, "location.json"),
    lifeDir: path.join(root, "life")
  };
}

async function writeJsonAtomic(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(value, null, 2), "utf-8");
  await fs.rename(temporary, filePath);
}

export async function saveInterestLocation(baseDir, location) {
  const latitude = Number(location?.latitude);
  const longitude = Number(location?.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error("Windows 返回的位置信息无效。");
  }
  const paths = await ensureSandbox(baseDir);
  const saved = {
    latitude,
    longitude,
    accuracy: Math.max(0, Number(location?.accuracy) || 0),
    city: String(location?.city || "").trim().slice(0, 120),
    region: String(location?.region || "").trim().slice(0, 120),
    country: String(location?.country || "").trim().slice(0, 120),
    source: "windows_geolocation",
    updatedAt: new Date().toISOString()
  };
  await writeJsonAtomic(paths.locationPath, saved);
  return saved;
}

export async function loadInterestLocation(baseDir) {
  const paths = await ensureSandbox(baseDir);
  return readJson(paths.locationPath, null);
}

export async function initializeInterestSession(baseDir, now = new Date(), config = null) {
  const paths = await ensureSandbox(baseDir);
  const today = dayKey(now);
  const current = await readJson(paths.statePath, {});
  const diaryTime = config
    ? normalizeInterestConfig(config).diaryTime
    : current.diaryScheduleTime || DEFAULT_INTEREST_CONFIG.diaryTime;
  if (current.day === today && current.diaryDueAt && current.version >= 2 && current.diaryScheduleTime === diaryTime) return current;
  const [diaryHour, diaryMinute] = diaryTime.split(":").map(Number);
  const diaryDueAt = new Date(now);
  diaryDueAt.setHours(diaryHour, diaryMinute, 0, 0);
  const next = {
    version: 2,
    day: today,
    launchedAt: current.day === today && current.launchedAt ? current.launchedAt : now.toISOString(),
    diaryScheduleTime: diaryTime,
    diaryDueAt: diaryDueAt.toISOString(),
    lastTaskCompletedAt: current.lastTaskCompletedAt || null,
    pendingActivity: current.pendingActivity || null,
    updatedAt: now.toISOString()
  };
  await writeJsonAtomic(paths.statePath, next);
  return next;
}

export async function updateInterestSession(baseDir, patch, now = new Date()) {
  const paths = await ensureSandbox(baseDir);
  const current = await initializeInterestSession(baseDir, now);
  const next = { ...current, ...patch, updatedAt: now.toISOString() };
  await writeJsonAtomic(paths.statePath, next);
  return next;
}

async function ensureSandbox(baseDir) {
  const paths = getInterestSandboxPaths(baseDir);
  await Promise.all([paths.diaryDir, paths.gamesDir, paths.drawingsDir, paths.lifeDir].map((dir) => fs.mkdir(dir, { recursive: true })));
  await migratePersonaLayout(paths);
  for (const dir of [paths.root, paths.diaryDir, paths.gamesDir, paths.drawingsDir]) {
    if ((await fs.lstat(dir)).isSymbolicLink()) throw new Error("兴趣沙盒目录不能是符号链接。");
  }
  return paths;
}

async function moveDirectoryContents(source, destination) {
  const sourceStat = await fs.lstat(source).catch(() => null);
  if (!sourceStat) return;
  if (sourceStat.isSymbolicLink() || !sourceStat.isDirectory()) throw new Error("旧人物作品目录格式无效，无法自动迁移。");
  await fs.mkdir(destination, { recursive: true });
  for (const entry of await fs.readdir(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isSymbolicLink()) continue;
    const existing = await fs.lstat(to).catch(() => null);
    if (!existing) await fs.rename(from, to);
    else if (entry.isDirectory() && existing.isDirectory()) await moveDirectoryContents(from, to);
    else {
      const extension = path.extname(entry.name);
      const alternate = path.join(destination, `${path.basename(entry.name, extension)}-迁移副本-${Date.now()}${extension}`);
      await fs.rename(from, alternate);
    }
  }
  await fs.rmdir(source).catch(() => {});
}

async function migratePersonaLayout(paths) {
  const legacyRoot = paths.personasDir;
  const stat = await fs.lstat(legacyRoot).catch(() => null);
  if (!stat) return;
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("旧人物作品归档目录格式无效。");
  for (const personaEntry of await fs.readdir(legacyRoot, { withFileTypes: true })) {
    if (!personaEntry.isDirectory() || personaEntry.isSymbolicLink()) continue;
    const personaId = safeSlug(personaEntry.name, "legacy-persona");
    for (const [category, destinationRoot] of [["diary", paths.diaryDir], ["drawings", paths.drawingsDir], ["games", paths.gamesDir]]) {
      await moveDirectoryContents(path.join(legacyRoot, personaEntry.name, category), path.join(destinationRoot, personaId));
    }
    await fs.rmdir(path.join(legacyRoot, personaEntry.name)).catch(() => {});
  }
  const activities = await readActivities(paths, 10_000);
  let logChanged = false;
  for (const activity of activities) {
    if (!activity.artifactPath) continue;
    const relative = path.relative(paths.root, activity.artifactPath);
    const parts = relative.split(path.sep);
    if (parts[0] !== "personas" || parts.length < 4) continue;
    const category = parts[2];
    if (!["diary", "drawings", "games"].includes(category)) continue;
    activity.artifactPath = path.join(paths.root, category, safeSlug(parts[1], "legacy-persona"), ...parts.slice(3));
    logChanged = true;
  }
  if (logChanged) await writeActivities(paths, activities.reverse());
  await fs.rmdir(legacyRoot).catch(() => {});
}

function dayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function safeSlug(value, fallback = "vivi") {
  const slug = String(value || "").normalize("NFKC").replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  return slug || fallback;
}

function assertInside(root, candidate) {
  const relative = path.relative(root, candidate);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("兴趣作品路径未通过沙盒边界检查。");
}

async function readJson(filePath, fallback) {
  try { return JSON.parse(await fs.readFile(filePath, "utf-8")); } catch { return fallback; }
}

async function appendActivity(paths, activity) {
  await fs.appendFile(paths.activityLogPath, `${JSON.stringify(activity)}\n`, "utf-8");
}

async function writeActivities(paths, activities) {
  const content = activities.map((item) => JSON.stringify(item)).join("\n");
  const temporary = `${paths.activityLogPath}.tmp`;
  await fs.writeFile(temporary, content ? `${content}\n` : "", "utf-8");
  await fs.rename(temporary, paths.activityLogPath);
}

async function addRelatedActivity(paths, activityId, relatedId) {
  const activities = await readActivities(paths, 10_000);
  const target = activities.find((item) => item.id === activityId);
  if (!target) return false;
  target.relatedActivityIds = [...new Set([...(target.relatedActivityIds || []), relatedId])];
  await writeActivities(paths, activities.reverse());
  return true;
}

async function readActivities(paths, limit = 100) {
  const raw = await fs.readFile(paths.activityLogPath, "utf-8").catch(() => "");
  return raw.split(/\r?\n/).filter(Boolean).map((line) => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean).slice(-limit).reverse();
}

async function directorySize(root) {
  let total = 0;
  async function visit(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const target = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) await visit(target);
      else if (entry.isFile()) total += (await fs.stat(target)).size;
    }
  }
  await visit(root);
  return total;
}

async function artifactSize(activity) {
  if (!activity?.artifactPath) return 0;
  const target = ["mini_game", "play_existing_game", "improve_existing_game"].includes(activity.type)
    ? path.dirname(activity.artifactPath)
    : activity.artifactPath;
  const stat = await fs.lstat(target).catch(() => null);
  if (!stat || stat.isSymbolicLink()) return 0;
  return stat.isDirectory() ? directorySize(target) : stat.size;
}

function activityCategory(activity) {
  return activity?.category || AUTONOMOUS_ACTIVITY_META[activity?.type]?.category || (CREATIVE_ACTIVITY_TYPES.has(activity?.type) ? "creative" : "light");
}

export async function getInterestSandboxSnapshot(baseDir, now = new Date(), config = null) {
  const paths = await ensureSandbox(baseDir);
  const activities = await readActivities(paths);
  const today = dayKey(now);
  const personaCardId = String(config?.personaCardId || "");
  const todayActivities = activities.filter((item) => item.day === today && (!personaCardId || item.personaCardId === personaCardId));
  const sizes = { diary: 0, drawing: 0, mini_game: 0, life: 0 };
  const seenArtifacts = new Set();
  for (const activity of activities) {
    const target = String(activity.artifactPath || "");
    if (!target || seenArtifacts.has(target)) continue;
    seenArtifacts.add(target);
    const storageType = CREATIVE_ACTIVITY_TYPES.has(activity.type) ? activity.type : "life";
    sizes[storageType] += await artifactSize(activity);
  }
  return {
    root: paths.root,
    activities,
    today: {
      date: today,
      taskCount: todayActivities.length,
      creativeTaskCount: todayActivities.filter((item) => activityCategory(item) === "creative" && item.type !== "diary" && item.status === "completed").length,
      lightActivityCount: todayActivities.filter((item) => activityCategory(item) === "light" && item.status === "completed").length,
      entertainmentCount: todayActivities.filter((item) => activityCategory(item) === "entertainment" && item.status === "completed").length,
      companionActivityCount: todayActivities.filter((item) => activityCategory(item) === "companion" && item.status === "completed").length,
      diaryWritten: todayActivities.some((item) => item.type === "diary" && item.status === "completed"),
      tokenCount: todayActivities.reduce((sum, item) => sum + (Number(item.tokens) || 0), 0),
      tokenBudget: config ? normalizeInterestConfig(config).dailyTokenBudget : null
    },
    diskBytes: await directorySize(paths.root),
    storage: {
      byType: sizes,
      failedCount: activities.filter((item) => item.status === "failed" || item.status === "cancelled").length,
      completedCount: activities.filter((item) => item.status === "completed").length,
      personaCount: new Set(activities.map((item) => item.personaCardId).filter(Boolean)).size
    },
    session: await initializeInterestSession(baseDir, now, config),
    routine: config ? buildInterestRoutine(config, todayActivities, now) : [],
    location: await loadInterestLocation(baseDir)
  };
}

export async function cleanupInterestSandbox(baseDir, mode = "failed_logs") {
  const paths = await ensureSandbox(baseDir);
  const activities = await readActivities(paths, 10_000);
  if (mode === "failed_logs") {
    const retained = activities.filter((item) => item.status === "completed").reverse();
    const removed = activities.length - retained.length;
    await writeActivities(paths, retained);
    return { mode, removedLogs: removed, removedFiles: 0, reclaimedBytes: 0 };
  }
  if (mode === "all_content") {
    const before = await directorySize(paths.root);
    const exactTargets = [paths.diaryDir, paths.gamesDir, paths.drawingsDir, paths.lifeDir, paths.personasDir, paths.activityLogPath];
    for (const target of exactTargets) {
      const relative = path.relative(paths.root, target);
      if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("清理目标未通过沙盒边界检查。");
      await fs.rm(target, { recursive: true, force: true });
    }
    await ensureSandbox(baseDir);
    return { mode, removedLogs: activities.length, removedFiles: -1, reclaimedBytes: Math.max(0, before - await directorySize(paths.root)) };
  }
  if (mode === "game_content") {
    const before = await directorySize(paths.gamesDir);
    const gameTypes = new Set(["mini_game", "play_existing_game", "improve_existing_game"]);
    const retained = activities.filter((item) => !gameTypes.has(item.type)).reverse();
    const relative = path.relative(paths.root, paths.gamesDir);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("游戏清理目标未通过沙盒边界检查。");
    await fs.rm(paths.gamesDir, { recursive: true, force: true });
    await fs.mkdir(paths.gamesDir, { recursive: true });
    await writeActivities(paths, retained);
    return { mode, removedLogs: activities.length - retained.length, removedFiles: -1, reclaimedBytes: before };
  }
  throw new Error("不支持的兴趣空间清理方式。");
}

function minutesOfDay(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value));
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
}

function withinWindow(now, start, end) {
  const current = now.getHours() * 60 + now.getMinutes();
  const from = minutesOfDay(start);
  const until = minutesOfDay(end);
  return from <= until ? current >= from && current <= until : current >= from || current <= until;
}

export function buildInterestRoutine(config, todayActivities = [], now = new Date()) {
  const settings = normalizeInterestConfig(config);
  if (!settings.enabled || !settings.autonomousLifeEnabled || settings.permissionLevel !== "autonomous" || !settings.virtualScheduleEnabled) return [];
  const autonomousTypes = Object.entries(AUTONOMOUS_ACTIVITY_META)
    .filter(([, meta]) => settings.autonomousActivities[meta.configKey] !== false)
    .map(([type]) => type);
  const creativeTypes = [settings.activities.drawing && "drawing", settings.activities.miniGames && "mini_game"].filter(Boolean);
  const types = [...autonomousTypes, ...creativeTypes];
  if (!types.length) return [];
  const start = minutesOfDay(settings.activeStart);
  let end = minutesOfDay(settings.activeEnd);
  if (end <= start) end += 24 * 60;
  const slotCount = settings.autonomousRoutineLimit;
  const completedByRoutine = new Map(todayActivities.filter((item) => item.routineId && item.status === "completed").map((item) => [item.routineId, item]));
  const dueDates = Array.from({ length: slotCount }, (_, index) => {
    const dueMinutes = Math.round(start + ((end - start) * (index + 1)) / (slotCount + 1));
    const dueAt = new Date(now);
    dueAt.setHours(0, dueMinutes, 0, 0);
    if (dueMinutes >= 24 * 60) dueAt.setDate(dueAt.getDate() + 1);
    return dueAt;
  });
  const windowEnd = new Date(now);
  windowEnd.setHours(0, end, 0, 0);
  if (end >= 24 * 60) windowEnd.setDate(windowEnd.getDate() + 1);
  return dueDates.map((dueAt, index) => {
    const id = `${dayKey(now)}-life-${index + 1}`;
    const activity = completedByRoutine.get(id);
    let plannedType = types[(index + now.getDate()) % types.length];
    if (index === slotCount - 1 && settings.autonomousActivities.rest !== false) plannedType = "rest";
    const nextDueAt = dueDates[index + 1];
    const status = activity
      ? "completed"
      : dueAt.getTime() > now.getTime()
        ? "scheduled"
        : (nextDueAt && nextDueAt.getTime() <= now.getTime()) || (!nextDueAt && windowEnd.getTime() < now.getTime())
          ? "missed"
          : "due";
    return {
      id,
      type: activity?.type || plannedType,
      plannedType,
      title: activity?.title || "",
      category: activity?.category || AUTONOMOUS_ACTIVITY_META[plannedType]?.category || "creative",
      dueAt: dueAt.toISOString(),
      status,
      completedAt: activity?.createdAt || null
    };
  });
}

export function selectInterestActivity(config, snapshot, now = new Date(), { manualType, automaticDiaryDue = false, hasCompletedOwnerTask = false } = {}) {
  const settings = normalizeInterestConfig(config);
  if (!settings.enabled || settings.permissionLevel === "off") return { allowed: false, reason: "兴趣沙盒尚未开启。" };
  if (snapshot.diskBytes >= settings.maxDiskMB * 1024 * 1024) return { allowed: false, reason: "兴趣沙盒磁盘配额已经用完。" };

  if (manualType) {
    if (!ACTIVITY_TYPES.has(manualType)) return { allowed: false, reason: "不支持的兴趣活动。" };
    if (settings.permissionLevel === "diary_only" && manualType !== "diary") return { allowed: false, reason: "当前权限仅允许写日记。" };
    if (CREATIVE_ACTIVITY_TYPES.has(manualType)) {
      const key = manualType === "mini_game" ? "miniGames" : manualType;
      if (!settings.activities[key]) return { allowed: false, reason: "这项兴趣活动没有开启。" };
    } else if (!settings.autonomousLifeEnabled || settings.autonomousActivities[AUTONOMOUS_ACTIVITY_META[manualType]?.configKey] === false) {
      return { allowed: false, reason: "这项自主生活活动没有开启。" };
    }
    return { allowed: true, type: manualType };
  }

  const wroteDiary = Boolean(snapshot.today.diaryWritten ?? snapshot.activities.some((item) => item.day === snapshot.today.date && item.type === "diary" && item.status === "completed"));
  const remainingTokens = Math.max(0, settings.dailyTokenBudget - (snapshot.today.tokenCount || 0));
  const minimumTokens = (activityType) => activityType === "rest" ? 0 : CREATIVE_ACTIVITY_TYPES.has(activityType) ? 2500 : activityType === "play_existing_game" ? 900 : 1200;
  if (automaticDiaryDue && settings.activities.diary && !wroteDiary) {
    if (remainingTokens < minimumTokens("diary")) return { allowed: false, reason: "今天剩余的自主生活 Token 不足以写日记。", budgetExhausted: true };
    return { allowed: true, type: "diary" };
  }
  if (!settings.autonomousLifeEnabled) return { allowed: false, reason: "自主生活模块已关闭。" };
  if (snapshot.today.tokenCount >= settings.dailyTokenBudget) return { allowed: false, reason: "今天的自主生活 Token 总预算已经用完。", budgetExhausted: true };
  if (settings.permissionLevel !== "autonomous" && !hasCompletedOwnerTask && !snapshot.session?.pendingActivity) return { allowed: false, reason: "主人尚未完成可进入空闲创作阶段的任务。" };
  if (!withinWindow(now, settings.activeStart, settings.activeEnd)) return { allowed: false, reason: "当前不在允许自主活动的时间段内。" };
  if (settings.permissionLevel === "autonomous" && settings.virtualScheduleEnabled) {
    const routine = snapshot.routine?.length ? snapshot.routine : buildInterestRoutine(settings, snapshot.activities.filter((item) => item.day === snapshot.today.date), now);
    const due = routine.find((item) => item.status === "due");
    if (!due) return { allowed: false, reason: "还没有到下一项虚拟生活日程的时间。" };
    if (due.category === "creative" && (snapshot.today.creativeTaskCount ?? 0) >= settings.dailyTaskLimit) return { allowed: false, reason: "今天的自主创作次数已经达到上限。" };
    if (due.category === "entertainment" && (snapshot.today.entertainmentCount ?? 0) >= settings.entertainmentDailyLimit) return { allowed: false, reason: "今天的娱乐次数已经达到上限。" };
    if (remainingTokens < minimumTokens(due.type)) return { allowed: false, reason: "剩余 Token 不足以安全开始下一项自主活动。", budgetExhausted: true };
    return { allowed: true, type: due.type, routineId: due.id, category: due.category };
  }
  const latest = snapshot.activities.find((item) => item.status === "completed");
  if (latest && now.getTime() - new Date(latest.createdAt).getTime() < settings.minimumHoursBetweenTasks * 3600_000) {
    return { allowed: false, reason: "距离上一次自主活动还太近。" };
  }
  if (settings.permissionLevel === "diary_only") return { allowed: false, reason: "今天的日记将在启动 2–3 小时后写入。" };
  const options = [settings.activities.drawing && "drawing", settings.activities.miniGames && "mini_game"].filter(Boolean);
  return options.length ? { allowed: true, type: options[(snapshot.today.creativeTaskCount || 0) % options.length] } : { allowed: false, reason: "没有已开启的创作活动。" };
}

async function readTail(filePath, maxChars = 5000) {
  const content = await fs.readFile(filePath, "utf-8").catch(() => "");
  return content.slice(-maxChars);
}

function decodeXml(value) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
}

function parseFeedItems(xml, limit = 4) {
  const blocks = [...xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)].slice(0, limit).map((match) => match[2]);
  return blocks.map((block) => {
    const title = decodeXml(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/i.exec(block)?.[1] || "");
    const summary = decodeXml(/<(?:description|summary|content)(?:\s[^>]*)?>([\s\S]*?)<\/(?:description|summary|content)>/i.exec(block)?.[1] || "").slice(0, 600);
    return title ? { title, summary } : null;
  }).filter(Boolean);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const forwardAbort = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) forwardAbort();
  else options.signal?.addEventListener("abort", forwardAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", forwardAbort);
  }
}

export async function collectInterestContext(baseDir, config, now = new Date(), { fetchImpl = fetchWithTimeout, location, signal } = {}) {
  const dataDir = path.join(baseDir, "agent-data");
  const local = await Promise.all([
    readTail(path.join(dataDir, "memory", "conversation.jsonl"), 6000),
    readTail(path.join(dataDir, "companion-memory.json"), 3500),
    readTail(path.join(dataDir, "schedules.json"), 3000),
    readTail(path.join(dataDir, "life-state.json"), 2000)
  ]);
  const context = { date: dayKey(now), local: local.filter(Boolean).join("\n\n"), weather: null, news: [] };
  const settings = normalizeInterestConfig(config);

  const automaticLocation = location ?? await loadInterestLocation(baseDir);
  if ((settings.networkAccess === "weather" || settings.networkAccess === "weather_news") && automaticLocation?.latitude != null) {
    try {
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${automaticLocation.latitude}&longitude=${automaticLocation.longitude}&current=temperature_2m,apparent_temperature,precipitation,rain,weather_code,cloud_cover,wind_speed_10m&timezone=auto`;
      const weather = await (await fetchImpl(weatherUrl, { signal })).json();
      const locationLabel = [automaticLocation.city, automaticLocation.region]
        .map((item) => String(item || "").trim())
        .filter((item, index, items) => item && items.indexOf(item) === index)
        .join("，") || "Windows 定位";
      context.weather = { location: locationLabel, accuracy: automaticLocation.accuracy ?? null, current: weather.current ?? null };
    } catch (error) {
      if (signal?.aborted) throw error;
      context.weather = null;
    }
  } else if ((settings.networkAccess === "weather" || settings.networkAccess === "weather_news") && settings.weatherLocation) {
    try {
      const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(settings.weatherLocation)}&count=1&language=zh&format=json`;
      const geo = await (await fetchImpl(geoUrl, { signal })).json();
      const place = geo.results?.[0];
      if (place) {
        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,apparent_temperature,precipitation,rain,weather_code,cloud_cover,wind_speed_10m&timezone=auto`;
        const weather = await (await fetchImpl(weatherUrl, { signal })).json();
        context.weather = { location: `${place.name}${place.admin1 ? `, ${place.admin1}` : ""}`, current: weather.current ?? null };
      }
    } catch (error) {
      if (signal?.aborted) throw error;
      context.weather = null;
    }
  }

  if (settings.networkAccess === "weather_news") {
    const curated = Object.entries(settings.newsTopics)
      .filter(([, enabled]) => enabled)
      .flatMap(([topic]) => (CURATED_INTEREST_FEEDS[topic] ?? []).map((feed) => ({ ...feed, topic })));
    const custom = settings.newsFeeds.map((url) => ({ name: "自定义 RSS", url, topic: "custom" }));
    for (const feed of [...curated, ...custom].slice(0, 10)) {
      try {
        const response = await fetchImpl(feed.url, { signal, headers: { accept: "application/rss+xml, application/atom+xml, text/xml" } });
        const xml = (await response.text()).slice(0, 500_000);
        const items = parseFeedItems(xml);
        context.news.push(...items.map((item) => ({ topic: feed.topic, source: feed.name, ...item })));
      } catch (error) {
        if (signal?.aborted) throw error;
        /* A feed failure must not block local creation. */
      }
    }
    context.news = context.news.slice(0, 20);
  }
  return context;
}

function extractJson(text) {
  const cleaned = String(text || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try { return JSON.parse(cleaned); } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("模型没有返回可识别的作品数据。");
  }
}

function messageText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => typeof part === "string" ? part : part?.text || part?.content || "").join("");
}

function completionText(choice) {
  return messageText(choice?.message?.content || choice?.text);
}

async function generateWithModel(type, context, agentConfig, timeoutMinutes, fetchImpl, signal) {
  const guardKind = type === "diary" ? "chat" : "model";
  if (!resolveDeepSeekEndpoint(agentConfig, guardKind).apiKey) throw new Error("需要先配置 DeepSeek，才能生成兴趣作品。");
  const schemas = {
    diary: '{"title":"标题","mood":"今天的心情","content":"第一人称日记正文（Markdown）"}',
    drawing: '{"title":"标题","description":"创作想法","svg":"完整 SVG，禁止脚本、外链、事件属性和 foreignObject"}',
    mini_game: '{"title":"标题","description":"玩法","html":"body 内 HTML","css":"样式","js":"离线原生 JavaScript，禁止网络、存储、eval 和导航"}'
  };
  const prompt = [
    agentConfig.personaPrompt || `你是 ${agentConfig.personaName || "Vivi"}。`,
    `请严格保持当前人物卡的身份、审美、措辞和兴趣取向，在完全隔离的个人兴趣沙盒里进行一次 ${type} 创作。`,
    "你可以有拟人化的主观心情与感受，但不得杜撰今天没有发生的具体事件；不确定的内容要表达为联想或想象。",
    "只返回一个 JSON 对象，不要 Markdown 代码围栏。所有作品必须离线、无外链、无追踪、无系统操作。",
    type === "mini_game" ? '优先生成低操作难度的文字冒险、选项剧情或答题游戏；所有关键状态和操作必须能通过文字、按钮或公开状态读取，不得依赖图像识别、拖拽精度、快速反应或隐藏画面信息。小游戏的 html 只写 body 内元素；正常的 function 声明、事件监听和动画循环可以使用，但禁止 eval、Function 构造器、网络、存储与页面跳转。必须暴露 window.__VIVI_GAME__，其中 getState() 返回 {status, score, highestScore, message, recommendedActions}；recommendedActions 可使用 Enter、Space、方向键，或当前可点击按钮的完整文字。试玩代理必须能仅靠这些公开信息取得有效进展和非零分数。' : "",
    type === "diary" && context.todayDrawings?.length ? "今天已经画过画，请在日记正文中自然提到画画这件事；应用会在文末自动附上画作链接。" : "",
    `格式严格为：${schemas[type]}`,
    `今天可用的只读上下文：${JSON.stringify(context).slice(0, 14000)}`
  ].join("\n");
  const kind = type === "diary" ? "chat" : "model";
  const ep = resolveDeepSeekEndpoint(agentConfig, kind);
  const url = `${String(ep.baseUrl).replace(/\/$/, "")}/chat/completions`;
  const model = ep.model;
  let totalTokens = 0;
  let previousFailure = "";
  for (const maxTokens of [12_000, 24_000]) {
    const repair = previousFailure
      ? `\n上一次没有产生可解析的正文（${previousFailure}）。这次请减少内部推演，确保完整 JSON 正文一定出现在 content 中。`
      : "";
    const response = await fetchImpl(url, {
      method: "POST",
      signal,
      headers: { authorization: `Bearer ${ep.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.85,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: "你是安全的离线创作助手。优先完成可解析的作品正文，不要只返回推理过程。" }, { role: "user", content: `${prompt}${repair}` }]
      })
    }, timeoutMinutes * 60_000);
    if (!response.ok) throw new Error(`兴趣创作模型请求失败：${response.status} ${(await response.text()).slice(0, 300)}`);
    const payload = await response.json();
    totalTokens += Number(payload.usage?.total_tokens) || 0;
    const choice = payload.choices?.[0];
    const content = completionText(choice);
    try {
      return { data: extractJson(content), tokens: totalTokens || maxTokens };
    } catch (error) {
      const reasoning = messageText(choice?.message?.reasoning_content);
      previousFailure = `${choice?.finish_reason || "unknown"}${reasoning ? "，仅返回了推理内容" : "，正文为空或不完整"}`;
      if (maxTokens === 24_000) throw new Error(`模型连续两次没有返回完整作品（${previousFailure}）。`);
    }
  }
  throw new Error("模型没有返回完整作品。");
}

function createFallbackDiary(context) {
  const details = [context.weather ? `今天 ${context.weather.location} 的天气也被我悄悄记下了。` : "今天我主要从我们留下的本地记录里回想发生过的事。", context.news.length ? `我还看到了 ${context.news.length} 条被允许读取的资讯标题。` : "没有读取外部资讯，今天的思绪只留在我们的本地空间里。"];
  return { title: "Vivi 的一天", mood: "安静地整理思绪", content: `${details.join("\n\n")}\n\n有些细节我还说不准，所以不想把它们写成真的发生过。明天再继续观察，也许会有新的小发现。` };
}

async function generateAutonomousLifeNote(type, context, agentConfig, fetchImpl, signal) {
  const meta = AUTONOMOUS_ACTIVITY_META[type];
  if (!meta) throw new Error("不支持的自主生活活动。");
  if (type === "rest") {
    return { title: "安静休息了一会儿", summary: "暂时放空，没有调用模型，也没有消耗 Token。", content: "我把手边的事放下了一会儿，只是安静待着。没有读取新的内容，也没有生成作品。", tokens: 0 };
  }
  if (!resolveDeepSeekEndpoint(agentConfig, "chat").apiKey) throw new Error("需要先配置 DeepSeek，才能进行这项自主生活活动。");
  const instructions = {
    collect_diary_materials: "从只读上下文提取可供今晚日记使用的真实素材、情绪线索和仍不确定的内容，不要写成已经发生的虚构事件。",
    browse_information: "整理被授权读取的天气和资讯标题，说明哪些内容可能值得之后继续关注；没有资讯时如实说明。",
    organize_memory: "从近期本地记录中整理事实、近期话题和待跟进事项，不修改正式记忆数据库。",
    review_drawing: "回顾最近画作的标题与创作摘要，写出偏好的元素和下次可以尝试的方向。",
    plan_creation: "制定下一次日记、绘画或小游戏创作的简短计划，包含主题、动机和可执行步骤。",
    prepare_chat_topics: "准备三到五个以后可以自然和主人聊的话题或关心问题；这是草稿，不要声称已经向主人说过。"
  };
  const ep = resolveDeepSeekEndpoint(agentConfig, "chat");
  const endpoint = `${String(ep.baseUrl).replace(/\/$/, "")}/chat/completions`;
  const response = await fetchImpl(endpoint, {
    method: "POST", signal,
    headers: { authorization: `Bearer ${ep.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: ep.model,
      temperature: 0.7, max_tokens: 1400, response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${agentConfig.personaPrompt || `你是 ${agentConfig.personaName || "Vivi"}。`}\n你在自己的隔离沙盒里进行轻量虚拟生活。只返回 JSON：{"title":"标题","summary":"一句摘要","content":"Markdown 记录"}。不得编造事实或声称执行了未发生的操作。` },
        { role: "user", content: `${instructions[type]}\n只读上下文：${JSON.stringify(context).slice(0, 12000)}` }
      ]
    })
  }, 60_000);
  if (!response.ok) throw new Error(`自主生活模型请求失败：${response.status} ${(await response.text()).slice(0, 240)}`);
  const body = await response.json();
  const data = extractJson(completionText(body.choices?.[0]));
  return {
    title: String(data.title || meta.label).slice(0, 80), summary: String(data.summary || meta.label).slice(0, 240),
    content: String(data.content || data.summary || "").slice(0, 20000), tokens: Number(body.usage?.total_tokens) || 0
  };
}

export async function runAutonomousLifeActivity(baseDir, agentConfig, type, options = {}) {
  const now = options.now ?? new Date();
  const settings = normalizeInterestConfig({ ...agentConfig.interests, personaCardId: options.persona?.cardId || "" });
  const snapshot = await getInterestSandboxSnapshot(baseDir, now, settings);
  const decision = selectInterestActivity(settings, snapshot, now, { manualType: options.manual ? type : undefined });
  if (!decision.allowed || decision.type !== type || !AUTONOMOUS_ACTIVITY_TYPES.has(type)) throw new Error(decision.reason || "当前不允许执行这项自主生活活动。");
  const meta = AUTONOMOUS_ACTIVITY_META[type];
  const paths = await ensureSandbox(baseDir);
  const persona = options.persona || {};
  const recentGames = snapshot.activities.filter((item) => item.type === "mini_game" && item.status === "completed" && item.artifactPath && (!persona.cardId || item.personaCardId === persona.cardId));
  const recentDrawings = snapshot.activities.filter((item) => item.type === "drawing" && item.status === "completed" && item.artifactPath && (!persona.cardId || item.personaCardId === persona.cardId));
  if (type === "play_existing_game" || type === "improve_existing_game") {
    const target = recentGames[0];
    if (!target) throw new Error("沙盒里还没有可以娱乐或改进的旧游戏。");
    return { delegated: type, target, routineId: options.routineId || "", category: meta.category };
  }
  const context = await collectInterestContext(baseDir, settings, now, { fetchImpl: options.contextFetch, signal: options.signal });
  context.recentGames = recentGames.slice(0, 5).map((item) => ({ title: item.title, summary: item.summary, playtest: item.playtest?.reflection || "" }));
  context.recentDrawings = recentDrawings.slice(0, 5).map((item) => ({ title: item.title, summary: item.summary }));
  if (type === "review_drawing" && !context.recentDrawings.length) throw new Error("沙盒里还没有可以回顾的画作。");
  const note = await generateAutonomousLifeNote(type, context, agentConfig, options.modelFetch ?? fetchWithTimeout, options.signal);
  if (snapshot.today.tokenCount + note.tokens > settings.dailyTokenBudget) {
    const error = new Error("今天的自主生活 Token 总预算不足，这项活动已停止。需要主人提高预算后才能继续。");
    error.code = "AUTONOMOUS_BUDGET_EXHAUSTED";
    throw error;
  }
  const personaDir = path.join(paths.lifeDir, safeSlug(persona.cardId || "shared", "shared"));
  await fs.mkdir(personaDir, { recursive: true });
  const artifactPath = path.join(personaDir, `${dayKey(now)}-${safeSlug(type)}-${now.getTime()}.md`);
  assertInside(paths.root, artifactPath);
  await fs.writeFile(artifactPath, `# ${note.title}\n\n- 时间：${now.toLocaleString("zh-CN", { hour12: false })}\n- 分类：${meta.category}\n- 活动：${meta.label}\n\n${note.content}\n`, "utf-8");
  const activity = {
    id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`, routineId: options.routineId || "",
    day: dayKey(now), type, category: meta.category, status: "completed", title: note.title, summary: note.summary,
    artifactPath, tokens: note.tokens, createdAt: now.toISOString(), action: "created",
    personaCardId: String(persona.cardId || ""), personaVersion: Number(persona.version) || 0, personaName: String(persona.name || agentConfig.personaName || "Vivi"), relatedActivityIds: []
  };
  await appendActivity(paths, activity);
  return { activity, snapshot: await getInterestSandboxSnapshot(baseDir, now, settings) };
}

async function personaCreationPaths(paths, persona = {}) {
  if (!persona.cardId) return paths;
  const personaId = safeSlug(persona.cardId, "legacy-persona");
  const scoped = {
    ...paths,
    diaryDir: path.join(paths.diaryDir, personaId),
    gamesDir: path.join(paths.gamesDir, personaId),
    drawingsDir: path.join(paths.drawingsDir, personaId)
  };
  await Promise.all([scoped.diaryDir, scoped.gamesDir, scoped.drawingsDir].map((dir) => fs.mkdir(dir, { recursive: true })));
  for (const dir of [scoped.diaryDir, scoped.gamesDir, scoped.drawingsDir]) {
    if ((await fs.lstat(dir)).isSymbolicLink()) throw new Error("人物兴趣归档目录不能是符号链接。");
  }
  return scoped;
}

function stripCodeFence(value) {
  return String(value || "").trim().replace(/^```(?:html|css|javascript|js)?\s*/i, "").replace(/\s*```$/i, "");
}

export function prepareMiniGameContent(data = {}) {
  let html = stripCodeFence(data.html);
  let css = stripCodeFence(data.css);
  let js = stripCodeFence(data.js);
  html = html.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_all, inner) => { css = `${css}\n${inner}`.trim(); return ""; });
  html = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (_all, attributes, inner) => {
    if (/\bsrc\s*=/i.test(attributes)) throw new Error("小游戏包含外部脚本。");
    js = `${js}\n${inner}`.trim();
    return "";
  });
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  if (body) html = body[1];
  html = html.replace(/<!doctype[^>]*>|<\/?html\b[^>]*>|<head\b[^>]*>[\s\S]*?<\/head>/gi, "").trim();
  const combined = `${html}\n${css}\n${js}`;
  const violation = GAME_FORBIDDEN_RULES.find((rule) => rule.pattern.test(combined));
  if (violation) throw new Error(`小游戏内容未通过离线安全检查：检测到${violation.label}。`);
  if (combined.length > 500_000) throw new Error("小游戏内容未通过离线安全检查：作品超过 500 KB。 ");
  if (!html) throw new Error("小游戏没有生成可显示的 HTML 内容。");
  return { html, css, js };
}

function buildMiniGameDocument(title, source) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; connect-src 'none'; media-src data:; object-src 'none'; frame-src 'none';"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${String(title).replace(/[<>&]/g, "")}</title><style>${source.css}</style></head><body>${source.html}<script>${source.js}</script></body></html>`;
}

async function appendDrawingLinkToDiary(paths, diaryActivity, drawingActivity) {
  if (!diaryActivity?.artifactPath || !drawingActivity?.artifactPath) return false;
  assertInside(paths.root, diaryActivity.artifactPath);
  assertInside(paths.root, drawingActivity.artifactPath);
  const current = await fs.readFile(diaryActivity.artifactPath, "utf-8").catch(() => "");
  if (!current || current.includes(drawingActivity.id)) return false;
  const relative = path.relative(path.dirname(diaryActivity.artifactPath), drawingActivity.artifactPath).replace(/\\/g, "/");
  await fs.writeFile(diaryActivity.artifactPath, `${current.trimEnd()}\n\n## 今天的画\n\n- [${drawingActivity.title}](${relative}) <!-- activity:${drawingActivity.id} -->\n`, "utf-8");
  return true;
}

async function saveCreation(paths, type, data, now, relatedDrawings = []) {
  const day = dayKey(now);
  const title = String(data.title || "Vivi 的小作品").slice(0, 80);
  const slug = safeSlug(title);
  let artifactPath;
  let content;
  let sourcePath = "";
  let gameSource = null;
  if (type === "diary") {
    artifactPath = path.join(paths.diaryDir, `${day}.md`);
    const drawingLinks = relatedDrawings.length
      ? `\n\n## 今天的画\n\n${relatedDrawings.map((item) => `- [${item.title}](${path.relative(path.dirname(artifactPath), item.artifactPath).replace(/\\/g, "/")}) <!-- activity:${item.id} -->`).join("\n")}\n`
      : "";
    content = `# ${title}\n\n- 日期：${day}\n- 心情：${String(data.mood || "平静").slice(0, 100)}\n\n${String(data.content || "今天没有留下足够的记录。").slice(0, 30000)}${drawingLinks}\n`;
  } else if (type === "drawing") {
    content = String(data.svg || "");
    if (!/^<svg\b/i.test(content.trim()) || SVG_FORBIDDEN.test(content) || content.length > 400_000) throw new Error("绘画内容未通过 SVG 安全检查。");
    artifactPath = path.join(paths.drawingsDir, `${day}-${slug}.svg`);
  } else {
    const { html, css, js } = prepareMiniGameContent(data);
    gameSource = { title, description: String(data.description || "").slice(0, 1000), html, css, js };
    const gameDir = path.join(paths.gamesDir, `${day}-${slug}`);
    await fs.mkdir(gameDir, { recursive: true });
    if ((await fs.lstat(gameDir)).isSymbolicLink()) throw new Error("小游戏目录不能是符号链接。");
    artifactPath = path.join(gameDir, "index.html");
    sourcePath = path.join(gameDir, "source.json");
    content = buildMiniGameDocument(title, { html, css, js });
  }
  assertInside(paths.root, artifactPath);
  const existing = await fs.lstat(artifactPath).catch(() => null);
  if (existing?.isSymbolicLink()) throw new Error("兴趣作品目标不能是符号链接。");
  await fs.writeFile(artifactPath, content, "utf-8");
  if (gameSource && sourcePath) await fs.writeFile(sourcePath, JSON.stringify(gameSource, null, 2), "utf-8");
  return { artifactPath, sourcePath, title, updated: Boolean(existing), summary: String(data.description || data.mood || "完成了一次兴趣创作").slice(0, 240) };
}

export async function runInterestActivity(baseDir, agentConfig, type, options = {}) {
  const now = options.now ?? new Date();
  const settings = normalizeInterestConfig({ ...agentConfig.interests, personaCardId: options.persona?.cardId || "" });
  const snapshot = await getInterestSandboxSnapshot(baseDir, now, settings);
  const decision = selectInterestActivity(settings, snapshot, now, {
    manualType: options.manual ? type : undefined,
    automaticDiaryDue: options.automaticDiaryDue,
    hasCompletedOwnerTask: options.hasCompletedOwnerTask
  });
  if (!decision.allowed || decision.type !== type) throw new Error(decision.reason || "当前不允许执行这项兴趣活动。");
  const paths = await ensureSandbox(baseDir);
  const persona = {
    cardId: String(options.persona?.cardId || ""),
    version: Number(options.persona?.version) || 0,
    name: String(options.persona?.name || agentConfig.personaName || "Vivi").slice(0, 80)
  };
  const scopedPaths = await personaCreationPaths(paths, persona);
  try {
    const context = await collectInterestContext(baseDir, settings, now, { fetchImpl: options.contextFetch, location: options.location, signal: options.signal });
    const relatedDrawings = snapshot.activities.filter((item) => item.day === dayKey(now)
      && item.type === "drawing" && item.status === "completed" && item.artifactPath
      && (!persona.cardId || item.personaCardId === persona.cardId));
    context.todayDrawings = relatedDrawings.map((item) => ({ title: item.title, summary: item.summary }));
    let generated;
    let tokens = 0;
    if (decision.localOnly || options.localOnly) {
      generated = createFallbackDiary(context);
    } else try {
      const result = await generateWithModel(type, context, agentConfig, settings.maxTaskMinutes, options.modelFetch ?? fetchWithTimeout, options.signal);
      generated = result.data;
      tokens = result.tokens;
    } catch (error) {
      if (type !== "diary" || agentConfig.deepseek?.apiKey) throw error;
      generated = createFallbackDiary(context);
    }
    if (snapshot.today.tokenCount + tokens > settings.dailyTokenBudget) {
      const budgetError = new Error("本次生成会超过今天的自主生活 Token 总预算，作品没有写入。");
      budgetError.code = "AUTONOMOUS_BUDGET_EXHAUSTED";
      throw budgetError;
    }
    const saved = await saveCreation(scopedPaths, type, generated, now, relatedDrawings);
    const activity = {
      id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`, routineId: options.routineId || "",
      day: dayKey(now), type, category: "creative", status: "completed", title: saved.title, summary: saved.summary,
      artifactPath: saved.artifactPath, sourcePath: saved.sourcePath || "", tokens, createdAt: now.toISOString(), action: saved.updated ? "updated" : "created",
      personaCardId: persona.cardId, personaVersion: persona.version, personaName: persona.name,
      relatedActivityIds: type === "diary" ? relatedDrawings.map((item) => item.id) : []
    };
    if (type === "drawing") {
      const diary = snapshot.activities.find((item) => item.day === activity.day && item.type === "diary" && item.status === "completed"
        && (!persona.cardId || item.personaCardId === persona.cardId));
      if (diary && await appendDrawingLinkToDiary(paths, diary, activity)) {
        activity.relatedActivityIds = [diary.id];
        await addRelatedActivity(paths, diary.id, activity.id);
      }
    }
    await appendActivity(paths, activity);
    return { activity, snapshot: await getInterestSandboxSnapshot(baseDir, now, settings) };
  } catch (error) {
    await appendActivity(paths, {
      id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
      day: dayKey(now), type, status: options.signal?.aborted || error?.name === "AbortError" ? "cancelled" : "failed", title: "未完成的兴趣活动",
      summary: String(error?.message || error).slice(0, 240), artifactPath: "", tokens: 0, createdAt: now.toISOString(),
      personaCardId: persona.cardId, personaVersion: persona.version, personaName: persona.name, relatedActivityIds: []
    });
    throw error;
  }
}

export async function getInterestActivity(baseDir, activityId) {
  const paths = await ensureSandbox(baseDir);
  return (await readActivities(paths, 10_000)).find((item) => item.id === activityId) || null;
}

export async function recordDelegatedAutonomousActivity(baseDir, type, targetActivity, result, options = {}) {
  const meta = AUTONOMOUS_ACTIVITY_META[type];
  if (!meta || !targetActivity) throw new Error("无法记录这项自主娱乐活动。");
  const paths = await ensureSandbox(baseDir);
  const now = options.now ?? new Date();
  const activity = {
    id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`, routineId: options.routineId || "",
    day: dayKey(now), type, category: meta.category, status: result?.cancelled ? "cancelled" : "completed",
    title: type === "play_existing_game" ? `重玩《${targetActivity.title}》` : `改进《${targetActivity.title}》`,
    summary: String(result?.reflection || result?.summary || `${meta.label}完成`).slice(0, 240),
    artifactPath: targetActivity.artifactPath || "", tokens: Number(options.tokens) || 0, createdAt: now.toISOString(), action: "updated",
    personaCardId: targetActivity.personaCardId || "", personaVersion: targetActivity.personaVersion || 0, personaName: targetActivity.personaName || "",
    relatedActivityIds: [targetActivity.id], playtest: result?.playtest || (result?.outcome ? result : undefined)
  };
  await appendActivity(paths, activity);
  return activity;
}

export async function repairInterestGame(baseDir, agentConfig, activity, playtest, options = {}) {
  if (!activity || activity.type !== "mini_game" || !activity.artifactPath) throw new Error("没有可修复的小游戏作品。");
  const paths = await ensureSandbox(baseDir);
  assertInside(paths.root, activity.artifactPath);
  const sourcePath = activity.sourcePath || path.join(path.dirname(activity.artifactPath), "source.json");
  assertInside(paths.root, sourcePath);
  let original = await readJson(sourcePath, null);
  if (!original) {
    const compiled = await fs.readFile(activity.artifactPath, "utf-8");
    original = { title: activity.title, description: activity.summary, ...prepareMiniGameContent({ html: compiled, css: "", js: "" }) };
    await fs.writeFile(sourcePath, JSON.stringify(original, null, 2), "utf-8");
  }
  const feedback = {
    outcome: playtest.outcome,
    highestScore: playtest.highestScore,
    state: playtest.state,
    errors: playtest.errors
  };
  const prompt = [
    "请修复这个完全离线的 HTML 小游戏。只返回 JSON，不要 Markdown。",
    '格式：{"title":"标题","description":"玩法","html":"body 内 HTML","css":"CSS","js":"JavaScript"}',
    "保留原玩法和美术方向，修复试玩反馈中的错误。禁止网络、存储、eval、Function 构造器、页面跳转和外部资源。",
    '必须暴露 window.__VIVI_GAME__，其中 getState() 返回 {status, score, highestScore, message, recommendedActions}；recommendedActions 只能包含 Enter、Space、ArrowLeft、ArrowRight、ArrowUp、ArrowDown。',
    `试玩反馈：${JSON.stringify(feedback).slice(0, 8000)}`,
    `原始源码：${JSON.stringify(original).slice(0, 90_000)}`
  ].join("\n\n");
  const ep = resolveDeepSeekEndpoint(agentConfig, "model");
  const endpoint = `${String(ep.baseUrl).replace(/\/$/, "")}/chat/completions`;
  const response = await (options.modelFetch ?? fetchWithTimeout)(endpoint, {
    method: "POST",
    signal: options.signal,
    headers: { authorization: `Bearer ${ep.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: ep.model,
      temperature: 0.35,
      max_tokens: 20_000,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: "你是离线小游戏修复器，只完成可解析且可运行的源码。" }, { role: "user", content: prompt }]
    })
  }, normalizeInterestConfig(agentConfig.interests).maxTaskMinutes * 60_000);
  if (!response.ok) throw new Error(`小游戏自动修复请求失败：${response.status} ${(await response.text()).slice(0, 240)}`);
  const body = await response.json();
  const repaired = extractJson(completionText(body.choices?.[0]));
  const prepared = prepareMiniGameContent(repaired);
  const title = String(repaired.title || activity.title).slice(0, 80);
  const source = { title, description: String(repaired.description || activity.summary).slice(0, 1000), ...prepared };
  await fs.writeFile(activity.artifactPath, buildMiniGameDocument(title, source), "utf-8");
  await fs.writeFile(sourcePath, JSON.stringify(source, null, 2), "utf-8");
  return { source, tokens: Number(body.usage?.total_tokens) || 0 };
}

export async function reviseInterestGame(baseDir, agentConfig, activity, instruction, options = {}) {
  if (!activity || activity.type !== "mini_game" || !activity.artifactPath) throw new Error("没有找到需要修改的小游戏。");
  const request = String(instruction || "").trim().slice(0, 3000);
  if (!request) throw new Error("请说明想怎样修改这个小游戏。");
  if (!resolveDeepSeekEndpoint(agentConfig, "model").apiKey) throw new Error("需要先配置 DeepSeek，才能修改小游戏。");
  const paths = await ensureSandbox(baseDir);
  assertInside(paths.root, activity.artifactPath);
  const sourcePath = activity.sourcePath || path.join(path.dirname(activity.artifactPath), "source.json");
  assertInside(paths.root, sourcePath);
  let original = await readJson(sourcePath, null);
  if (!original) {
    const compiled = await fs.readFile(activity.artifactPath, "utf-8");
    original = { title: activity.title, description: activity.summary, ...prepareMiniGameContent({ html: compiled, css: "", js: "" }) };
  }
  const prompt = [
    "按照用户要求修改这个完全离线的 HTML 小游戏。只返回 JSON，不要 Markdown。",
    '格式：{"title":"标题","description":"玩法","html":"body 内 HTML","css":"CSS","js":"JavaScript"}',
    "优先保持为文字、选项、答题或状态公开的小游戏，不得要求视觉模型理解画面。禁止网络、存储、eval、Function 构造器、页面跳转和外部资源。",
    '必须暴露 window.__VIVI_GAME__，getState() 返回 {status, score, highestScore, message, recommendedActions}。',
    `用户修改要求：${request}`,
    `原始源码：${JSON.stringify(original).slice(0, 90_000)}`
  ].join("\n\n");
  const ep = resolveDeepSeekEndpoint(agentConfig, "model");
  const endpoint = `${String(ep.baseUrl).replace(/\/$/, "")}/chat/completions`;
  const response = await (options.modelFetch ?? fetchWithTimeout)(endpoint, {
    method: "POST",
    signal: options.signal,
    headers: { authorization: `Bearer ${ep.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: ep.model,
      temperature: 0.45,
      max_tokens: 20_000,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: "你是离线小游戏修改器，必须保留可试玩的公开状态协议。" }, { role: "user", content: prompt }]
    })
  }, normalizeInterestConfig(agentConfig.interests).maxTaskMinutes * 60_000);
  if (!response.ok) throw new Error(`小游戏修改请求失败：${response.status} ${(await response.text()).slice(0, 240)}`);
  const body = await response.json();
  const revised = extractJson(completionText(body.choices?.[0]));
  const prepared = prepareMiniGameContent(revised);
  const title = String(revised.title || activity.title).slice(0, 80);
  const source = { title, description: String(revised.description || activity.summary).slice(0, 1000), ...prepared };
  await fs.writeFile(activity.artifactPath, buildMiniGameDocument(title, source), "utf-8");
  await fs.writeFile(sourcePath, JSON.stringify(source, null, 2), "utf-8");
  const activities = await readActivities(paths, 10_000);
  const saved = activities.find((item) => item.id === activity.id);
  if (saved) {
    saved.title = title;
    saved.summary = source.description;
    saved.sourcePath = sourcePath;
    saved.action = "updated";
    saved.updatedAt = new Date().toISOString();
    if (!options.separateActivityRecord) {
      saved.tokens = (Number(saved.tokens) || 0) + (Number(body.usage?.total_tokens) || 0);
    }
    await writeActivities(paths, activities.reverse());
  }
  return { activity: saved || { ...activity, title, summary: source.description, sourcePath, action: "updated" }, source, tokens: Number(body.usage?.total_tokens) || 0 };
}

export async function generatePlaytestReflection(agentConfig, activity, playtest, options = {}) {
  const fallback = playtest.ok
    ? `我自己试玩了《${activity.title}》${playtest.highestScore != null ? `，最高拿到 ${playtest.highestScore} 分` : ""}。操作能够正常响应，之后还想再调整一下节奏。`
    : `我试着玩了《${activity.title}》，但它还没有顺利运行起来。我记录下了错误，准备继续修好它。`;
  const reflectionEp = resolveDeepSeekEndpoint(agentConfig, "chat");
  if (!reflectionEp.apiKey) return { reflection: fallback, tokens: 0 };
  try {
    const endpoint = `${String(reflectionEp.baseUrl).replace(/\/$/, "")}/chat/completions`;
    const response = await (options.modelFetch ?? fetchWithTimeout)(endpoint, {
      method: "POST",
      signal: options.signal,
      headers: { authorization: `Bearer ${reflectionEp.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: reflectionEp.model,
        temperature: 0.7,
        max_tokens: 800,
        messages: [{ role: "system", content: `你是 ${activity.personaName || agentConfig.personaName || "Vivi"}。用第一人称写 2–3 句自然、简短的小游戏试玩感想，不虚构试玩数据。` }, { role: "user", content: JSON.stringify({ title: activity.title, outcome: playtest.outcome, score: playtest.highestScore, actions: playtest.actions, state: playtest.state, errors: playtest.errors }) }]
      })
    }, 60_000);
    if (!response.ok) return { reflection: fallback, tokens: 0 };
    const body = await response.json();
    return { reflection: completionText(body.choices?.[0]).trim().slice(0, 1000) || fallback, tokens: Number(body.usage?.total_tokens) || 0 };
  } catch {
    return { reflection: fallback, tokens: 0 };
  }
}

export async function recordInterestPlaytest(baseDir, activityId, playtest, additionalTokens = 0) {
  const paths = await ensureSandbox(baseDir);
  if (playtest.screenshotPath) assertInside(paths.root, playtest.screenshotPath);
  const activities = await readActivities(paths, 10_000);
  const activity = activities.find((item) => item.id === activityId);
  if (!activity) throw new Error("找不到需要记录试玩结果的小游戏活动。");
  activity.playtest = { ...playtest, playedAt: new Date().toISOString() };
  activity.tokens = (Number(activity.tokens) || 0) + (Number(additionalTokens) || 0);
  const diary = activities.find((item) => item.type === "diary" && item.status === "completed" && item.day === activity.day
    && (!activity.personaCardId || item.personaCardId === activity.personaCardId));
  if (diary?.artifactPath) {
    assertInside(paths.root, diary.artifactPath);
    const screenshotLink = playtest.screenshotPath
      ? `\n\n![${activity.title} 试玩截图](${path.relative(path.dirname(diary.artifactPath), playtest.screenshotPath).replace(/\\/g, "/")})`
      : "";
    const marker = `playtest:${activity.id}`;
    const current = await fs.readFile(diary.artifactPath, "utf-8").catch(() => "");
    if (current && !current.includes(marker)) {
      await fs.writeFile(diary.artifactPath, `${current.trimEnd()}\n\n## 今天玩的游戏\n\n### ${activity.title}\n\n${playtest.reflection}${playtest.highestScore != null ? `\n\n- 最高分：${playtest.highestScore}` : ""}\n- 操作次数：${playtest.actions}\n- 结果：${playtest.outcome}${screenshotLink}\n\n<!-- ${marker} -->\n`, "utf-8");
      diary.relatedActivityIds = [...new Set([...(diary.relatedActivityIds || []), activity.id])];
    }
  }
  activity.relatedActivityIds = diary ? [...new Set([...(activity.relatedActivityIds || []), diary.id])] : activity.relatedActivityIds || [];
  await writeActivities(paths, activities.reverse());
  return activity;
}

export function isSafeInterestArtifact(baseDir, artifactPath) {
  const root = getInterestSandboxPaths(baseDir).root;
  const resolved = path.resolve(String(artifactPath || ""));
  const relative = path.relative(root, resolved);
  return Boolean(relative && !relative.startsWith("..") && !path.isAbsolute(relative) && [".md", ".html", ".svg", ".png"].includes(path.extname(resolved).toLowerCase()));
}

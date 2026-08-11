import fs from "node:fs/promises";
import path from "node:path";

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
  autoOpenPreview: false,
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

const ACTIVITY_TYPES = new Set(["diary", "mini_game", "drawing"]);
const PERMISSION_LEVELS = new Set(["off", "diary_only", "create", "preview"]);
const NETWORK_LEVELS = new Set(["off", "weather", "weather_news"]);
const GAME_FORBIDDEN = /\b(fetch|XMLHttpRequest|WebSocket|EventSource|eval|Function|indexedDB|localStorage|sessionStorage|window\.open|document\.cookie)\b|\b(?:window\.)?location\s*=|<\s*(script|iframe|object|embed|form|base|meta|link)\b|https?:\/\/|while\s*\(\s*true\s*\)|for\s*\(\s*;\s*;\s*\)/i;
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
    dailyTaskLimit: clampInteger(raw.dailyTaskLimit, 1, 1, 6),
    dailyTokenBudget: clampInteger(raw.dailyTokenBudget, 2500, 500, 20000),
    maxTaskMinutes: clampInteger(raw.maxTaskMinutes, 5, 1, 20),
    maxDiskMB: clampInteger(raw.maxDiskMB, 100, 10, 2048),
    idleMinutes: clampInteger(raw.idleMinutes, 30, 5, 240),
    minimumHoursBetweenTasks: clampInteger(raw.minimumHoursBetweenTasks, 6, 1, 24),
    activeStart: /^\d{2}:\d{2}$/.test(raw.activeStart) ? raw.activeStart : DEFAULT_INTEREST_CONFIG.activeStart,
    activeEnd: /^\d{2}:\d{2}$/.test(raw.activeEnd) ? raw.activeEnd : DEFAULT_INTEREST_CONFIG.activeEnd,
    diaryHour: clampInteger(raw.diaryHour, 21, 0, 23),
    autoOpenPreview: Boolean(raw.autoOpenPreview),
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
    activityLogPath: path.join(root, "activity.jsonl"),
    statePath: path.join(root, "state.json"),
    locationPath: path.join(root, "location.json")
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

export async function initializeInterestSession(baseDir, now = new Date(), random = Math.random) {
  const paths = await ensureSandbox(baseDir);
  const today = dayKey(now);
  const current = await readJson(paths.statePath, {});
  if (current.day === today && current.diaryDueAt) return current;
  const delayMs = (2 + Math.max(0, Math.min(1, Number(random()) || 0))) * 3_600_000;
  const next = {
    version: 1,
    day: today,
    launchedAt: now.toISOString(),
    diaryDueAt: new Date(now.getTime() + delayMs).toISOString(),
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
  await Promise.all([paths.diaryDir, paths.gamesDir, paths.drawingsDir].map((dir) => fs.mkdir(dir, { recursive: true })));
  for (const dir of [paths.root, paths.diaryDir, paths.gamesDir, paths.drawingsDir]) {
    if ((await fs.lstat(dir)).isSymbolicLink()) throw new Error("兴趣沙盒目录不能是符号链接。");
  }
  return paths;
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

export async function getInterestSandboxSnapshot(baseDir, now = new Date()) {
  const paths = await ensureSandbox(baseDir);
  const activities = await readActivities(paths);
  const today = dayKey(now);
  const todayActivities = activities.filter((item) => item.day === today);
  return {
    root: paths.root,
    activities,
    today: {
      date: today,
      taskCount: todayActivities.length,
      creativeTaskCount: todayActivities.filter((item) => item.type !== "diary").length,
      diaryWritten: todayActivities.some((item) => item.type === "diary" && item.status === "completed"),
      tokenCount: todayActivities.reduce((sum, item) => sum + (Number(item.tokens) || 0), 0)
    },
    diskBytes: await directorySize(paths.root),
    session: await initializeInterestSession(baseDir, now),
    location: await loadInterestLocation(baseDir)
  };
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

export function selectInterestActivity(config, snapshot, now = new Date(), { manualType, automaticDiaryDue = false, hasCompletedOwnerTask = false } = {}) {
  const settings = normalizeInterestConfig(config);
  if (!settings.enabled || settings.permissionLevel === "off") return { allowed: false, reason: "兴趣沙盒尚未开启。" };
  if (snapshot.diskBytes >= settings.maxDiskMB * 1024 * 1024) return { allowed: false, reason: "兴趣沙盒磁盘配额已经用完。" };

  if (manualType) {
    if (!ACTIVITY_TYPES.has(manualType)) return { allowed: false, reason: "不支持的兴趣活动。" };
    if (settings.permissionLevel === "diary_only" && manualType !== "diary") return { allowed: false, reason: "当前权限仅允许写日记。" };
    const key = manualType === "mini_game" ? "miniGames" : manualType;
    if (!settings.activities[key]) return { allowed: false, reason: "这项兴趣活动没有开启。" };
    return { allowed: true, type: manualType };
  }

  const wroteDiary = Boolean(snapshot.today.diaryWritten ?? snapshot.activities.some((item) => item.day === snapshot.today.date && item.type === "diary" && item.status === "completed"));
  if (automaticDiaryDue && settings.activities.diary && !wroteDiary) {
    return { allowed: true, type: "diary", localOnly: snapshot.today.tokenCount >= settings.dailyTokenBudget };
  }
  if (snapshot.today.tokenCount >= settings.dailyTokenBudget) return { allowed: false, reason: "今天的兴趣沙盒 Token 预算已经用完。" };
  if (!hasCompletedOwnerTask && !snapshot.session?.pendingActivity) return { allowed: false, reason: "主人尚未完成可进入空闲创作阶段的任务。" };
  if ((snapshot.today.creativeTaskCount ?? snapshot.today.taskCount) >= settings.dailyTaskLimit) return { allowed: false, reason: "今天的自主创作次数已经达到上限。" };

  if (!withinWindow(now, settings.activeStart, settings.activeEnd)) return { allowed: false, reason: "当前不在允许自主活动的时间段内。" };
  const latest = snapshot.activities[0];
  if (latest && now.getTime() - new Date(latest.createdAt).getTime() < settings.minimumHoursBetweenTasks * 3600_000) {
    return { allowed: false, reason: "距离上一次自主活动还太近。" };
  }
  if (settings.permissionLevel === "diary_only") return { allowed: false, reason: "今天的日记将在启动 2–3 小时后写入。" };
  const options = [settings.activities.drawing && "drawing", settings.activities.miniGames && "mini_game"].filter(Boolean);
  return options.length ? { allowed: true, type: options[now.getDate() % options.length] } : { allowed: false, reason: "没有已开启的创作活动。" };
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

async function generateWithModel(type, context, agentConfig, timeoutMinutes, fetchImpl, signal) {
  if (!agentConfig.deepseek?.apiKey) throw new Error("需要先配置 DeepSeek，才能生成兴趣作品。");
  const schemas = {
    diary: '{"title":"标题","mood":"今天的心情","content":"第一人称日记正文（Markdown）"}',
    drawing: '{"title":"标题","description":"创作想法","svg":"完整 SVG，禁止脚本、外链、事件属性和 foreignObject"}',
    mini_game: '{"title":"标题","description":"玩法","html":"body 内 HTML","css":"样式","js":"离线原生 JavaScript，禁止网络、存储、eval 和导航"}'
  };
  const prompt = [
    `你是 ${agentConfig.personaName || "Vivi"}，在完全隔离的个人兴趣沙盒里进行一次 ${type} 创作。`,
    "你可以有拟人化的主观心情与感受，但不得杜撰今天没有发生的具体事件；不确定的内容要表达为联想或想象。",
    "只返回一个 JSON 对象，不要 Markdown 代码围栏。所有作品必须离线、无外链、无追踪、无系统操作。",
    `格式严格为：${schemas[type]}`,
    `今天可用的只读上下文：${JSON.stringify(context).slice(0, 14000)}`
  ].join("\n");
  const response = await fetchImpl(`${String(agentConfig.deepseek.baseUrl).replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    signal,
    headers: { authorization: `Bearer ${agentConfig.deepseek.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: agentConfig.deepseek.chatModel || agentConfig.deepseek.model,
      temperature: 0.85,
      max_tokens: 2200,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: "你是安全的离线创作助手。" }, { role: "user", content: prompt }]
    })
  }, timeoutMinutes * 60_000);
  if (!response.ok) throw new Error(`兴趣创作模型请求失败：${response.status} ${(await response.text()).slice(0, 300)}`);
  const payload = await response.json();
  return { data: extractJson(payload.choices?.[0]?.message?.content), tokens: Number(payload.usage?.total_tokens) || 2200 };
}

function createFallbackDiary(context) {
  const details = [context.weather ? `今天 ${context.weather.location} 的天气也被我悄悄记下了。` : "今天我主要从我们留下的本地记录里回想发生过的事。", context.news.length ? `我还看到了 ${context.news.length} 条被允许读取的资讯标题。` : "没有读取外部资讯，今天的思绪只留在我们的本地空间里。"];
  return { title: "Vivi 的一天", mood: "安静地整理思绪", content: `${details.join("\n\n")}\n\n有些细节我还说不准，所以不想把它们写成真的发生过。明天再继续观察，也许会有新的小发现。` };
}

async function saveCreation(paths, type, data, now) {
  const day = dayKey(now);
  const title = String(data.title || "Vivi 的小作品").slice(0, 80);
  const slug = safeSlug(title);
  let artifactPath;
  let content;
  if (type === "diary") {
    artifactPath = path.join(paths.diaryDir, `${day}.md`);
    content = `# ${title}\n\n- 日期：${day}\n- 心情：${String(data.mood || "平静").slice(0, 100)}\n\n${String(data.content || "今天没有留下足够的记录。").slice(0, 30000)}\n`;
  } else if (type === "drawing") {
    content = String(data.svg || "");
    if (!/^<svg\b/i.test(content.trim()) || SVG_FORBIDDEN.test(content) || content.length > 400_000) throw new Error("绘画内容未通过 SVG 安全检查。");
    artifactPath = path.join(paths.drawingsDir, `${day}-${slug}.svg`);
  } else {
    const html = String(data.html || "");
    const css = String(data.css || "");
    const js = String(data.js || "");
    if (GAME_FORBIDDEN.test(`${html}\n${css}\n${js}`) || `${html}${css}${js}`.length > 500_000) throw new Error("小游戏内容未通过离线安全检查。");
    const gameDir = path.join(paths.gamesDir, `${day}-${slug}`);
    await fs.mkdir(gameDir, { recursive: true });
    if ((await fs.lstat(gameDir)).isSymbolicLink()) throw new Error("小游戏目录不能是符号链接。");
    artifactPath = path.join(gameDir, "index.html");
    content = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; connect-src 'none';"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title.replace(/[<>&]/g, "")}</title><style>${css}</style></head><body>${html}<script>${js}</script></body></html>`;
  }
  assertInside(paths.root, artifactPath);
  const existing = await fs.lstat(artifactPath).catch(() => null);
  if (existing?.isSymbolicLink()) throw new Error("兴趣作品目标不能是符号链接。");
  await fs.writeFile(artifactPath, content, "utf-8");
  return { artifactPath, title, updated: Boolean(existing), summary: String(data.description || data.mood || "完成了一次兴趣创作").slice(0, 240) };
}

export async function runInterestActivity(baseDir, agentConfig, type, options = {}) {
  const now = options.now ?? new Date();
  const settings = normalizeInterestConfig(agentConfig.interests);
  const snapshot = await getInterestSandboxSnapshot(baseDir, now);
  const decision = selectInterestActivity(settings, snapshot, now, {
    manualType: options.manual ? type : undefined,
    automaticDiaryDue: options.automaticDiaryDue,
    hasCompletedOwnerTask: options.hasCompletedOwnerTask
  });
  if (!decision.allowed || decision.type !== type) throw new Error(decision.reason || "当前不允许执行这项兴趣活动。");
  const paths = await ensureSandbox(baseDir);
  try {
    const context = await collectInterestContext(baseDir, settings, now, { fetchImpl: options.contextFetch, location: options.location, signal: options.signal });
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
    if (snapshot.today.tokenCount + tokens > settings.dailyTokenBudget) throw new Error("本次生成会超过今天的 Token 预算，作品没有写入。");
    const saved = await saveCreation(paths, type, generated, now);
    const activity = {
      id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
      day: dayKey(now), type, status: "completed", title: saved.title, summary: saved.summary,
      artifactPath: saved.artifactPath, tokens, createdAt: now.toISOString(), action: saved.updated ? "updated" : "created"
    };
    await appendActivity(paths, activity);
    return { activity, snapshot: await getInterestSandboxSnapshot(baseDir, now) };
  } catch (error) {
    await appendActivity(paths, {
      id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
      day: dayKey(now), type, status: options.signal?.aborted || error?.name === "AbortError" ? "cancelled" : "failed", title: "未完成的兴趣活动",
      summary: String(error?.message || error).slice(0, 240), artifactPath: "", tokens: 0, createdAt: now.toISOString()
    });
    throw error;
  }
}

export function isSafeInterestArtifact(baseDir, artifactPath) {
  const root = getInterestSandboxPaths(baseDir).root;
  const resolved = path.resolve(String(artifactPath || ""));
  const relative = path.relative(root, resolved);
  return Boolean(relative && !relative.startsWith("..") && !path.isAbsolute(relative) && [".md", ".html", ".svg"].includes(path.extname(resolved).toLowerCase()));
}

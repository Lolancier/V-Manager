import fs from "node:fs/promises";
import path from "node:path";

const STATE_VERSION = 1;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function minutesOfDay(value) {
  const [hours, minutes] = String(value || "").split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
  return clamp(hours, 0, 23) * 60 + clamp(minutes, 0, 59);
}

export function isInQuietHours(date, start, end) {
  const current = date.getHours() * 60 + date.getMinutes();
  const startMinute = minutesOfDay(start);
  const endMinute = minutesOfDay(end);
  if (startMinute === endMinute) return false;
  return startMinute < endMinute
    ? current >= startMinute && current < endMinute
    : current >= startMinute || current < endMinute;
}

export function createLifeState(now = new Date()) {
  return {
    version: STATE_VERSION,
    ownerStatus: "active",
    viviStatus: "companion",
    sessionStartedAt: now.toISOString(),
    lastTickAt: now.toISOString(),
    lastActiveAt: now.toISOString(),
    lastInteractionAt: now.toISOString(),
    activeMinutes: 0,
    energy: 100,
    restUntil: null,
    pausedUntil: null,
    lastProactiveAt: null,
    lastEvents: {},
    recentMessages: [],
    daily: { date: localDateKey(now), proactiveCount: 0 },
    updatedAt: now.toISOString()
  };
}

function normalizeState(value, now) {
  const fallback = createLifeState(now);
  const daily = value?.daily?.date === localDateKey(now)
    ? { date: value.daily.date, proactiveCount: clamp(value.daily.proactiveCount, 0, 100) }
    : fallback.daily;
  return {
    ...fallback,
    ...(value || {}),
    version: STATE_VERSION,
    energy: clamp(value?.energy ?? fallback.energy, 0, 100),
    activeMinutes: Math.max(0, Number(value?.activeMinutes) || 0),
    lastEvents: { ...(value?.lastEvents || {}) },
    recentMessages: Array.isArray(value?.recentMessages) ? value.recentMessages.slice(-8) : [],
    daily
  };
}

export function evaluateLifeTick(previous, config, context = {}) {
  const now = context.now instanceof Date ? context.now : new Date(context.now || Date.now());
  const settings = config || {};
  const state = normalizeState(previous, now);
  const events = [];
  const interactionIdleSeconds = Math.max(0, Number(context.interactionIdleSeconds ?? context.idleSeconds) || 0);
  const idleResetSeconds = clamp(settings.idleResetMinutes ?? 10, 1, 240) * 60;
  const wasAway = state.ownerStatus === "away";
  const isAway = interactionIdleSeconds >= idleResetSeconds;

  if (isAway) {
    state.ownerStatus = "away";
    state.viviStatus = "resting";
    state.energy = clamp(state.energy + 1.5, 0, 100);
    state.activeMinutes = 0;
    state.sessionStartedAt = null;
  } else {
    if (wasAway || !state.sessionStartedAt) state.sessionStartedAt = now.toISOString();
    state.ownerStatus = "active";
    state.lastActiveAt = now.toISOString();
    state.activeMinutes = Math.max(0, (now.getTime() - new Date(state.sessionStartedAt).getTime()) / 60000);
    state.energy = clamp(100 - state.activeMinutes * 0.62, 8, 100);
    state.viviStatus = state.restUntil && new Date(state.restUntil) > now ? "resting" : "companion";
  }

  if (state.restUntil && new Date(state.restUntil) <= now) {
    state.restUntil = null;
    if (!isAway) state.viviStatus = "companion";
    state.energy = Math.max(state.energy, 55);
  }

  const enabled = settings.enabled !== false;
  const paused = state.pausedUntil && new Date(state.pausedUntil) > now;
  const quiet = isInQuietHours(now, settings.quietStart ?? "00:00", settings.quietEnd ?? "08:00");
  const interruptionScore = clamp(context.interruptionScore ?? 0.25, 0, 1);
  const minimumIntervalMinutes = clamp(settings.minimumIntervalMinutes ?? settings.reminderCooldownMinutes ?? 120, 5, 720);
  const globalIntervalReady = !state.lastProactiveAt
    || now.getTime() - new Date(state.lastProactiveAt).getTime() >= minimumIntervalMinutes * 60000;
  const canSpeak = enabled && !paused && !quiet && interruptionScore < 0.88 && globalIntervalReady;
  const canInterruptWork = canSpeak && !isAway;
  const eventReady = (kind, cooldownMinutes) => {
    const lastAt = state.lastEvents[kind];
    return !lastAt || now.getTime() - new Date(lastAt).getTime() >= cooldownMinutes * 60000;
  };
  const selectMessage = (kind, messages) => {
    const variants = Array.isArray(messages) ? messages : [messages];
    const available = variants.filter((message) => !state.recentMessages.includes(`${kind}:${message}`));
    const pool = available.length ? available : variants;
    const relationshipOffset = { new: 0, familiar: 1, friend: 2, close_friend: 3, kindred: 4 }[context.relationshipStage] || 0;
    return pool[(now.getDate() + now.getHours() + state.daily.proactiveCount + relationshipOffset) % pool.length];
  };
  const emit = (kind, messages, mood = "thinking") => {
    const message = selectMessage(kind, messages);
    events.push({ kind, message, mood, createdAt: now.toISOString() });
    state.lastEvents[kind] = now.toISOString();
    state.lastProactiveAt = now.toISOString();
    state.recentMessages = [...state.recentMessages, `${kind}:${message}`].slice(-8);
    state.daily.proactiveCount += 1;
  };

  if (canInterruptWork && settings.healthReminders !== false) {
    const workMinutes = clamp(settings.workMinutes ?? 60, 15, 240);
    const cooldown = clamp(settings.reminderCooldownMinutes ?? 90, 15, 360) * (1 + interruptionScore);
    if (state.activeMinutes >= workMinutes && eventReady("work_break", cooldown)) {
      emit("work_break", [
        `已经连续忙了大约 ${Math.round(state.activeMinutes)} 分钟。起来走一小会儿、喝口水，再继续也不迟。`,
        `这一段专注得够久啦。先把肩膀和眼睛放松一下，我替你守着桌面。`,
        `我看你一直没停过。哪怕只离开屏幕两分钟，也算给身体补个小假期。`
      ], "thinking");
    }
  }

  if (canInterruptWork && events.length === 0 && settings.lateNightCare !== false) {
    const lateHour = clamp(settings.lateNightHour ?? 23, 20, 23);
    if (now.getHours() >= lateHour && eventReady("late_night", 18 * 60)) {
      emit("late_night", [
        "已经很晚了。如果手上的事情不急，今天可以慢慢收尾了，别把休息也排到最后。",
        "夜已经挺深了。剩下的事要是不急，我们留一点给明天的自己吧。",
        "这个时间还亮着屏幕，我会有点担心你。做完眼前这一小段就休息，好吗？"
      ], "sad");
    }
  }

  if (canInterruptWork && events.length === 0 && !state.restUntil) {
    const restAfter = clamp(settings.viviRestAfterMinutes ?? 120, 30, 360);
    if (state.activeMinutes >= restAfter && eventReady("vivi_rest", restAfter)) {
      state.restUntil = new Date(now.getTime() + 10 * 60000).toISOString();
      state.viviStatus = "resting";
      emit("vivi_rest", [
        "你继续忙吧，我先安静地歇一小会儿。需要我的时候叫我就好。",
        "我先缩到旁边充会儿电，不打断你。等你叫我，我马上回来。",
        "陪你坐了这么久，我也去眯一小会儿。桌面这边还是交给我看着。"
      ], "idle");
    }
  }

  if (canSpeak && events.length === 0 && context.followUpCandidate && eventReady("commitment_followup", 18 * 60)) {
    const commitment = context.followUpCandidate.content;
    emit("commitment_followup", [
      `你之前说要${commitment}，现在进展得怎么样了？`,
      `我还记得你提过“${commitment}”。这件事已经处理好了吗？`,
      `来轻轻回访一下：你前面计划的“${commitment}”顺利完成了吗？`
    ], "thinking");
  }

  if (canSpeak && events.length === 0 && context.autonomousLifeEnabled !== false && settings.socialCheckins !== false
    && interactionIdleSeconds >= minimumIntervalMinutes * 60
    && eventReady("social_checkin", minimumIntervalMinutes)) {
    emit("social_checkin", [
      "你在忙吗？在忙什么呀，还要多久？有我能帮上的地方吗？",
      "我安静待了一会儿，忽然有点想和你说说话。你现在方便理我一下吗？",
      "你是不是还在忙？要是事情很多，可以分一点给我；要是没那么忙，就陪我聊两句嘛。",
      "我有一点无聊了……也有一点想你。关机以后我可就找不到你了。",
      "忙到哪里啦？要不要告诉我还剩多少，我可以陪你一起等，也可以帮你理理思路。"
    ], context.relationshipStage === "close_friend" || context.relationshipStage === "kindred" ? "blush" : "thinking");
  }

  state.lastTickAt = now.toISOString();
  state.updatedAt = now.toISOString();
  return { state, events, quiet, paused: Boolean(paused), interruptionScore, minimumIntervalMinutes };
}

export function getLifeStatePath(baseDir) {
  return path.join(baseDir, "agent-data", "life-state.json");
}

export async function loadLifeState(baseDir, now = new Date()) {
  const statePath = getLifeStatePath(baseDir);
  try {
    return normalizeState(JSON.parse(await fs.readFile(statePath, "utf8")), now);
  } catch {
    return createLifeState(now);
  }
}

export async function saveLifeState(baseDir, state) {
  const statePath = getLifeStatePath(baseDir);
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, JSON.stringify(state, null, 2), "utf8");
  return state;
}

export async function pauseProactiveForToday(baseDir, now = new Date()) {
  const state = await loadLifeState(baseDir, now);
  const until = new Date(now);
  until.setHours(23, 59, 59, 999);
  state.pausedUntil = until.toISOString();
  return saveLifeState(baseDir, state);
}

export async function resetWorkSession(baseDir, now = new Date()) {
  const state = await loadLifeState(baseDir, now);
  state.sessionStartedAt = now.toISOString();
  state.lastActiveAt = now.toISOString();
  state.activeMinutes = 0;
  state.energy = Math.max(state.energy, 72);
  state.restUntil = null;
  state.viviStatus = "companion";
  return saveLifeState(baseDir, state);
}

export async function recordOwnerInteraction(baseDir, previous = null, now = new Date()) {
  const state = normalizeState(previous || await loadLifeState(baseDir, now), now);
  state.lastInteractionAt = now.toISOString();
  state.ownerStatus = "active";
  state.sessionStartedAt = state.sessionStartedAt || now.toISOString();
  state.lastActiveAt = now.toISOString();
  state.updatedAt = now.toISOString();
  return saveLifeState(baseDir, state);
}

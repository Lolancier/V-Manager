import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const STORE_VERSION = 1;
const ACTIVE_STATUSES = new Set(["scheduled", "pending_confirmation", "executing"]);
const execFileAsync = promisify(execFile);

function schedulePath(baseDir) {
  return path.join(baseDir, "agent-data", "schedules.json");
}

function normalizeStore(value) {
  return {
    version: STORE_VERSION,
    items: Array.isArray(value?.items) ? value.items : []
  };
}

export async function loadScheduleStore(baseDir) {
  try {
    return normalizeStore(JSON.parse(await fs.readFile(schedulePath(baseDir), "utf8")));
  } catch {
    return normalizeStore();
  }
}

export async function saveScheduleStore(baseDir, store) {
  const target = schedulePath(baseDir);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(normalizeStore(store), null, 2), "utf8");
  return normalizeStore(store);
}

function validFutureDate(value, now = new Date()) {
  const dueAt = new Date(value);
  if (!Number.isFinite(dueAt.getTime())) throw new Error("提醒时间无效，请提供明确的日期和时间。");
  if (dueAt.getTime() <= now.getTime()) throw new Error("计划时间必须晚于当前时间。");
  return dueAt;
}

export async function createReminder(baseDir, input, now = new Date()) {
  const dueAt = validFutureDate(input.dueAt, now);
  const message = String(input.message || input.title || "提醒事项").trim();
  if (!message) throw new Error("提醒内容不能为空。");
  const store = await loadScheduleStore(baseDir);
  const item = {
    id: randomUUID(),
    type: "reminder",
    title: String(input.title || message).trim().slice(0, 80),
    message: message.slice(0, 500),
    dueAt: dueAt.toISOString(),
    status: "scheduled",
    createdAt: now.toISOString(),
    completedAt: null
  };
  store.items.push(item);
  await saveScheduleStore(baseDir, store);
  return item;
}

export async function updateReminder(baseDir, id, input, now = new Date()) {
  const store = await loadScheduleStore(baseDir);
  const item = store.items.find((entry) => entry.id === id && entry.type === "reminder");
  if (!item || item.status !== "scheduled") throw new Error("没有找到可修改的提醒。");
  if (input.dueAt) item.dueAt = validFutureDate(input.dueAt, now).toISOString();
  if (input.message !== undefined) {
    const message = String(input.message || "").trim();
    if (!message) throw new Error("提醒内容不能为空。");
    item.message = message.slice(0, 500);
    item.title = String(input.title || message).trim().slice(0, 80);
  }
  item.updatedAt = now.toISOString();
  await saveScheduleStore(baseDir, store);
  return item;
}

export async function createPowerDraft(baseDir, input, now = new Date()) {
  const dueAt = validFutureDate(input.dueAt, now);
  const action = input.action === "restart" ? "restart" : input.action === "shutdown" ? "shutdown" : null;
  if (!action) throw new Error("电源操作只能是关机或重启。");
  const store = await loadScheduleStore(baseDir);
  for (const item of store.items) {
    if (item.type === "power" && item.status === "pending_confirmation") item.status = "cancelled";
  }
  const item = {
    id: randomUUID(),
    type: "power",
    action,
    title: action === "shutdown" ? "定时关机" : "定时重启",
    message: String(input.message || "").trim().slice(0, 300),
    dueAt: dueAt.toISOString(),
    status: "pending_confirmation",
    createdAt: now.toISOString(),
    confirmedAt: null,
    completedAt: null
  };
  store.items.push(item);
  await saveScheduleStore(baseDir, store);
  return item;
}

export async function snoozeLatestReminder(baseDir, minutes = 10, now = new Date()) {
  const store = await loadScheduleStore(baseDir);
  const source = [...store.items].reverse().find((item) => item.type === "reminder" && ["completed", "scheduled"].includes(item.status));
  if (!source) throw new Error("没有找到可以稍后提醒的事项。");
  return createReminder(baseDir, {
    title: source.title,
    message: source.message,
    dueAt: new Date(now.getTime() + Math.max(1, Number(minutes) || 10) * 60000).toISOString()
  }, now);
}

export async function confirmLatestPowerDraft(baseDir, expectedAction, now = new Date()) {
  const store = await loadScheduleStore(baseDir);
  const draft = [...store.items].reverse().find((item) => item.type === "power" && item.status === "pending_confirmation");
  if (!draft) throw new Error("当前没有等待确认的关机或重启计划。");
  if (expectedAction && draft.action !== expectedAction) throw new Error("确认内容与待确认计划不一致，请重新创建计划。");
  if (new Date(draft.dueAt) <= now) throw new Error("计划时间已经过去，请重新设置。");
  draft.status = "scheduled";
  draft.confirmedAt = now.toISOString();
  await saveScheduleStore(baseDir, store);
  return draft;
}

export async function listSchedules(baseDir, options = {}) {
  const store = await loadScheduleStore(baseDir);
  const items = options.includeHistory ? store.items : store.items.filter((item) => ACTIVE_STATUSES.has(item.status));
  return [...items].sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
}

export async function listSchedulesForDay(baseDir, day = new Date()) {
  const target = new Date(day);
  const start = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const items = await listSchedules(baseDir);
  return items.filter((item) => {
    const dueAt = new Date(item.dueAt);
    return dueAt >= start && dueAt < end;
  });
}

export async function cancelSchedule(baseDir, id) {
  const store = await loadScheduleStore(baseDir);
  const item = id
    ? store.items.find((entry) => entry.id === id)
    : [...store.items].reverse().find((entry) => ACTIVE_STATUSES.has(entry.status));
  if (!item || !ACTIVE_STATUSES.has(item.status)) throw new Error("没有找到可取消的计划。");
  const wasExecuting = item.status === "executing";
  item.status = "cancelled";
  item.completedAt = new Date().toISOString();
  await saveScheduleStore(baseDir, store);
  return { ...item, wasExecuting };
}

export async function executeWindowsPowerAction(action) {
  if (process.platform !== "win32") throw new Error("电源计划只支持 Windows。");
  const flag = action === "restart" ? "/r" : "/s";
  await execFileAsync("shutdown.exe", [flag, "/soft", "/t", "60", "/c", "V-Manager 定时电源计划：可在 60 秒内取消"], {
    windowsHide: true,
    encoding: "utf8"
  });
  return true;
}

export async function abortWindowsPowerAction() {
  if (process.platform !== "win32") throw new Error("电源计划只支持 Windows。");
  await execFileAsync("shutdown.exe", ["/a"], { windowsHide: true, encoding: "utf8" });
  return true;
}

export async function processDueSchedules(baseDir, now = new Date()) {
  const store = await loadScheduleStore(baseDir);
  const due = [];
  let changed = false;
  for (const item of store.items) {
    if (item.status !== "scheduled" || new Date(item.dueAt) > now) continue;
    const overdueMs = now.getTime() - new Date(item.dueAt).getTime();
    if (item.type === "power" && overdueMs > 120_000) {
      item.status = "missed";
      item.completedAt = now.toISOString();
      changed = true;
      continue;
    }
    item.status = item.type === "power" ? "executing" : "completed";
    item.completedAt = now.toISOString();
    due.push({ ...item });
    changed = true;
  }
  if (changed) await saveScheduleStore(baseDir, store);
  return due;
}

export async function markPowerResult(baseDir, id, ok, error = "") {
  const store = await loadScheduleStore(baseDir);
  const item = store.items.find((entry) => entry.id === id);
  if (!item) return null;
  if (item.status === "cancelled") return item;
  item.status = ok ? "completed" : "failed";
  item.error = error || undefined;
  item.completedAt = new Date().toISOString();
  await saveScheduleStore(baseDir, store);
  return item;
}

export async function updateScheduleIntegration(baseDir, id, patch) {
  const store = await loadScheduleStore(baseDir);
  const item = store.items.find((entry) => entry.id === id);
  if (!item) return null;
  item.integration = { ...(item.integration || {}), ...(patch || {}), updatedAt: new Date().toISOString() };
  await saveScheduleStore(baseDir, store);
  return item;
}

function parseChineseAmount(value) {
  if (value === "半") return 0.5;
  if (/^\d+(?:\.\d+)?$/.test(value)) return Number(value);
  const digits = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (value === "十") return 10;
  if (value.includes("十")) {
    const [tens, ones] = value.split("十");
    return (tens ? digits[tens] : 1) * 10 + (ones ? digits[ones] : 0);
  }
  return digits[value];
}

export function parseNaturalSchedule(message, now = new Date()) {
  const rawText = String(message || "").trim();
  const chineseHours = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12 };
  const text = rawText.replace(/(十二|十一|十|[一二两三四五六七八九])(?=\s*[点时])/g, (value) => String(chineseHours[value]));
  let dueAt = null;
  const relative = text.match(/(\d+(?:\.\d+)?|半|[一二两三四五六七八九十]+)\s*(?:个)?(分钟|小时)后/);
  if (relative) {
    const amount = parseChineseAmount(relative[1]);
    dueAt = new Date(now.getTime() + amount * (relative[2] === "小时" ? 3600000 : 60000));
  }

  if (!dueAt) {
    const explicitDate = text.match(/(?:(\d{4})\s*[年/-]\s*)?(\d{1,2})\s*[月/-]\s*(\d{1,2})\s*日?/);
    const clock = text.match(/(今天|明天|今晚)?\s*(凌晨|早上|上午|中午|下午|晚上)?\s*(\d{1,2})\s*(?:[:：点时]\s*(\d{1,2})?)\s*(?:分)?/);
    if (clock) {
      const dayWord = clock[1] || "";
      const period = clock[2] || "";
      let hour = Number(clock[3]);
      const halfHour = /点\s*半/.test(text.slice(clock.index, clock.index + clock[0].length + 2));
      const minute = halfHour ? 30 : Number(clock[4] || 0);
      dueAt = new Date(now);
      dueAt.setSeconds(0, 0);
      if (explicitDate) {
        const year = Number(explicitDate[1] || now.getFullYear());
        const month = Number(explicitDate[2]);
        const day = Number(explicitDate[3]);
        dueAt.setFullYear(year, month - 1, day);
        if (dueAt.getFullYear() !== year || dueAt.getMonth() !== month - 1 || dueAt.getDate() !== day) return null;
      } else if (dayWord === "明天") {
        dueAt.setDate(dueAt.getDate() + 1);
      }
      if (["下午", "晚上"].includes(period) && hour < 12) hour += 12;
      if (period === "中午" && hour < 11) hour += 12;
      if ((dayWord === "今晚" || period === "晚上") && hour === 12) {
        hour = 0;
        dueAt.setDate(dueAt.getDate() + 1);
      }
      dueAt.setHours(hour, minute, 0, 0);
      if (explicitDate && !explicitDate[1] && dueAt <= now) dueAt.setFullYear(dueAt.getFullYear() + 1);
      if (!explicitDate && !dayWord && dueAt <= now) dueAt.setDate(dueAt.getDate() + 1);
    }
  }

  if (!dueAt) return null;
  const action = /重启/.test(text) ? "restart" : /关机/.test(text) ? "shutdown" : null;
  if (action) return { type: "power", action, dueAt: dueAt.toISOString() };
  const reminderMatch = text.match(/(?:提醒我|叫我)\s*(.*?)(?:[。！!]|$)/);
  if (/提醒|叫我/.test(text)) return { type: "reminder", dueAt: dueAt.toISOString(), message: reminderMatch?.[1]?.trim() || "时间到了" };
  return null;
}

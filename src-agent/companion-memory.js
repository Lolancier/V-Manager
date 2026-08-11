import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const VERSION = 1;
const CATEGORIES = ["facts", "episodes", "habits", "commitments"];

function storePath(baseDir) { return path.join(baseDir, "agent-data", "companion-memory.json"); }
function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function emptyStore() {
  return {
    version: VERSION, facts: [], episodes: [], habits: [], commitments: [],
    feedback: { ignored: 0, later: 0, liked: 0, interruptionScore: 0.1, lastFeedbackAt: null },
    recentExpressions: [], updatedAt: null
  };
}
function normalize(raw) {
  const fallback = emptyStore();
  return {
    ...fallback, ...(raw || {}), version: VERSION,
    ...Object.fromEntries(CATEGORIES.map((key) => [key, Array.isArray(raw?.[key]) ? raw[key].slice(-100) : []])),
    feedback: { ...fallback.feedback, ...(raw?.feedback || {}) },
    recentExpressions: Array.isArray(raw?.recentExpressions) ? raw.recentExpressions.slice(-20) : []
  };
}
export async function loadCompanionMemory(baseDir) {
  try { return normalize(JSON.parse(await fs.readFile(storePath(baseDir), "utf8"))); }
  catch { return emptyStore(); }
}
export async function clearCompanionMemory(baseDir) {
  const target = storePath(baseDir);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const store = emptyStore();
  await fs.writeFile(target, JSON.stringify(store, null, 2), "utf8");
  return store;
}
async function save(baseDir, store) {
  const target = storePath(baseDir);
  await fs.mkdir(path.dirname(target), { recursive: true });
  store.updatedAt = new Date().toISOString();
  await fs.writeFile(target, JSON.stringify(normalize(store), null, 2), "utf8");
  return store;
}
function clean(value) { return String(value || "").trim().replace(/[。！!？?]+$/, "").slice(0, 240); }
function addUnique(store, category, content, now) {
  const value = clean(content);
  if (value.length < 2) return null;
  const existing = store[category].find((item) => item.content === value && item.status !== "resolved");
  if (existing) { existing.lastSeenAt = now.toISOString(); existing.mentions = (existing.mentions || 1) + 1; return existing; }
  const item = { id: randomUUID(), category, content: value, createdAt: now.toISOString(), lastSeenAt: now.toISOString(), mentions: 1 };
  if (category === "commitments") Object.assign(item, { status: "open", lastFollowUpDate: null, resolvedAt: null });
  store[category].push(item);
  return item;
}

export function extractMemoryCandidates(message) {
  const text = clean(message);
  const result = [];
  const patterns = [
    ["facts", /(?:我叫|我的名字是|我是)([^，。！？]{2,40})/],
    ["habits", /(?:我习惯|我通常|我一般|我每天|我经常)([^，。！？]{2,80})/],
    ["commitments", /(?:我要|我会|我得|我打算|我准备|我答应)([^，。！？]{2,100})/],
    ["episodes", /(?:今天|昨天|刚才|最近)([^，。！？]{2,120})/]
  ];
  for (const [category, regex] of patterns) {
    const match = text.match(regex);
    if (match?.[1]) result.push({ category, content: match[1].trim() });
  }
  return result;
}

export async function recordConversationMemory(baseDir, message, now = new Date()) {
  const store = await loadCompanionMemory(baseDir);
  const added = extractMemoryCandidates(message).map((item) => addUnique(store, item.category, item.content, now)).filter(Boolean);
  if (/已经|完成了|交了|做完了/.test(message)) {
    const replyText = clean(message);
    const open = [...store.commitments].reverse().find((item) => {
      if (item.status !== "open") return false;
      const content = clean(item.content);
      const bigrams = Array.from({ length: Math.max(0, content.length - 1) }, (_, index) => content.slice(index, index + 2));
      return bigrams.some((part) => replyText.includes(part));
    });
    if (open) { open.status = "resolved"; open.resolvedAt = now.toISOString(); }
  }
  if (added.length || /已经|完成了|交了|做完了/.test(message)) await save(baseDir, store);
  return { store, added };
}

export function detectProactiveFeedback(message) {
  const text = clean(message);
  if (/别再?提醒|不用提醒|别打扰|忽略(?:这个|这次)?/.test(text)) return "ignored";
  if (/稍后|等会|晚点|过一会/.test(text)) return "later";
  if (/喜欢.{0,8}提醒|这样提醒.{0,8}(?:好|不错)|谢谢提醒/.test(text)) return "liked";
  return null;
}

export async function recordProactiveFeedback(baseDir, kind, now = new Date()) {
  if (!["ignored", "later", "liked"].includes(kind)) return loadCompanionMemory(baseDir);
  const store = await loadCompanionMemory(baseDir);
  store.feedback[kind] += 1;
  const delta = kind === "ignored" ? 0.18 : kind === "later" ? 0.07 : -0.14;
  store.feedback.interruptionScore = Math.max(0, Math.min(1, Number(store.feedback.interruptionScore ?? 0.1) + delta));
  store.feedback.lastFeedbackAt = now.toISOString();
  return save(baseDir, store);
}

export async function getFollowUpCandidate(baseDir, now = new Date()) {
  const store = await loadCompanionMemory(baseDir);
  const today = dateKey(now);
  const candidate = store.commitments.find((item) =>
    item.status === "open" && dateKey(new Date(item.createdAt)) < today && item.lastFollowUpDate !== today
  );
  return { store, candidate };
}

export async function markCommitmentFollowedUp(baseDir, id, now = new Date()) {
  const store = await loadCompanionMemory(baseDir);
  const item = store.commitments.find((entry) => entry.id === id);
  if (item) { item.lastFollowUpDate = dateKey(now); await save(baseDir, store); }
  return item;
}

export function buildCompanionMemoryPrompt(store) {
  const sections = [
    ["事实", store.facts], ["近期经历", store.episodes], ["习惯", store.habits], ["未完成承诺", store.commitments.filter((item) => item.status === "open")]
  ].map(([label, items]) => `${label}：${items.slice(-5).map((item) => item.content).join("；") || "暂无"}`);
  return `本地陪伴记忆（只在相关时自然使用，不要逐条复述）：\n${sections.join("\n")}\n打扰倾向分数：${Number(store.feedback.interruptionScore || 0).toFixed(2)}。表达应结合时间、关系和近期经历，避免固定台词与连续重复。`;
}

import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { estimateTokens, truncateToTokenBudget } from "./token-budget.js";

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
  const push = (category, content) => {
    const value = clean(content)
      .replace(/^(?:把|将|请|麻烦|帮我|你要|你得|你可以)\s*/u, "")
      .replace(/(?:记住|记下来|记录下来|写入|写进|存进|加入)(?:到|进)?(?:长期)?记忆(?:里|中)?$/u, "")
      .trim();
    if (value.length >= 2 && !result.some((item) => item.category === category && item.content === value)) {
      result.push({ category, content: value });
    }
  };
  const patterns = [
    ["facts", /(?:我叫|我的名字是|我是)([^，。！？]{2,40})/],
    ["habits", /(?:我习惯|我通常|我一般|我每天|我经常|我喜欢|我偏好|我不喜欢)([^，。！？]{2,80})/],
    ["commitments", /(?:我要|我会|我得|我打算|我准备|我答应)([^，。！？]{2,100})/],
    ["episodes", /(?:今天|昨天|刚才|最近)([^，。！？]{2,120})/]
  ];
  for (const [category, regex] of patterns) {
    if (category === "commitments" && /(?:提醒我|叫我|通知我)/.test(text)) continue;
    const match = text.match(regex);
    if (match?.[1]) push(category, match[1]);
  }
  const explicitHabit = text.match(/(?:把|将)?\s*(.{2,100}?)\s*(?:记到|写进|存进|加入)(?:我的)?(?:长期记忆里的)?(?:习惯|偏好|梗点)(?:里|中)?/u);
  if (explicitHabit?.[1]) push("habits", explicitHabit[1]);
  const explicitMemory = text.match(/(?:请|麻烦|你要|你得|帮我)?\s*(?:记住|记下来|记录下来|写入长期记忆)\s*[：:，,]?\s*(.{2,120})/u);
  if (explicitMemory?.[1]) {
    const content = explicitMemory[1].replace(/(?:可以吗|好吗|行吗|别忘了)$/u, "").trim();
    push(/(?:习惯|偏好|喜欢|不喜欢|口味|梗|口癖)/.test(content) ? "habits" : "facts", content);
  }
  return result;
}

function overlapScore(left, right) {
  const a = clean(left).replace(/\s+/g, "");
  const b = clean(right).replace(/\s+/g, "");
  if (!a || !b) return 0;
  if (a.includes(b) || b.includes(a)) return 1;
  const parts = new Set(Array.from({ length: Math.max(0, a.length - 1) }, (_, index) => a.slice(index, index + 2)));
  if (!parts.size) return 0;
  return [...parts].filter((part) => b.includes(part)).length / parts.size;
}

export async function resolveCommitmentsByText(baseDir, text, now = new Date()) {
  const store = await loadCompanionMemory(baseDir);
  const matches = store.commitments.filter((item) => item.status === "open" && overlapScore(item.content, text) >= 0.3);
  for (const item of matches) {
    item.status = "resolved";
    item.resolvedAt = now.toISOString();
    item.resolution = "related_reminder_completed";
  }
  if (matches.length) await save(baseDir, store);
  return { store, resolved: matches };
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

function relevanceScore(item, query, category) {
  const content = clean(item.content).toLocaleLowerCase();
  const normalizedQuery = clean(query).toLocaleLowerCase();
  let score = Math.min(4, Number(item.mentions || 1) * 0.35);
  if (category === "commitments") score += 8;
  if (category === "facts" || category === "habits") score += 1.5;
  if (normalizedQuery && (content.includes(normalizedQuery) || normalizedQuery.includes(content))) score += 10;
  const queryParts = new Set([
    ...normalizedQuery.split(/[\s，。！？、,:：；;]+/).filter((part) => part.length >= 2),
    ...Array.from({ length: Math.max(0, normalizedQuery.length - 1) }, (_, index) => normalizedQuery.slice(index, index + 2))
  ]);
  for (const part of queryParts) if (content.includes(part)) score += part.length >= 3 ? 2 : 0.7;
  const ageDays = Math.max(0, (Date.now() - Date.parse(item.lastSeenAt || item.createdAt || 0)) / 86400000);
  score += Math.max(0, 2 - ageDays / 30);
  return score;
}

export function selectCompanionMemories(store, query = "", options = {}) {
  const budget = Math.max(160, Math.min(4000, Number(options.tokenBudget) || 1000));
  const sources = [
    ["commitments", store.commitments.filter((item) => item.status === "open")],
    ["facts", store.facts], ["habits", store.habits], ["episodes", store.episodes]
  ];
  const candidates = sources.flatMap(([category, items]) => items.map((item) => ({ ...item, category, score: relevanceScore(item, query, category) })));
  const pinned = candidates
    .filter((item) => item.category === "commitments")
    .sort((a, b) => Date.parse(b.lastSeenAt || b.createdAt || 0) - Date.parse(a.lastSeenAt || a.createdAt || 0))
    .slice(0, 6);
  const core = candidates
    .filter((item) => ["facts", "habits"].includes(item.category))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
  const ranked = [...pinned, ...core, ...candidates.sort((a, b) => b.score - a.score)];
  const selected = [];
  const seen = new Set();
  let used = 40;
  for (const item of ranked) {
    if (seen.has(item.id) || used >= budget) continue;
    const available = budget - used - 8;
    if (available < 16) break;
    const content = truncateToTokenBudget(item.content, available);
    selected.push({ ...item, content });
    seen.add(item.id);
    used += 8 + estimateTokens(content);
  }
  return { items: selected, estimatedTokens: used, budget };
}

export function buildCompanionMemoryPrompt(store, query = "", options = {}) {
  const selection = selectCompanionMemories(store, query, options);
  const labels = { facts: "事实", episodes: "近期经历", habits: "习惯/偏好", commitments: "未完成承诺" };
  const sections = Object.entries(labels).map(([category, label]) => {
    const items = selection.items.filter((item) => item.category === category);
    return `${label}：${items.map((item) => item.content).join("；") || "本轮无相关内容"}`;
  });
  return {
    prompt: `本地陪伴记忆（仅在相关时自然使用，不要逐条复述）：\n${sections.join("\n")}\n打扰倾向分数：${Number(store.feedback.interruptionScore || 0).toFixed(2)}。避免固定台词与连续重复。`,
    selection
  };
}

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  detectProactiveFeedback,
  extractMemoryCandidates,
  getFollowUpCandidate,
  loadCompanionMemory,
  markCommitmentFollowedUp,
  resolveCommitmentsByText,
  selectCompanionMemories,
  recordConversationMemory,
  recordProactiveFeedback
} from "../src-agent/companion-memory.js";

test("conversation memory separates facts, episodes, habits and commitments", () => {
  assert.equal(extractMemoryCandidates("我叫小桥")[0].category, "facts");
  assert.equal(extractMemoryCandidates("我每天晚上写日报")[0].category, "habits");
  assert.equal(extractMemoryCandidates("昨天完成了项目评审")[0].category, "episodes");
  assert.equal(extractMemoryCandidates("我要提交测试报告")[0].category, "commitments");
});

test("explicit remember requests record preferences and reminders do not become commitments", () => {
  assert.deepEqual(extractMemoryCandidates("把 bsy=dog 记到习惯里"), [{ category: "habits", content: "bsy=dog" }]);
  assert.equal(extractMemoryCandidates("记住：我偏好文字小游戏").some((item) => item.category === "habits"), true);
  assert.equal(extractMemoryCandidates("我要你14号提醒我吃药").some((item) => item.category === "commitments"), false);
});

test("a completed reminder resolves a semantically related commitment", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vivi-memory-reminder-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await recordConversationMemory(root, "我要按时吃药", new Date("2026-08-13T10:00:00+08:00"));
  const result = await resolveCommitmentsByText(root, "提醒我吃药", new Date("2026-08-14T10:00:00+08:00"));
  assert.equal(result.resolved.length, 1);
  assert.equal(result.store.commitments[0].status, "resolved");
});

test("proactive feedback learns a bounded interruption score", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vivi-memory-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  assert.equal(detectProactiveFeedback("稍后再提醒我"), "later");
  assert.equal(detectProactiveFeedback("我喜欢这样的提醒"), "liked");
  await recordProactiveFeedback(root, "ignored");
  await recordProactiveFeedback(root, "liked");
  const store = await loadCompanionMemory(root);
  assert.equal(store.feedback.ignored, 1);
  assert.equal(store.feedback.liked, 1);
  assert.ok(store.feedback.interruptionScore >= 0 && store.feedback.interruptionScore <= 1);
});

test("an open commitment becomes a once-per-day follow-up candidate", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vivi-memory-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const yesterday = new Date("2026-08-07T10:00:00+08:00");
  await recordConversationMemory(root, "我要提交测试报告", yesterday);
  const first = await getFollowUpCandidate(root, new Date("2026-08-08T10:00:00+08:00"));
  assert.equal(first.candidate.content, "提交测试报告");
  await markCommitmentFollowedUp(root, first.candidate.id, new Date("2026-08-08T10:00:00+08:00"));
  const second = await getFollowUpCandidate(root, new Date("2026-08-08T12:00:00+08:00"));
  assert.equal(second.candidate, undefined);
});

test("memory selection keeps commitments and relevant preferences inside a hard budget", () => {
  const now = new Date().toISOString();
  const store = {
    facts: Array.from({ length: 20 }, (_, index) => ({ id: `f-${index}`, content: `无关事实 ${index} ${"很长".repeat(20)}`, mentions: 1, createdAt: now, lastSeenAt: now })),
    habits: [{ id: "habit-game", content: "主人偏好低操作难度的文字游戏", mentions: 4, createdAt: now, lastSeenAt: now }],
    episodes: [],
    commitments: [{ id: "commit-med", content: "提醒主人按时吃药", status: "open", mentions: 1, createdAt: now, lastSeenAt: now }]
  };
  const selected = selectCompanionMemories(store, "想玩什么游戏", { tokenBudget: 220 });
  assert.ok(selected.estimatedTokens <= selected.budget);
  assert.equal(selected.items.some((item) => item.id === "commit-med"), true);
  assert.equal(selected.items.some((item) => item.id === "habit-game"), true);
  assert.ok(selected.items.length < 22);
});

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
  recordConversationMemory,
  recordProactiveFeedback
} from "../src-agent/companion-memory.js";

test("conversation memory separates facts, episodes, habits and commitments", () => {
  assert.equal(extractMemoryCandidates("我叫小桥")[0].category, "facts");
  assert.equal(extractMemoryCandidates("我每天晚上写日报")[0].category, "habits");
  assert.equal(extractMemoryCandidates("昨天完成了项目评审")[0].category, "episodes");
  assert.equal(extractMemoryCandidates("我要提交测试报告")[0].category, "commitments");
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

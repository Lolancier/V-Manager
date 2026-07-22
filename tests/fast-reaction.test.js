import assert from "node:assert/strict";
import test from "node:test";
import { classifyFastReaction } from "../src-agent/fast-reaction.js";

test("fast reaction recognizes affection before generic positive language", () => {
  const reaction = classifyFastReaction("今天也最喜欢你了");
  assert.equal(reaction.kind, "affection");
  assert.equal(reaction.mood, "blush");
  assert.ok(reaction.durationMs < 1500);
});

test("fast reaction uses a concerned response for distress", () => {
  const reaction = classifyFastReaction("今天压力好大，有点难过");
  assert.equal(reaction.kind, "concern");
  assert.equal(reaction.mood, "sad");
});

test("fast reaction falls back to a subtle attention cue", () => {
  const reaction = classifyFastReaction("我刚刚整理了桌面");
  assert.equal(reaction.kind, "attention");
  assert.equal(reaction.mood, "thinking");
  assert.ok(reaction.intensity < 0.5);
});

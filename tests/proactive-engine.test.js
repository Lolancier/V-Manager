import test from "node:test";
import assert from "node:assert/strict";
import { createLifeState, evaluateLifeTick, isInQuietHours } from "../src-agent/proactive-engine.js";

const baseConfig = {
  enabled: true,
  socialCheckins: true,
  healthReminders: true,
  lateNightCare: true,
  workMinutes: 60,
  reminderCooldownMinutes: 90,
  minimumIntervalMinutes: 120,
  dailyLimit: 4,
  idleResetMinutes: 10,
  viviRestAfterMinutes: 120,
  lateNightHour: 23,
  quietStart: "00:00",
  quietEnd: "08:00"
};

test("quiet hours support a range that crosses midnight", () => {
  assert.equal(isInQuietHours(new Date("2026-08-08T01:00:00"), "23:30", "08:00"), true);
  assert.equal(isInQuietHours(new Date("2026-08-08T12:00:00"), "23:30", "08:00"), false);
});

test("continuous work produces one break reminder and respects cooldown", () => {
  const startedAt = new Date("2026-08-08T09:00:00");
  const state = createLifeState(startedAt);
  const first = evaluateLifeTick(state, baseConfig, { now: new Date("2026-08-08T10:05:00"), idleSeconds: 0 });
  assert.equal(first.events.some((event) => event.kind === "work_break"), true);

  const second = evaluateLifeTick(first.state, baseConfig, { now: new Date("2026-08-08T10:20:00"), idleSeconds: 0 });
  assert.equal(second.events.some((event) => event.kind === "work_break"), false);
});

test("quiet time and daily pause suppress proactive messages", () => {
  const state = createLifeState(new Date("2026-08-08T00:10:00"));
  state.sessionStartedAt = "2026-08-07T22:00:00.000Z";
  const quiet = evaluateLifeTick(state, baseConfig, { now: new Date("2026-08-08T01:10:00"), idleSeconds: 0 });
  assert.equal(quiet.events.length, 0);

  quiet.state.pausedUntil = "2026-08-08T23:59:59.999Z";
  const paused = evaluateLifeTick(quiet.state, baseConfig, { now: new Date("2026-08-08T10:00:00"), idleSeconds: 0 });
  assert.equal(paused.events.length, 0);
});

test("being away resets the work session and lets Vivi rest", () => {
  const state = createLifeState(new Date("2026-08-08T09:00:00"));
  const result = evaluateLifeTick(state, baseConfig, { now: new Date("2026-08-08T11:00:00"), idleSeconds: 700 });
  assert.equal(result.state.ownerStatus, "away");
  assert.equal(result.state.viviStatus, "resting");
  assert.equal(result.state.activeMinutes, 0);
  assert.equal(result.events.length, 0);
});

test("high interruption feedback suppresses proactive messages", () => {
  const state = createLifeState(new Date("2026-08-08T09:00:00"));
  const result = evaluateLifeTick(state, baseConfig, {
    now: new Date("2026-08-08T11:00:00"), idleSeconds: 0, interruptionScore: 0.95
  });
  assert.equal(result.events.length, 0);
});

test("an earlier commitment produces a varied follow-up event", () => {
  const state = createLifeState(new Date("2026-08-08T09:00:00"));
  const result = evaluateLifeTick(state, { ...baseConfig, workMinutes: 240, viviRestAfterMinutes: 360 }, {
    now: new Date("2026-08-08T10:00:00"), idleSeconds: 0, interruptionScore: 0.1,
    followUpCandidate: { id: "commitment-1", content: "提交测试报告" }
  });
  const followUp = result.events.find((event) => event.kind === "commitment_followup");
  assert.match(followUp.message, /提交测试报告/);
});

test("social check-ins use a minimum time interval instead of a daily count", () => {
  const state = createLifeState(new Date("2026-08-08T09:00:00"));
  const config = { ...baseConfig, workMinutes: 240, viviRestAfterMinutes: 360, minimumIntervalMinutes: 60 };
  const first = evaluateLifeTick(state, config, { now: new Date("2026-08-08T10:01:00"), idleSeconds: 0, interruptionScore: 0.1 });
  assert.equal(first.events.some((event) => event.kind === "social_checkin"), true);

  const tooSoon = evaluateLifeTick(first.state, config, { now: new Date("2026-08-08T10:45:00"), idleSeconds: 0, interruptionScore: 0.1 });
  assert.equal(tooSoon.events.length, 0);

  const later = evaluateLifeTick(tooSoon.state, config, { now: new Date("2026-08-08T11:02:00"), idleSeconds: 0, interruptionScore: 0.1 });
  assert.equal(later.events.some((event) => event.kind === "social_checkin"), true);
});

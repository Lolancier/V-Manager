import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  cancelSchedule,
  claimReminderDelivery,
  confirmLatestPowerDraft,
  createPowerDraft,
  createReminder,
  listPendingReminderDeliveries,
  listSchedulesForDay,
  listSchedules,
  parseNaturalSchedule,
  processDueSchedules,
  markReminderDelivered,
  releaseReminderDelivery,
  saveScheduleStore,
  updateReminder
} from "../src-agent/schedule-engine.js";
import { executeTool } from "../src-agent/tool-executor.js";
import { resolveAgentRoute } from "../src-agent/router.js";
import { handle as handleScheduleMessage } from "../src-agent/executors/schedule-executor.js";

test("natural language parser handles relative reminders", () => {
  const now = new Date("2026-08-08T10:00:00+08:00");
  const parsed = parseNaturalSchedule("30分钟后提醒我喝水", now);
  assert.equal(parsed.type, "reminder");
  assert.equal(parsed.message, "喝水");
  assert.equal(new Date(parsed.dueAt).getTime() - now.getTime(), 30 * 60 * 1000);
});

test("natural language parser handles Chinese durations and generic wake-up wording", () => {
  const now = new Date("2026-08-08T10:00:00+08:00");
  const chinese = parseNaturalSchedule("两分钟后提醒我测试 Windows 后台提醒", now);
  assert.equal(chinese.type, "reminder");
  assert.equal(chinese.message, "测试 Windows 后台提醒");
  assert.equal(new Date(chinese.dueAt).getTime() - now.getTime(), 2 * 60 * 1000);

  const generic = parseNaturalSchedule("2分钟后叫我", now);
  assert.equal(generic.type, "reminder");
  assert.equal(generic.message, "时间到了");
});

test("natural language parser handles long-term explicit calendar dates", () => {
  const now = new Date("2026-08-08T10:00:00+08:00");
  const chinese = parseNaturalSchedule("8月20日下午3点提醒我复诊", now);
  assert.equal(chinese.type, "reminder");
  assert.equal(chinese.message, "复诊");
  assert.equal(new Date(chinese.dueAt).getFullYear(), 2026);
  assert.equal(new Date(chinese.dueAt).getMonth(), 7);
  assert.equal(new Date(chinese.dueAt).getDate(), 20);
  assert.equal(new Date(chinese.dueAt).getHours(), 15);

  const numeric = parseNaturalSchedule("2026-12-31 晚上8点提醒我写年度总结", now);
  assert.equal(new Date(numeric.dueAt).getFullYear(), 2026);
  assert.equal(new Date(numeric.dueAt).getMonth(), 11);
  assert.equal(new Date(numeric.dueAt).getDate(), 31);
  assert.equal(new Date(numeric.dueAt).getHours(), 20);
});

test("tonight at twelve becomes next midnight power action", () => {
  const now = new Date("2026-08-08T20:00:00+08:00");
  const parsed = parseNaturalSchedule("今晚 12 点关机", now);
  assert.equal(parsed.type, "power");
  assert.equal(parsed.action, "shutdown");
  assert.equal(new Date(parsed.dueAt).getHours(), 0);
  assert.equal(new Date(parsed.dueAt).getDate(), 9);
});

test("power plan stays pending until explicit confirmation", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "v-manager-schedule-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const now = new Date("2026-08-08T10:00:00+08:00");
  const draft = await createPowerDraft(root, { action: "restart", dueAt: "2026-08-08T12:00:00+08:00" }, now);
  assert.equal(draft.status, "pending_confirmation");
  assert.equal((await listSchedules(root))[0].status, "pending_confirmation");

  await assert.rejects(() => confirmLatestPowerDraft(root, "shutdown", now), /不一致/);
  const confirmed = await confirmLatestPowerDraft(root, "restart", now);
  assert.equal(confirmed.status, "scheduled");
});

test("due reminders complete while stale power actions are only marked missed", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "v-manager-schedule-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const createdAt = new Date("2026-08-08T09:00:00+08:00");
  const reminder = await createReminder(root, { dueAt: "2026-08-08T09:10:00+08:00", message: "开会" }, createdAt);
  await createPowerDraft(root, { action: "shutdown", dueAt: "2026-08-08T09:10:00+08:00" }, createdAt);
  await confirmLatestPowerDraft(root, "shutdown", createdAt);

  const due = await processDueSchedules(root, new Date("2026-08-08T09:20:00+08:00"));
  assert.deepEqual(due.map((item) => item.id), [reminder.id]);
  assert.equal(due[0].delivery.status, "pending");
  assert.equal((await listSchedules(root, { includeHistory: true })).find((item) => item.type === "power").status, "missed");
});

test("a scheduled item can be cancelled by id", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "v-manager-schedule-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const now = new Date("2026-08-08T10:00:00+08:00");
  const reminder = await createReminder(root, { dueAt: "2026-08-08T11:00:00+08:00", message: "休息" }, now);
  const cancelled = await cancelSchedule(root, reminder.id);
  assert.equal(cancelled.status, "cancelled");
  assert.equal((await listSchedules(root)).length, 0);
});

test("reminder delivery uses a persistent claim lease and delivered marker", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "v-manager-delivery-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const createdAt = new Date("2026-08-08T09:00:00.000Z");
  const dueAt = new Date("2026-08-08T09:01:00.000Z");
  const reminder = await createReminder(root, { dueAt: dueAt.toISOString(), message: "delivery" }, createdAt);
  await processDueSchedules(root, dueAt);
  assert.deepEqual((await listPendingReminderDeliveries(root, dueAt)).map((item) => item.id), [reminder.id]);
  assert.ok(await claimReminderDelivery(root, reminder.id, dueAt));
  assert.equal((await listPendingReminderDeliveries(root, new Date(dueAt.getTime() + 30_000))).length, 0);
  assert.equal((await listPendingReminderDeliveries(root, new Date(dueAt.getTime() + 60_001))).length, 1);
  await releaseReminderDelivery(root, reminder.id, "retry", new Date(dueAt.getTime() + 60_001));
  assert.equal((await listPendingReminderDeliveries(root, new Date(dueAt.getTime() + 60_001))).length, 1);
  await claimReminderDelivery(root, reminder.id, new Date(dueAt.getTime() + 60_001));
  await markReminderDelivered(root, reminder.id, new Date(dueAt.getTime() + 60_002));
  assert.equal((await listPendingReminderDeliveries(root, new Date(dueAt.getTime() + 120_000))).length, 0);
});

test("legacy completed reminders without delivery metadata are not replayed", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "v-manager-delivery-legacy-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await saveScheduleStore(root, { items: [{
    id: "legacy", type: "reminder", status: "completed", title: "old", message: "old",
    dueAt: "2026-01-01T00:00:00.000Z", completedAt: "2026-01-01T00:00:00.000Z"
  }] });
  assert.deepEqual(await listPendingReminderDeliveries(root, new Date("2026-08-16T00:00:00.000Z")), []);
});

test("an executing power action is only persisted as cancelled after abort succeeds", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "v-manager-schedule-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const createdAt = new Date("2026-08-08T09:00:00+08:00");
  const draft = await createPowerDraft(root, { action: "shutdown", dueAt: "2026-08-08T09:01:00+08:00" }, createdAt);
  await confirmLatestPowerDraft(root, "shutdown", createdAt);
  await processDueSchedules(root, new Date("2026-08-08T09:01:00+08:00"));

  await assert.rejects(() => cancelSchedule(root, draft.id, new Date(), {
    beforeCancel: async () => { throw new Error("abort failed"); }
  }), /abort failed/);
  assert.equal((await listSchedules(root, { includeHistory: true }))[0].status, "executing");

  let aborted = 0;
  const cancelled = await cancelSchedule(root, draft.id, new Date("2026-08-08T09:02:00+08:00"), {
    beforeCancel: async () => { aborted += 1; }
  });
  assert.equal(aborted, 1);
  assert.equal(cancelled.status, "cancelled");
});

test("concurrent schedule writes for one base directory do not overwrite each other", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "v-manager-schedule-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const now = new Date("2026-08-08T09:00:00+08:00");
  await Promise.all(Array.from({ length: 12 }, (_, index) => createReminder(root, {
    dueAt: new Date(now.getTime() + (index + 1) * 60_000).toISOString(),
    message: `reminder-${index}`
  }, now)));
  const items = await listSchedules(root);
  assert.equal(items.length, 12);
  assert.deepEqual(new Set(items.map((item) => item.message)), new Set(Array.from({ length: 12 }, (_, index) => `reminder-${index}`)));
});

test("a reminder can be rescheduled without losing its integration identity", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "v-manager-schedule-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const now = new Date("2026-08-08T10:00:00+08:00");
  const reminder = await createReminder(root, { dueAt: "2026-08-08T11:00:00+08:00", message: "休息" }, now);
  const updated = await updateReminder(root, reminder.id, {
    dueAt: "2026-08-08T12:30:00+08:00",
    message: "吃午饭"
  }, now);
  assert.equal(updated.id, reminder.id);
  assert.equal(updated.message, "吃午饭");
  assert.equal(updated.dueAt, "2026-08-08T04:30:00.000Z");
});

test("the local agenda survives reload and can list one calendar day", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "v-manager-agenda-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const now = new Date("2026-08-08T08:00:00+08:00");
  const today = await createReminder(root, { dueAt: "2026-08-08T15:00:00+08:00", message: "复诊" }, now);
  await createReminder(root, { dueAt: "2026-08-09T15:00:00+08:00", message: "明天的事" }, now);
  const reloaded = await listSchedulesForDay(root, new Date("2026-08-08T12:00:00+08:00"));
  assert.deepEqual(reloaded.map((item) => item.id), [today.id]);
});

test("local schedule language modifies the latest reminder instead of creating another", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "v-manager-schedule-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const reminder = await createReminder(root, { dueAt: new Date(Date.now() + 2 * 3600000).toISOString(), message: "喝水" });
  const result = await handleScheduleMessage("把提醒改到30分钟后", { baseDir: root });
  const active = await listSchedules(root);
  assert.equal(result.meta.localTool, "reminder_update");
  assert.equal(active.length, 1);
  assert.equal(active[0].id, reminder.id);
  assert.equal(active[0].message, "喝水");
  assert.ok(new Date(active[0].dueAt).getTime() < Date.now() + 35 * 60000);
});

test("schedule language uses the schedule route", () => {
  assert.equal(resolveAgentRoute("明天下午三点提醒我开会").type, "schedule");
  assert.equal(resolveAgentRoute("确认定时关机").type, "schedule");
  assert.equal(resolveAgentRoute("今天有什么安排").type, "schedule");
  assert.equal(resolveAgentRoute("整理一下待办").type, "schedule");
});

test("organizing todos reads the real local schedule instead of inventing a chat list", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "v-manager-schedule-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await createReminder(root, { dueAt: new Date(Date.now() + 3600000).toISOString(), message: "整理项目说明" });
  const result = await handleScheduleMessage("整理一下待办", { baseDir: root });
  assert.equal(result.meta.localTool, "schedule_list");
  assert.match(result.reply, /整理项目说明/);
});

test("power confirmation tool rejects a generic confirmation", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "v-manager-schedule-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await createPowerDraft(root, { action: "shutdown", dueAt: new Date(Date.now() + 3600000).toISOString() });
  const rejected = await executeTool("confirm_power_action", { action: "shutdown" }, { baseDir: root, currentUserMessage: "确认" });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.requiresConfirmation, true);

  const accepted = await executeTool("confirm_power_action", { action: "shutdown" }, { baseDir: root, currentUserMessage: "确认定时关机" });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.item.status, "scheduled");
});

test("schedule update reports Windows synchronization failure without claiming success", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "v-manager-schedule-sync-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await createReminder(root, { dueAt: new Date(Date.now() + 2 * 3600000).toISOString(), message: "喝水" });
  const result = await handleScheduleMessage("把提醒改到30分钟后", {
    baseDir: root,
    scheduleClient: { afterMutation: async () => ({ integrationResults: [{ ok: false, error: "offline" }] }) }
  });
  assert.match(result.reply, /Windows 后台任务同步失败/);
  assert.doesNotMatch(result.reply, /已一并更新/);
});

test("natural-language and model-tool cancellation both preserve executing power state when abort fails", async (t) => {
  for (const route of ["language", "tool"]) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), `v-manager-schedule-${route}-`));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const createdAt = new Date(Date.now() - 60_000);
    const draft = await createPowerDraft(root, { action: "shutdown", dueAt: new Date(Date.now() - 1_000).toISOString() }, createdAt);
    await confirmLatestPowerDraft(root, "shutdown", createdAt);
    await processDueSchedules(root, new Date());
    const scheduleClient = { abortPowerAction: async () => { throw new Error("系统撤销失败"); }, afterMutation: async () => {} };
    if (route === "language") {
      const result = await handleScheduleMessage("取消定时关机", { baseDir: root, scheduleClient });
      assert.match(result.reply, /系统撤销失败/);
    } else {
      const result = await executeTool("cancel_schedule", { id: draft.id }, { baseDir: root, scheduleClient });
      assert.equal(result.ok, false);
      assert.match(result.error, /系统撤销失败/);
    }
    assert.equal((await listSchedules(root, { includeHistory: true }))[0].status, "executing");
  }
});

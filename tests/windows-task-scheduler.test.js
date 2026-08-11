import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  buildScheduledLaunchSpec,
  registerWindowsScheduleTask,
  unregisterWindowsScheduleTask,
  windowsTaskName
} from "../src-agent/windows-task-scheduler.js";

test("development task launch includes the Electron app path and background flags", () => {
  const spec = buildScheduledLaunchSpec({
    executablePath: "D:/V-Manager/node_modules/electron/dist/electron.exe",
    appPath: "D:/V-Manager",
    isPackaged: false,
    scheduleId: "schedule-123"
  });
  assert.equal(path.basename(spec.executable), "electron.exe");
  assert.match(spec.arguments, /V-Manager/);
  assert.match(spec.arguments, /--vivi-background-schedule/);
  assert.match(spec.arguments, /--vivi-schedule-id=schedule-123/);
});

test("registering a Windows task uses a one-time trigger and wake settings", async () => {
  let call;
  const runner = async (...args) => { call = args; };
  const item = { id: "abc-123", type: "reminder", dueAt: new Date(Date.now() + 3_600_000).toISOString() };
  const result = await registerWindowsScheduleTask(item, {
    executable: "C:/Program Files/V-Manager/V-Manager.exe",
    arguments: "--vivi-background-schedule --vivi-schedule-id=abc-123",
    workingDirectory: "C:/Program Files/V-Manager"
  }, { runner, allowNonWindows: true });

  assert.equal(result.ok, true);
  assert.equal(result.taskName, windowsTaskName(item.id));
  assert.equal(call[0], "powershell.exe");
  const script = call[1].at(-1);
  assert.match(script, /New-ScheduledTaskTrigger -Once/);
  assert.match(script, /StartWhenAvailable -WakeToRun/);
  assert.match(script, /Register-ScheduledTask/);
});

test("unregister removes only the V-Manager task for that schedule", async () => {
  let call;
  const result = await unregisterWindowsScheduleTask("abc-123", {
    allowNonWindows: true,
    runner: async (...args) => { call = args; }
  });
  assert.equal(result.ok, true);
  assert.match(call[1].at(-1), /Unregister-ScheduledTask/);
  assert.match(call[1].at(-1), /V-Manager-abc-123/);
});

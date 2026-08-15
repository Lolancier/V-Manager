import test from "node:test";
import assert from "node:assert/strict";
import {
  configureDesktopShell,
  getDesktopShell,
  resetDesktopShellForTests
} from "../src-agent/platform/desktop-shell.js";

test("desktop shell requires an explicit host adapter", () => {
  resetDesktopShellForTests();
  assert.throws(() => getDesktopShell(), /尚未配置/);
  assert.throws(() => configureDesktopShell({}), /缺少 openExternal/);
});

test("desktop shell forwards privileged operations through the host boundary", async (t) => {
  t.after(resetDesktopShellForTests);
  const calls = [];
  const shell = configureDesktopShell({
    openExternal: async (url) => calls.push(["external", url]),
    openPath: async (target) => { calls.push(["path", target]); return ""; },
    trashItem: async (target) => calls.push(["trash", target])
  });
  await shell.openExternal("https://example.com");
  await shell.openPath("C:\\Temp");
  await shell.trashItem("C:\\Temp\\old.txt");
  assert.deepEqual(calls, [
    ["external", "https://example.com"],
    ["path", "C:\\Temp"],
    ["trash", "C:\\Temp\\old.txt"]
  ]);
});

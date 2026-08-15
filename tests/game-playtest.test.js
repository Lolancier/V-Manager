import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { normalizePlaytestLimits, runGamePlaytest } from "../src-agent/game-playtest.js";

test("playtest limits stay bounded", () => {
  assert.deepEqual(normalizePlaytestLimits({ maxSeconds: 999, maxActions: 1 }), { maxSeconds: 60, maxActions: 8 });
});

test("Electron playtest runtime disables Node, permissions, navigation, downloads and external network", async () => {
  const source = await fs.readFile(new URL("../electron/game-playtest-runtime.js", import.meta.url), "utf-8");
  assert.match(source, /nodeIntegration:\s*false/);
  assert.match(source, /contextIsolation:\s*true/);
  assert.match(source, /sandbox:\s*true/);
  assert.match(source, /setPermissionRequestHandler/);
  assert.match(source, /setWindowOpenHandler/);
  assert.match(source, /will-download/);
  assert.match(source, /network-blocked/);
});

test("isolated playtest presses bounded controls and captures score and screenshot", async () => {
  let reads = 0;
  const keys = [];
  const clicks = [];
  let closed = false;
  const result = await runGamePlaytest({
    artifactPath: "C:/sandbox/game/index.html",
    screenshotPath: "C:/sandbox/game/playtest.png",
    maxSeconds: 5,
    maxActions: 12,
    createDriver: async () => ({
      load: async () => {},
      readState: async () => {
        reads += 1;
        if (reads === 1) return { bodyText: "开始游戏", buttons: [{ x: 20, y: 20 }], recommendedActions: ["ArrowLeft"] };
        if (reads >= 5) return { bodyText: "胜利 得分 30", status: "won", score: 30, buttons: [] };
        return { bodyText: `分数 ${reads * 5}`, score: reads * 5, recommendedActions: ["ArrowRight"], buttons: [] };
      },
      key: async (key) => keys.push(key),
      click: async (x, y) => clicks.push({ x, y }),
      wait: async () => {},
      screenshot: async (target) => target,
      errors: () => [],
      close: async () => { closed = true; }
    })
  });
  assert.equal(result.ok, true);
  assert.equal(result.outcome, "won");
  assert.equal(result.highestScore, 30);
  assert.equal(result.screenshotPath, "C:/sandbox/game/playtest.png");
  assert.equal(clicks.length, 1);
  assert.ok(keys.length > 0);
  assert.equal(closed, true);
});

test("fatal renderer errors mark a playtest as failed", async () => {
  const result = await runGamePlaytest({
    artifactPath: "C:/sandbox/game/index.html",
    maxSeconds: 5,
    maxActions: 8,
    createDriver: async () => ({
      load: async () => {}, readState: async () => ({ bodyText: "game", buttons: [] }), key: async () => {}, click: async () => {}, wait: async () => {},
      screenshot: async () => "", errors: () => [{ type: "render-gone", message: "crashed" }], close: async () => {}
    })
  });
  assert.equal(result.ok, false);
  assert.equal(result.outcome, "failed");
});

test("text games advance by clicking visible answer buttons", async () => {
  let score = 0;
  let clicks = 0;
  const result = await runGamePlaytest({
    artifactPath: "C:/sandbox/text-game/index.html", maxSeconds: 5, maxActions: 8,
    createDriver: async () => ({
      load: async () => {},
      readState: async () => score >= 2
        ? { bodyText: "通关 得分 20", status: "won", score: 20, buttons: [] }
        : { bodyText: `第 ${score + 1} 题 分数 ${score * 10}`, score: score * 10, recommendedActions: ["选择 A"], buttons: [{ text: "选择 A", x: 30, y: 40 }, { text: "选择 B", x: 80, y: 40 }] },
      key: async () => {}, click: async () => { clicks += 1; score += 1; }, wait: async () => {},
      screenshot: async () => "", errors: () => [], close: async () => {}
    })
  });
  assert.equal(result.outcome, "won");
  assert.equal(result.highestScore, 20);
  assert.ok(clicks >= 2);
});

test("a stop request cancels a blocked playtest promptly and keeps a timeline", async () => {
  const controller = new AbortController();
  const stages = [];
  const startedAt = Date.now();
  setTimeout(() => controller.abort(), 20);
  const result = await runGamePlaytest({
    artifactPath: "C:/sandbox/game/index.html",
    signal: controller.signal,
    onProgress: (entry) => stages.push(entry.stage),
    createDriver: async () => ({
      load: async () => new Promise(() => {}),
      readState: async () => ({}), key: async () => {}, click: async () => {}, wait: async () => {},
      screenshot: async () => "", errors: () => [], close: async () => {}
    })
  });
  assert.equal(result.cancelled, true);
  assert.equal(result.outcome, "cancelled");
  assert.ok(Date.now() - startedAt < 500);
  assert.deepEqual(stages.slice(0, 2), ["creating", "loading"]);
  assert.equal(stages.at(-1), "cancelled");
  assert.ok(result.timeline.length >= 3);
});

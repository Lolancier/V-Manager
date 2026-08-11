import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  collectInterestContext,
  getInterestSandboxSnapshot,
  initializeInterestSession,
  isSafeInterestArtifact,
  normalizeInterestConfig,
  runInterestActivity,
  saveInterestLocation,
  selectInterestActivity
} from "../src-agent/interest-sandbox.js";

async function tempBase(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vivi-interest-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

const baseAgentConfig = {
  personaName: "Vivi",
  deepseek: { apiKey: "test-key", baseUrl: "https://example.invalid/v1", model: "test", chatModel: "test" },
  interests: {
    enabled: true,
    permissionLevel: "create",
    activities: { diary: true, drawing: true, miniGames: true },
    dailyTaskLimit: 3,
    dailyTokenBudget: 5000,
    maxDiskMB: 20,
    networkAccess: "off"
  }
};

function jsonResponse(data, tokens = 120) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: JSON.stringify(data) } }], usage: { total_tokens: tokens } }),
    text: async () => ""
  };
}

test("interest permissions default to a disabled diary-only sandbox", () => {
  const config = normalizeInterestConfig({});
  assert.equal(config.enabled, false);
  assert.equal(config.permissionLevel, "diary_only");
  assert.equal(config.networkAccess, "off");
  assert.deepEqual(config.newsFeeds, []);
});

test("diary-only permission rejects games and writes when the daily delay is due", () => {
  const snapshot = { today: { taskCount: 0, tokenCount: 0, date: "2026-08-08" }, diskBytes: 0, activities: [] };
  const config = { enabled: true, permissionLevel: "diary_only", activities: { diary: true, miniGames: true } };
  assert.equal(selectInterestActivity(config, snapshot, new Date("2026-08-08T21:30:00"), { manualType: "mini_game" }).allowed, false);
  assert.equal(selectInterestActivity(config, snapshot, new Date("2026-08-08T21:30:00"), { automaticDiaryDue: true }).type, "diary");
});

test("daily diary due time is persisted between two and three hours after launch", async (t) => {
  const baseDir = await tempBase(t);
  const launch = new Date("2026-08-08T09:00:00");
  const state = await initializeInterestSession(baseDir, launch, () => 0.5);
  assert.equal(state.diaryDueAt, new Date("2026-08-08T11:30:00").toISOString());
  const again = await initializeInterestSession(baseDir, new Date("2026-08-08T10:00:00"), () => 0);
  assert.equal(again.diaryDueAt, state.diaryDueAt);
});

test("automatic creative work requires an owner task completed after launch", () => {
  const snapshot = {
    today: { taskCount: 0, creativeTaskCount: 0, diaryWritten: false, tokenCount: 0, date: "2026-08-08" },
    diskBytes: 0,
    activities: [],
    session: { launchedAt: "2026-08-08T09:00:00.000Z", pendingActivity: null }
  };
  const config = { enabled: true, permissionLevel: "create", activities: { diary: true, drawing: true, miniGames: false }, activeStart: "09:00", activeEnd: "22:00" };
  assert.equal(selectInterestActivity(config, snapshot, new Date("2026-08-08T12:00:00"), { hasCompletedOwnerTask: false }).allowed, false);
  assert.equal(selectInterestActivity(config, snapshot, new Date("2026-08-08T12:00:00"), { hasCompletedOwnerTask: true }).type, "drawing");
});

test("writes a generated diary only inside the sandbox and records activity", async (t) => {
  const baseDir = await tempBase(t);
  const now = new Date("2026-08-08T21:30:00");
  const result = await runInterestActivity(baseDir, baseAgentConfig, "diary", {
    manual: true,
    now,
    modelFetch: async () => jsonResponse({ title: "今天的小结", mood: "满足", content: "今天完成了测试，没有虚构别的事情。" })
  });
  assert.equal(result.activity.status, "completed");
  assert.equal(isSafeInterestArtifact(baseDir, result.activity.artifactPath), true);
  assert.match(await fs.readFile(result.activity.artifactPath, "utf-8"), /今天完成了测试/);
  const snapshot = await getInterestSandboxSnapshot(baseDir, now);
  assert.equal(snapshot.today.taskCount, 1);
  assert.equal(snapshot.today.tokenCount, 120);
});

test("writing the diary again updates the same dated file", async (t) => {
  const baseDir = await tempBase(t);
  const first = await runInterestActivity(baseDir, baseAgentConfig, "diary", {
    manual: true, now: new Date("2026-08-08T12:00:00"),
    modelFetch: async () => jsonResponse({ title: "第一版", mood: "平静", content: "第一版内容" })
  });
  const second = await runInterestActivity(baseDir, baseAgentConfig, "diary", {
    manual: true, now: new Date("2026-08-08T18:00:00"),
    modelFetch: async () => jsonResponse({ title: "更新版", mood: "开心", content: "更新后的当天内容" })
  });
  assert.equal(second.activity.artifactPath, first.activity.artifactPath);
  assert.equal(second.activity.action, "updated");
  assert.match(await fs.readFile(second.activity.artifactPath, "utf-8"), /更新后的当天内容/);
});

test("rejects active or networked mini-game content and logs the failed attempt", async (t) => {
  const baseDir = await tempBase(t);
  await assert.rejects(
    runInterestActivity(baseDir, baseAgentConfig, "mini_game", {
      manual: true,
      now: new Date("2026-08-08T12:00:00"),
      modelFetch: async () => jsonResponse({ title: "坏游戏", description: "test", html: "<button>go</button>", css: "", js: "fetch('https://bad.test')" })
    }),
    /安全检查/
  );
  const snapshot = await getInterestSandboxSnapshot(baseDir, new Date("2026-08-08T12:01:00"));
  assert.equal(snapshot.today.taskCount, 1);
  assert.equal(snapshot.activities[0].status, "failed");
});

test("a user-aborted creation is recorded as cancelled for later continuation", async (t) => {
  const baseDir = await tempBase(t);
  const controller = new AbortController();
  const running = runInterestActivity(baseDir, baseAgentConfig, "drawing", {
    manual: true,
    now: new Date("2026-08-08T14:00:00"),
    signal: controller.signal,
    modelFetch: async (_url, options) => new Promise((_resolve, reject) => {
      const abort = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      if (options.signal.aborted) abort();
      else options.signal.addEventListener("abort", abort, { once: true });
    })
  });
  setTimeout(() => controller.abort(), 10);
  await assert.rejects(running, /aborted/);
  const snapshot = await getInterestSandboxSnapshot(baseDir, new Date("2026-08-08T14:01:00"));
  assert.equal(snapshot.activities[0].status, "cancelled");
});

test("artifact boundary rejects files outside the dedicated sandbox", async (t) => {
  const baseDir = await tempBase(t);
  assert.equal(isSafeInterestArtifact(baseDir, path.join(baseDir, "outside.md")), false);
});

test("external context stays offline until weather access is explicitly enabled", async (t) => {
  const baseDir = await tempBase(t);
  let calls = 0;
  const context = await collectInterestContext(baseDir, { networkAccess: "off", weatherLocation: "上海" }, new Date(), {
    fetchImpl: async () => { calls += 1; throw new Error("must remain offline"); }
  });
  assert.equal(calls, 0);
  assert.equal(context.weather, null);
  assert.deepEqual(context.news, []);
});

test("weather context uses Windows coordinates without a manually entered city", async (t) => {
  const baseDir = await tempBase(t);
  await saveInterestLocation(baseDir, { latitude: 31.2, longitude: 121.5, accuracy: 1200 });
  const urls = [];
  const context = await collectInterestContext(baseDir, { networkAccess: "weather" }, new Date(), {
    fetchImpl: async (url) => {
      urls.push(url);
      return { json: async () => ({ current: { temperature_2m: 28, weather_code: 1 } }) };
    }
  });
  assert.equal(urls.length, 1);
  assert.match(urls[0], /^https:\/\/api\.open-meteo\.com\//);
  assert.equal(context.weather.current.temperature_2m, 28);
});

test("saved Windows location keeps the resolved city label", async (t) => {
  const baseDir = await tempBase(t);
  const saved = await saveInterestLocation(baseDir, {
    latitude: 31.23,
    longitude: 121.47,
    accuracy: 80,
    city: "上海市",
    region: "上海市",
    country: "中国"
  });
  assert.equal(saved.city, "上海市");
  const snapshot = await getInterestSandboxSnapshot(baseDir);
  assert.equal(snapshot.location.city, "上海市");
});

test("enabled built-in AI feeds provide titles and summaries without custom URLs", async (t) => {
  const baseDir = await tempBase(t);
  let calls = 0;
  const context = await collectInterestContext(baseDir, {
    networkAccess: "weather_news",
    newsTopics: { hot: false, gaming: false, science: false, ai: true }
  }, new Date(), {
    fetchImpl: async () => {
      calls += 1;
      return { text: async () => "<rss><channel><title>Feed</title><item><title>AI 新进展</title><description>一段可用于创作参考的摘要。</description></item></channel></rss>" };
    }
  });
  assert.equal(calls, 2);
  assert.equal(context.news.length, 2);
  assert.equal(context.news[0].title, "AI 新进展");
  assert.match(context.news[0].summary, /创作参考/);
});

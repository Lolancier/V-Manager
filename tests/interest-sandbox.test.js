import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  cleanupInterestSandbox,
  buildInterestRoutine,
  collectInterestContext,
  getInterestSandboxSnapshot,
  initializeInterestSession,
  isSafeInterestArtifact,
  normalizeInterestConfig,
  prepareMiniGameContent,
  recordInterestPlaytest,
  repairInterestGame,
  reviseInterestGame,
  runAutonomousLifeActivity,
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

test("daily diary uses the configured clock time and persists for the day", async (t) => {
  const baseDir = await tempBase(t);
  const launch = new Date("2026-08-08T09:00:00");
  const state = await initializeInterestSession(baseDir, launch, { diaryTime: "21:30" });
  assert.equal(state.diaryDueAt, new Date("2026-08-08T21:30:00").toISOString());
  const again = await initializeInterestSession(baseDir, new Date("2026-08-08T10:00:00"), { diaryTime: "21:30" });
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

test("autonomous permission accepts the two-million token budget and follows its own routine", () => {
  const config = normalizeInterestConfig({
    enabled: true,
    permissionLevel: "autonomous",
    activities: { diary: true, drawing: true, miniGames: true },
    dailyTaskLimit: 2,
    dailyTokenBudget: 2_000_000,
    activeStart: "09:00",
    activeEnd: "22:00"
  });
  assert.equal(config.dailyTokenBudget, 2_000_000);
  const snapshot = {
    today: { taskCount: 0, creativeTaskCount: 0, diaryWritten: false, tokenCount: 0, date: "2026-08-08" },
    diskBytes: 0,
    activities: [],
    session: { pendingActivity: null }
  };
  const decision = selectInterestActivity(config, snapshot, new Date("2026-08-08T17:00:00"), { hasCompletedOwnerTask: false });
  assert.equal(decision.allowed, true);
  assert.ok(["light", "creative", "entertainment", "companion"].includes(decision.category));
  assert.equal(config.autonomousRoutineLimit, 9);
  assert.equal(buildInterestRoutine(config, [], new Date("2026-08-08T17:00:00")).length, 9);
});

test("overdue routine slots are marked missed and do not block the current due slot", () => {
  const config = normalizeInterestConfig({
    ...baseAgentConfig.interests,
    permissionLevel: "autonomous",
    autonomousRoutineLimit: 3,
    activeStart: "09:00",
    activeEnd: "21:00"
  });
  const now = new Date("2026-08-08T16:30:00");
  const routine = buildInterestRoutine(config, [], now);
  assert.equal(routine[0].status, "missed");
  assert.equal(routine[1].status, "due");
  const snapshot = { today: { taskCount: 0, creativeTaskCount: 0, entertainmentCount: 0, tokenCount: 0, date: "2026-08-08" }, diskBytes: 0, activities: [], routine, session: { pendingActivity: null } };
  const decision = selectInterestActivity(config, snapshot, now);
  assert.equal(decision.allowed, true);
  assert.equal(decision.routineId, routine[1].id);
});

test("turning off autonomous life stops its routine but keeps manual creation available", () => {
  const config = normalizeInterestConfig({
    ...baseAgentConfig.interests,
    autonomousLifeEnabled: false,
    permissionLevel: "autonomous"
  });
  const snapshot = { today: { taskCount: 0, creativeTaskCount: 0, tokenCount: 0, date: "2026-08-08" }, diskBytes: 0, activities: [] };
  assert.deepEqual(buildInterestRoutine(config, [], new Date("2026-08-08T17:00:00")), []);
  assert.equal(selectInterestActivity(config, snapshot, new Date("2026-08-08T17:00:00")).allowed, false);
  assert.equal(selectInterestActivity(config, snapshot, new Date("2026-08-08T17:00:00"), { manualType: "drawing" }).allowed, true);
});

test("rest is a real zero-token autonomous activity and uses the shared budget ledger", async (t) => {
  const baseDir = await tempBase(t);
  const config = {
    ...baseAgentConfig,
    interests: { ...baseAgentConfig.interests, permissionLevel: "autonomous", autonomousLifeEnabled: true }
  };
  const result = await runAutonomousLifeActivity(baseDir, config, "rest", {
    manual: true,
    now: new Date("2026-08-08T18:00:00"),
    persona: { cardId: "vivi", version: 1, name: "Vivi" }
  });
  assert.equal(result.activity.category, "light");
  assert.equal(result.activity.tokens, 0);
  assert.equal(result.snapshot.today.lightActivityCount, 1);
  assert.equal(result.snapshot.today.tokenCount, 0);
});

test("automatic autonomous work stops when the shared token budget is exhausted", () => {
  const config = normalizeInterestConfig({ ...baseAgentConfig.interests, permissionLevel: "autonomous", dailyTokenBudget: 1000 });
  const snapshot = {
    today: { taskCount: 1, creativeTaskCount: 0, tokenCount: 1000, date: "2026-08-08" },
    diskBytes: 0,
    activities: [],
    session: { pendingActivity: null }
  };
  const decision = selectInterestActivity(config, snapshot, new Date("2026-08-08T17:00:00"));
  assert.equal(decision.allowed, false);
  assert.equal(decision.budgetExhausted, true);
});

test("the virtual routine can be disabled without disabling manual sandbox activities", () => {
  const config = normalizeInterestConfig({
    ...baseAgentConfig.interests,
    enabled: true,
    permissionLevel: "autonomous",
    virtualScheduleEnabled: false,
    activities: { diary: true, drawing: true, miniGames: true }
  });
  assert.deepEqual(buildInterestRoutine(config, [], new Date("2026-08-08T12:00:00")), []);
  const snapshot = { today: { taskCount: 0, creativeTaskCount: 0, tokenCount: 0, date: "2026-08-08" }, diskBytes: 0, activities: [] };
  assert.equal(selectInterestActivity(config, snapshot, new Date("2026-08-08T12:00:00"), { manualType: "mini_game" }).allowed, true);
});

test("creative generation retries when a reasoning model returns no content", async (t) => {
  const baseDir = await tempBase(t);
  let calls = 0;
  const result = await runInterestActivity(baseDir, baseAgentConfig, "drawing", {
    manual: true,
    now: new Date("2026-08-08T12:00:00"),
    modelFetch: async (_url, options) => {
      calls += 1;
      const body = JSON.parse(options.body);
      assert.equal(body.model, baseAgentConfig.deepseek.model);
      assert.equal(body.max_tokens, calls === 1 ? 12_000 : 24_000);
      if (calls === 1) return {
        ok: true, status: 200,
        json: async () => ({ choices: [{ finish_reason: "length", message: { content: "", reasoning_content: "long reasoning" } }], usage: { total_tokens: 100 } }),
        text: async () => ""
      };
      return jsonResponse({ title: "重试成功", description: "完整作品", svg: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><circle cx="5" cy="5" r="4"/></svg>' }, 150);
    }
  });
  assert.equal(calls, 2);
  assert.equal(result.activity.status, "completed");
  assert.equal(result.activity.tokens, 250);
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

test("normal JavaScript functions and full-document game output are converted to an offline game", async (t) => {
  const prepared = prepareMiniGameContent({
    html: "<!doctype html><html><head><style>button{color:teal}</style></head><body><button id=go>开始</button><script>function start(){ return 1; } document.querySelector('#go').addEventListener('click', start);</script></body></html>",
    css: "",
    js: ""
  });
  assert.match(prepared.html, /button/);
  assert.match(prepared.css, /color:teal/);
  assert.match(prepared.js, /function start/);

  const baseDir = await tempBase(t);
  const result = await runInterestActivity(baseDir, baseAgentConfig, "mini_game", {
    manual: true,
    now: new Date("2026-08-08T12:00:00"),
    persona: { cardId: "mashiro-card", version: 2, name: "九条真白" },
    modelFetch: async () => jsonResponse({ title: "按钮小游戏", description: "点击按钮计分", ...prepared })
  });
  assert.equal(result.activity.status, "completed");
  assert.equal(result.activity.personaCardId, "mashiro-card");
  assert.match(result.activity.artifactPath, /games[\\/]mashiro-card/);
  assert.match(await fs.readFile(result.activity.artifactPath, "utf-8"), /function start/);
  assert.match(await fs.readFile(result.activity.sourcePath, "utf-8"), /function start/);
});

test("a diary is archived by persona and automatically links today's drawing", async (t) => {
  const baseDir = await tempBase(t);
  const persona = { cardId: "shorekeeper-card", version: 1, name: "守岸人" };
  const drawing = await runInterestActivity(baseDir, baseAgentConfig, "drawing", {
    manual: true, now: new Date("2026-08-08T12:00:00"), persona,
    modelFetch: async () => jsonResponse({ title: "海岸星光", description: "今天画下的海岸", svg: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><circle cx="5" cy="5" r="4"/></svg>' })
  });
  const diary = await runInterestActivity(baseDir, baseAgentConfig, "diary", {
    manual: true, now: new Date("2026-08-08T20:00:00"), persona,
    modelFetch: async (_url, options) => {
      assert.match(options.body, /今天已经画过画/);
      return jsonResponse({ title: "海边日记", mood: "安静", content: "今天画下了海岸边的星光。" });
    }
  });
  assert.match(diary.activity.artifactPath, /diary[\\/]shorekeeper-card/);
  assert.deepEqual(diary.activity.relatedActivityIds, [drawing.activity.id]);
  const markdown = await fs.readFile(diary.activity.artifactPath, "utf-8");
  assert.match(markdown, /今天的画/);
  assert.match(markdown, /海岸星光/);
  const laterDrawing = await runInterestActivity(baseDir, baseAgentConfig, "drawing", {
    manual: true, now: new Date("2026-08-08T21:00:00"), persona,
    modelFetch: async () => jsonResponse({ title: "夜色蝴蝶", description: "日记之后补画", svg: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><path d="M1 1L9 9"/></svg>' })
  });
  const snapshot = await getInterestSandboxSnapshot(baseDir, new Date("2026-08-08T22:00:00"));
  const linkedDiary = snapshot.activities.find((item) => item.id === diary.activity.id);
  assert.equal(linkedDiary.relatedActivityIds.includes(laterDrawing.activity.id), true);
  assert.match(await fs.readFile(diary.activity.artifactPath, "utf-8"), /夜色蝴蝶/);
});

test("failed log cleanup preserves completed works", async (t) => {
  const baseDir = await tempBase(t);
  const completed = await runInterestActivity(baseDir, baseAgentConfig, "diary", {
    manual: true, now: new Date("2026-08-08T10:00:00"),
    modelFetch: async () => jsonResponse({ title: "保留日记", mood: "平静", content: "需要保留。" })
  });
  await assert.rejects(runInterestActivity(baseDir, baseAgentConfig, "mini_game", {
    manual: true, now: new Date("2026-08-08T11:00:00"),
    modelFetch: async () => jsonResponse({ title: "失败游戏", html: "<button>x</button>", css: "", js: "eval('x')" })
  }), /动态代码执行/);
  const cleaned = await cleanupInterestSandbox(baseDir, "failed_logs");
  assert.equal(cleaned.removedLogs, 1);
  const snapshot = await getInterestSandboxSnapshot(baseDir, new Date("2026-08-08T12:00:00"));
  assert.equal(snapshot.activities.length, 1);
  assert.equal(snapshot.activities[0].status, "completed");
  assert.equal(await fs.readFile(completed.activity.artifactPath, "utf-8").then(() => true), true);
});

test("current persona gets an independent daily ledger and game cleanup synchronizes records", async (t) => {
  const baseDir = await tempBase(t);
  const now = new Date("2026-08-08T12:00:00");
  for (const persona of [{ cardId: "card-a", version: 1, name: "A" }, { cardId: "card-b", version: 1, name: "B" }]) {
    await runInterestActivity(baseDir, baseAgentConfig, "drawing", { manual: true, now, persona, modelFetch: async () => jsonResponse({ title: `画作-${persona.name}`, description: persona.name, svg: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>' }) });
  }
  const game = await runInterestActivity(baseDir, baseAgentConfig, "mini_game", { manual: true, now, persona: { cardId: "card-a", version: 1, name: "A" }, modelFetch: async () => jsonResponse({ title: "文字问答", description: "低操作问答", html: "<button>选择 A</button>", css: "", js: "window.__VIVI_GAME__={getState(){return {status:'playing',score:0,recommendedActions:['选择 A']}}};" }) });
  const personaSnapshot = await getInterestSandboxSnapshot(baseDir, now, { ...baseAgentConfig.interests, personaCardId: "card-b" });
  assert.equal(personaSnapshot.today.taskCount, 1);
  await fs.rm(path.dirname(game.activity.artifactPath), { recursive: true, force: true });
  const cleaned = await cleanupInterestSandbox(baseDir, "game_content");
  assert.equal(cleaned.removedLogs, 1);
  const synced = await getInterestSandboxSnapshot(baseDir, now);
  assert.equal(synced.activities.some((item) => item.type === "mini_game"), false);
});

test("legacy persona-first folders migrate into visible category folders and keep log paths valid", async (t) => {
  const baseDir = await tempBase(t);
  const root = path.join(baseDir, "agent-data", "vivi-sandbox");
  const oldGame = path.join(root, "personas", "card-1", "games", "old-game", "index.html");
  await fs.mkdir(path.dirname(oldGame), { recursive: true });
  await fs.writeFile(oldGame, "<html>old game</html>", "utf-8");
  await fs.writeFile(path.join(root, "activity.jsonl"), `${JSON.stringify({
    id: "old-game", day: "2026-08-08", type: "mini_game", status: "completed", title: "旧游戏",
    summary: "迁移测试", artifactPath: oldGame, tokens: 10, createdAt: "2026-08-08T10:00:00.000Z",
    personaCardId: "card-1", personaName: "测试人格"
  })}\n`, "utf-8");
  const snapshot = await getInterestSandboxSnapshot(baseDir, new Date("2026-08-08T12:00:00"));
  const migrated = snapshot.activities[0].artifactPath;
  assert.match(migrated, /games[\\/]card-1[\\/]old-game[\\/]index\.html$/);
  assert.equal(await fs.readFile(migrated, "utf-8"), "<html>old game</html>");
  await assert.rejects(fs.access(path.join(root, "personas", "card-1")));
});

test("playtest results update the game activity and append reflection and screenshot to today's persona diary", async (t) => {
  const baseDir = await tempBase(t);
  const persona = { cardId: "mashiro", version: 2, name: "九条真白" };
  const diary = await runInterestActivity(baseDir, baseAgentConfig, "diary", {
    manual: true, now: new Date("2026-08-08T10:00:00"), persona,
    modelFetch: async () => jsonResponse({ title: "今天", mood: "期待", content: "今天准备做个小游戏。" })
  });
  const game = await runInterestActivity(baseDir, baseAgentConfig, "mini_game", {
    manual: true, now: new Date("2026-08-08T11:00:00"), persona,
    modelFetch: async () => jsonResponse({ title: "接星星", description: "接住星星", html: "<canvas></canvas>", css: "", js: "window.__VIVI_GAME__={getState(){return {status:'playing',score:12,recommendedActions:['ArrowLeft']}}};" })
  });
  const screenshotPath = path.join(path.dirname(game.activity.artifactPath), "playtest.png");
  await fs.writeFile(screenshotPath, Buffer.from([137, 80, 78, 71]));
  const updated = await recordInterestPlaytest(baseDir, game.activity.id, {
    ok: true, outcome: "ran", highestScore: 12, actions: 20, durationMs: 4000, screenshotPath,
    reflection: "我接到了不少星星，下次想把移动节奏做得更轻快。", repairAttempts: 0, errors: []
  }, 30);
  assert.equal(updated.playtest.highestScore, 12);
  assert.equal(updated.tokens, game.activity.tokens + 30);
  const markdown = await fs.readFile(diary.activity.artifactPath, "utf-8");
  assert.match(markdown, /今天玩的游戏/);
  assert.match(markdown, /最高分：12/);
  assert.match(markdown, /playtest\.png/);
});

test("a failed new game can be repaired from its saved source", async (t) => {
  const baseDir = await tempBase(t);
  const game = await runInterestActivity(baseDir, baseAgentConfig, "mini_game", {
    manual: true, now: new Date("2026-08-08T11:00:00"),
    modelFetch: async () => jsonResponse({ title: "待修游戏", description: "test", html: "<button>开始</button>", css: "", js: "function start(){}" })
  });
  await fs.rm(game.activity.sourcePath);
  const repaired = await repairInterestGame(baseDir, baseAgentConfig, game.activity, {
    outcome: "failed", highestScore: null, state: {}, errors: [{ type: "console-error", message: "start is not defined" }]
  }, {
    modelFetch: async () => jsonResponse({ title: "修好的游戏", description: "fixed", html: "<button id='start'>开始</button>", css: "button{color:teal}", js: "let score=0; document.querySelector('#start').onclick=()=>score++; window.__VIVI_GAME__={getState(){return {status:'playing',score,recommendedActions:['Enter']}}};" }, 77)
  });
  assert.equal(repaired.tokens, 77);
  assert.match(await fs.readFile(game.activity.artifactPath, "utf-8"), /__VIVI_GAME__/);
  assert.match(await fs.readFile(game.activity.sourcePath, "utf-8"), /修好的游戏/);
});

test("a named game can be revised in place and keeps its activity identity", async (t) => {
  const baseDir = await tempBase(t);
  const game = await runInterestActivity(baseDir, baseAgentConfig, "mini_game", {
    manual: true, now: new Date("2026-08-08T11:00:00"),
    modelFetch: async () => jsonResponse({ title: "潮汐问答", description: "三道题", html: "<button>答题</button>", css: "", js: "window.__VIVI_GAME__={getState(){return {status:'playing',score:0,recommendedActions:['Enter']}}};" })
  });
  const revised = await reviseInterestGame(baseDir, baseAgentConfig, game.activity, "把题目增加到五道，并提高难度", {
    modelFetch: async () => jsonResponse({ title: "潮汐问答", description: "五道进阶题", html: "<button>答题</button>", css: "", js: "window.__VIVI_GAME__={getState(){return {status:'playing',score:5,highestScore:5,recommendedActions:['Enter']}}};" }, 55)
  });
  assert.equal(revised.activity.id, game.activity.id);
  assert.equal(revised.activity.action, "updated");
  assert.match(await fs.readFile(game.activity.sourcePath, "utf-8"), /五道进阶题/);
  const snapshot = await getInterestSandboxSnapshot(baseDir, new Date("2026-08-08T12:00:00"));
  assert.equal(snapshot.activities.find((item) => item.id === game.activity.id).summary, "五道进阶题");
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

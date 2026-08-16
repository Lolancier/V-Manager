import path from "node:path";
import {
  cleanupInterestSandbox,
  generatePlaytestReflection,
  getInterestActivity,
  getInterestSandboxSnapshot,
  initializeInterestSession,
  isSafeInterestArtifact,
  normalizeInterestConfig,
  recordDelegatedAutonomousActivity,
  recordInterestPlaytest,
  repairInterestGame,
  reviseInterestGame,
  runAutonomousLifeActivity,
  runInterestActivity,
  saveInterestLocation,
  selectInterestActivity,
  updateInterestSession
} from "../../src-agent/interest-sandbox.js";
import { classifyDiaryRequest, diaryOpenReply, diaryStatusReply } from "../../src-agent/diary-privacy.js";

export const AUTONOMOUS_CREATION_HANDLE_CHANNELS = Object.freeze([
  "agent:get-interest-sandbox",
  "agent:run-interest-activity",
  "agent:get-interest-state",
  "agent:cleanup-interest-sandbox",
  "agent:play-interest-game",
  "agent:interrupt-interest-activity",
  "agent:update-interest-location",
  "agent:open-interest-sandbox",
  "agent:open-interest-artifact",
  "agent:open-interest-category"
]);

const defaultDependencies = {
  cleanupInterestSandbox,
  generatePlaytestReflection,
  getInterestActivity,
  getInterestSandboxSnapshot,
  initializeInterestSession,
  isSafeInterestArtifact,
  normalizeInterestConfig,
  recordDelegatedAutonomousActivity,
  recordInterestPlaytest,
  repairInterestGame,
  reviseInterestGame,
  runAutonomousLifeActivity,
  runInterestActivity,
  saveInterestLocation,
  selectInterestActivity,
  updateInterestSession
};

export function interestStatusLabel(type) {
  const labels = {
    diary: "整理今天的日记",
    drawing: "在笔记本上写写画画",
    mini_game: "制作并试玩离线小游戏",
    collect_diary_materials: "收集今天的日记素材",
    browse_information: "看看天气和允许读取的资讯",
    organize_memory: "整理记忆和近期话题",
    play_existing_game: "玩一个以前做的小游戏",
    improve_existing_game: "改进以前制作的小游戏",
    review_drawing: "回顾以前画过的画",
    plan_creation: "规划下一次创作",
    rest: "安静休息和发呆",
    prepare_chat_topics: "准备以后想和你聊的话题"
  };
  return labels[type] || "进行自己的沙盒活动";
}

function snapshotConfig(config) {
  return typeof structuredClone === "function"
    ? structuredClone(config)
    : JSON.parse(JSON.stringify(config));
}

function abortError(message) {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

export function createAutonomousCreationService(options) {
  const dependencies = { ...defaultDependencies, ...(options.dependencies || {}) };
  const setIntervalImpl = options.setInterval || globalThis.setInterval;
  const clearIntervalImpl = options.clearInterval || globalThis.clearInterval;
  const now = options.now || (() => new Date());
  const registeredChannels = new Set();
  let currentTask = null;
  let timer = null;
  let tickPromise = null;
  let accepting = true;
  let stopPromise = null;
  let generation = 0;
  let disposed = false;

  const baseDir = () => options.getBaseDir();
  const settingsFor = (config = options.getConfig()) => dependencies.normalizeInterestConfig({
    ...config.interests,
    personaCardId: config.activePersonaCard?.id || ""
  });
  const personaFor = (config) => config.activePersonaCard
    ? {
        cardId: config.activePersonaCard.id,
        version: config.activePersonaCard.version,
        name: config.personaName || config.activePersonaCard.name
      }
    : null;

  function publicState(task = currentTask) {
    return task
      ? {
          status: "working",
          type: task.type,
          label: task.label || interestStatusLabel(task.type),
          startedAt: task.startedAt,
          activityId: task.activityId || null,
          title: task.title || "",
          phase: task.phase || "working",
          progress: task.progress || null,
          logs: (task.logs || []).slice(-12),
          personaCardId: task.persona?.cardId || ""
        }
      : { status: "idle", type: null, label: "当前没有进行创作", startedAt: null };
  }

  function publishState() {
    const state = publicState();
    options.broadcastState?.(state);
    return state;
  }

  function updateTask(task, patch) {
    if (currentTask !== task) return false;
    Object.assign(task, patch);
    publishState();
    return true;
  }

  function beginTask(type, details = {}) {
    if (!accepting) throw abortError("自主创作服务正在停止，暂不接受新任务。");
    if (currentTask) throw new Error("Vivi 正在进行另一项创作。");
    const config = snapshotConfig(options.getConfig());
    const task = {
      id: ++generation,
      type,
      startedAt: now().toISOString(),
      controller: new AbortController(),
      config,
      persona: personaFor(config),
      phase: "starting",
      logs: [],
      playtestRecords: new Set(),
      playtestInFlight: new Map(),
      ...details
    };
    currentTask = task;
    options.setExpression?.(type);
    publishState();
    return task;
  }

  function launchTask(type, details, operation) {
    const task = beginTask(type, details);
    options.broadcastMood?.({ phase: "final", mood: "thinking", reply: `我正在${interestStatusLabel(type)}。` });
    const promise = Promise.resolve().then(() => operation(task)).finally(() => {
      if (currentTask === task) {
        currentTask = null;
        options.setExpression?.(null);
        publishState();
      }
    });
    task.promise = promise;
    return promise;
  }

  async function recordPlaytestOnce(task, activity, playtest, tokens) {
    if (task.playtestRecords.has(activity.id)) return activity;
    if (task.playtestInFlight.has(activity.id)) return task.playtestInFlight.get(activity.id);
    const pending = Promise.resolve(dependencies.recordInterestPlaytest(baseDir(), activity.id, playtest, tokens))
      .then((result) => {
        task.playtestRecords.add(activity.id);
        return result;
      })
      .finally(() => task.playtestInFlight.delete(activity.id));
    task.playtestInFlight.set(activity.id, pending);
    return pending;
  }

  async function playtestInterestGame(task, activity, playtestOptions = {}) {
    if (!activity || activity.type !== "mini_game" || !dependencies.isSafeInterestArtifact(baseDir(), activity.artifactPath)) {
      throw new Error("只能试玩兴趣沙盒中的 HTML 小游戏。");
    }
    const settings = settingsFor(task.config);
    let repairAttempts = 0;
    let extraTokens = 0;
    let playtest;
    const onProgress = (entry) => {
      if (currentTask === task) {
        updateTask(task, {
          phase: entry.stage,
          progress: entry,
          label: entry.label,
          logs: [...(task.logs || []), entry].slice(-24)
        });
      }
      playtestOptions.onProgress?.(entry);
    };
    while (true) {
      playtest = await options.gamePlaytestService.run({
        artifactPath: activity.artifactPath,
        screenshotPath: path.join(path.dirname(activity.artifactPath), "playtest.png"),
        maxSeconds: settings.selfPlayMaxSeconds,
        maxActions: settings.selfPlayMaxActions,
        signal: task.controller.signal,
        onProgress
      });
      if (playtest.cancelled || task.controller.signal.aborted) {
        const completed = {
          ...playtest,
          cancelled: true,
          outcome: "cancelled",
          reflection: `我已经停下《${activity.title}》的试玩，刚才完成了 ${playtest.actions} 次操作。当前进度和终止记录已经保存。`,
          repairAttempts
        };
        const recordedTokens = playtestOptions.separateActivityRecord ? 0 : extraTokens;
        const updated = await recordPlaytestOnce(task, activity, completed, recordedTokens);
        return { activity: updated, playtest: completed, tokensUsed: extraTokens };
      }
      const needsRepair = !playtest.ok
        || !playtest.state.protocolDetected
        || playtest.errors.some((item) => ["console-error", "page-error", "render-gone", "load-failed", "unresponsive", "playtest-error"].includes(item.type));
      if (!needsRepair || repairAttempts >= settings.selfRepairAttempts) break;
      try {
        onProgress({
          stage: "repairing",
          label: `发现运行问题，正在第 ${repairAttempts + 1} 次修复`,
          actions: playtest.actions,
          highestScore: playtest.highestScore,
          at: now().toISOString()
        });
        const repaired = await dependencies.repairInterestGame(baseDir(), task.config, activity, playtest, {
          signal: task.controller.signal
        });
        extraTokens += repaired.tokens;
        repairAttempts += 1;
      } catch (error) {
        if (task.controller.signal.aborted || error?.name === "AbortError") break;
        playtest.errors.push({ type: "repair-error", message: String(error?.message || error).slice(0, 500) });
        break;
      }
    }
    if (task.controller.signal.aborted) {
      const completed = {
        ...playtest,
        cancelled: true,
        outcome: "cancelled",
        reflection: `我已经停下《${activity.title}》的试玩和修复，终止前完成了 ${playtest.actions} 次操作。`,
        repairAttempts
      };
      const recordedTokens = playtestOptions.separateActivityRecord ? 0 : extraTokens;
      const updated = await recordPlaytestOnce(task, activity, completed, recordedTokens);
      return { activity: updated, playtest: completed, tokensUsed: extraTokens };
    }
    onProgress({
      stage: "reflecting",
      label: "试玩结束，正在整理分数和感想",
      actions: playtest.actions,
      highestScore: playtest.highestScore,
      at: now().toISOString()
    });
    const reflected = await dependencies.generatePlaytestReflection(task.config, activity, playtest, {
      signal: task.controller.signal
    });
    task.controller.signal.throwIfAborted();
    extraTokens += reflected.tokens;
    const completed = { ...playtest, reflection: reflected.reflection, repairAttempts };
    const recordedTokens = playtestOptions.separateActivityRecord ? 0 : extraTokens;
    const updated = await recordPlaytestOnce(task, activity, completed, recordedTokens);
    return { activity: updated, playtest: completed, tokensUsed: extraTokens };
  }

  function executeExistingGamePlaytest(activity) {
    if (!activity) return Promise.reject(new Error("没有找到要试玩的小游戏。"));
    return launchTask("mini_game", {
      label: `正在玩《${activity.title}》`,
      title: activity.title,
      activityId: activity.id,
      logs: []
    }, async (task) => {
      const result = await playtestInterestGame(task, activity);
      const snapshot = await dependencies.getInterestSandboxSnapshot(baseDir(), now(), settingsFor(task.config));
      options.publishProactiveEvent?.({
        kind: "interest_playtest",
        message: `${result.playtest.reflection}${result.playtest.repairAttempts ? ` 我还自己修了 ${result.playtest.repairAttempts} 次。` : ""}`,
        mood: result.playtest.cancelled ? "idle" : result.playtest.ok ? "happy" : "sad"
      });
      return { ...result, snapshot };
    });
  }

  function matchingInterestGames(snapshot, message) {
    const games = snapshot.activities.filter((item) => item.type === "mini_game" && item.status === "completed" && item.artifactPath);
    const text = String(message || "").toLocaleLowerCase();
    const named = games.filter((item) => text.includes(String(item.title || "").toLocaleLowerCase()));
    return { games, matches: named.length ? named : [] };
  }

  async function tryHandleVirtualLifeChat(message) {
    const text = String(message || "").trim();
    if (!/(?:你(?:现在)?在(?:做|忙|干)什么|你在干嘛|虚拟日程|你今天有什么安排|接下来做什么)/.test(text)) return null;
    const config = snapshotConfig(options.getConfig());
    const settings = settingsFor(config);
    if (!settings.enabled) return options.publishInteraction("我现在就是安静陪着你。自主生活还没有开启，所以不会背着你安排沙盒活动。", "idle", text);
    const snapshot = await dependencies.getInterestSandboxSnapshot(baseDir(), now(), settings);
    const next = snapshot.routine?.find((item) => item.status !== "completed");
    const latest = snapshot.activities.find((item) => item.status === "completed");
    const typeName = (type) => type === "drawing" ? "画点东西" : type === "mini_game" ? "做一个文字小游戏，再自己试玩" : "整理日记";
    if (next) {
      const due = new Date(next.dueAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
      return options.publishInteraction(`我现在闲着，在整理今天可以写进日记的素材。下一项虚拟日程是 ${due} ${typeName(next.type)}${settings.networkAccess === "weather_news" ? "；到时候也会看看你允许读取的资讯标题" : ""}。你随时可以提前叫我开始。`, "idle", text);
    }
    if (latest) return options.publishInteraction(`我现在闲着陪你。今天最近完成的是《${latest.title}》，暂时没有下一项虚拟日程；你也可以叫我画画、写游戏或者再玩一次。`, "happy", text);
    return options.publishInteraction("我现在没在忙，只是在自己的沙盒里整理想法，等一个适合写日记或做点小作品的时间。", "idle", text);
  }

  async function tryHandleInterestGameChat(message) {
    const text = String(message || "").trim();
    const wantsRevision = /(?:修改|改改|调整|优化|修复).{0,18}(?:小游戏|游戏)|(?:小游戏|游戏).{0,18}(?:修改|调整|优化|修复)/.test(text);
    const wantsPlay = /(?:你|自己).{0,5}(?:玩|试玩).{0,12}(?:小游戏|游戏)?|(?:试玩|再玩一次).{0,12}(?:小游戏|游戏)/.test(text);
    const wantsCreate = /(?:做|写|制作|生成|设计).{0,10}(?:小游戏|文字游戏).{0,10}(?:给我玩|你自己玩|试玩|玩玩)?/.test(text);
    if (!wantsRevision && !wantsPlay && !wantsCreate) return null;
    const config = snapshotConfig(options.getConfig());
    const settings = settingsFor(config);
    if (!settings.enabled || !settings.activities.miniGames) {
      return options.publishInteraction("小游戏沙盒目前没有开启。请先在“私密空间”里启用小游戏创作，我才会在隔离空间里制作和试玩。", "sad", text);
    }
    if (wantsCreate && !wantsRevision) {
      const result = await executeInterestActivity("mini_game", { manual: true });
      return options.publishInteraction(result.playtest
        ? `做好啦，是《${result.activity.title}》。我也自己试玩过了：${result.playtest.reflection}`
        : `我做好了《${result.activity.title}》，你可以去私密空间打开它。`, "happy", text);
    }
    const snapshot = await dependencies.getInterestSandboxSnapshot(baseDir(), now(), settings);
    const { games, matches } = matchingInterestGames(snapshot, text);
    if (!games.length) return options.publishInteraction("我的沙盒里还没有能玩的小游戏。你可以先让我做一个文字小游戏。", "thinking", text);
    if (wantsRevision) {
      if (games.length > 1 && matches.length !== 1) {
        return options.publishInteraction(`你想改哪一个？现在有：${games.slice(0, 6).map((item) => `《${item.title}》`).join("、")}。请带上名字告诉我。`, "thinking", text);
      }
      const activity = matches[0] || games[0];
      return launchTask("mini_game", {
        label: `修改《${activity.title}》`,
        title: activity.title,
        activityId: activity.id
      }, async (task) => {
        const revised = await dependencies.reviseInterestGame(baseDir(), task.config, activity, text, {
          signal: task.controller.signal
        });
        task.controller.signal.throwIfAborted();
        const result = settingsFor(task.config).selfPlayGames
          ? await playtestInterestGame(task, revised.activity)
          : null;
        return options.publishInteraction(result
          ? `《${revised.activity.title}》已经按你的要求改好，我也重新试玩了：${result.playtest.reflection}`
          : `《${revised.activity.title}》已经按你的要求改好。`, "happy", text);
      });
    }
    const result = await executeExistingGamePlaytest(matches[0] || games[0]);
    return options.publishInteraction(result.playtest.reflection, "happy", text);
  }

  function executeInterestActivity(type, activityOptions = {}) {
    if (options.isOwnerTaskRunning?.() || options.isScheduleBusy?.()) {
      return Promise.reject(new Error("当前还有主人交代的任务正在执行，请稍后再开始创作。"));
    }
    return launchTask(type, {}, async (task) => {
      const settings = settingsFor(task.config);
      if (!["diary", "drawing", "mini_game"].includes(type)) {
        const lifeResult = await dependencies.runAutonomousLifeActivity(baseDir(), task.config, type, {
          ...activityOptions,
          persona: task.persona,
          signal: task.controller.signal
        });
        task.controller.signal.throwIfAborted();
        if (lifeResult.delegated === "play_existing_game") {
          updateTask(task, {
            label: `正在玩《${lifeResult.target.title}》`,
            title: lifeResult.target.title,
            activityId: lifeResult.target.id
          });
          const played = await playtestInterestGame(task, lifeResult.target, { separateActivityRecord: true });
          const record = await dependencies.recordDelegatedAutonomousActivity(baseDir(), type, lifeResult.target, played.playtest, {
            routineId: activityOptions.routineId,
            tokens: played.tokensUsed
          });
          await dependencies.updateInterestSession(baseDir(), { pendingActivity: null });
          return {
            activity: record,
            playtest: played.playtest,
            snapshot: await dependencies.getInterestSandboxSnapshot(baseDir(), now(), settings)
          };
        }
        if (lifeResult.delegated === "improve_existing_game") {
          updateTask(task, { label: `正在改进《${lifeResult.target.title}》` });
          const revised = await dependencies.reviseInterestGame(
            baseDir(),
            task.config,
            lifeResult.target,
            "根据最近一次试玩感想和运行状态，小幅改进玩法、反馈或平衡，保持原主题。",
            { signal: task.controller.signal, separateActivityRecord: true }
          );
          task.controller.signal.throwIfAborted();
          const played = settings.selfPlayGames
            ? await playtestInterestGame(task, revised.activity, { separateActivityRecord: true })
            : null;
          const record = await dependencies.recordDelegatedAutonomousActivity(
            baseDir(),
            type,
            lifeResult.target,
            played?.playtest || { summary: "完成了一次小幅改进。" },
            { routineId: activityOptions.routineId, tokens: revised.tokens + (played?.tokensUsed || 0) }
          );
          await dependencies.updateInterestSession(baseDir(), { pendingActivity: null });
          return {
            activity: record,
            playtest: played?.playtest,
            snapshot: await dependencies.getInterestSandboxSnapshot(baseDir(), now(), settings)
          };
        }
        await dependencies.updateInterestSession(baseDir(), { pendingActivity: null });
        return lifeResult;
      }
      const result = await dependencies.runInterestActivity(baseDir(), task.config, type, {
        ...activityOptions,
        persona: task.persona,
        signal: task.controller.signal
      });
      task.controller.signal.throwIfAborted();
      if (type === "mini_game" && settings.selfPlayGames) {
        updateTask(task, {
          label: `正在玩《${result.activity.title}》`,
          title: result.activity.title,
          activityId: result.activity.id
        });
        options.broadcastMood?.({ phase: "final", mood: "thinking", reply: "游戏做好了，我先自己试玩一下。" });
        const played = await playtestInterestGame(task, result.activity);
        result.activity = played.activity;
        result.playtest = played.playtest;
        result.snapshot = await dependencies.getInterestSandboxSnapshot(baseDir(), now(), settings);
      }
      task.controller.signal.throwIfAborted();
      await dependencies.updateInterestSession(baseDir(), { pendingActivity: null });
      if (type !== "diary") {
        options.publishProactiveEvent?.({
          kind: "interest_creation",
          message: `${task.config.personaName || "Vivi"} 在私密空间里${result.activity.action === "updated" ? "更新" : "完成"}了《${result.activity.title}》。你有空时可以去活动记录里看看。`,
          mood: "happy"
        });
      }
      if (type !== "diary" && settings.permissionLevel === "preview" && settings.autoOpenPreview
        && dependencies.isSafeInterestArtifact(baseDir(), result.activity.artifactPath)) {
        await options.openPath(result.activity.artifactPath);
      }
      return result;
    }).catch(async (error) => {
      if (error?.name === "AbortError") {
        await dependencies.updateInterestSession(baseDir(), { pendingActivity: type });
      }
      throw error;
    });
  }

  async function tryHandleDiaryChat(message) {
    const intent = classifyDiaryRequest(message);
    if (!intent) return null;
    const config = snapshotConfig(options.getConfig());
    const snapshot = await dependencies.getInterestSandboxSnapshot(baseDir(), now(), settingsFor(config));
    const profile = await options.getRelationshipProfile();
    const diary = snapshot.activities.find((item) => item.type === "diary" && item.day === snapshot.today.date
      && item.status === "completed" && item.artifactPath);
    const written = Boolean(diary || snapshot.today.diaryWritten);
    if (intent === "status") {
      return options.publishInteraction(diaryStatusReply({
        written,
        profile,
        personaName: config.personaName || "Vivi"
      }), profile.emotion.suggestedMood || "idle", message);
    }
    const decision = diaryOpenReply({ written, profile });
    if (decision.allowed && diary && dependencies.isSafeInterestArtifact(baseDir(), diary.artifactPath)) {
      const error = await options.openPath(path.resolve(diary.artifactPath));
      if (error) return options.publishInteraction(`我想打开，但 Windows 没有成功：${error}`, "sad", message);
    }
    return options.publishInteraction(decision.reply, profile.emotion.suggestedMood || "idle", message);
  }

  async function handleChat(message) {
    const text = String(message || "").trim();
    if (currentTask) {
      if (/^(?:终止|停止|取消)(?:创作|当前创作|这个任务|吧)?$/.test(text)) {
        const label = currentTask.label || interestStatusLabel(currentTask.type);
        interrupt("用户终止创作");
        return options.publishInteraction(`好，我先停下${label}。这项内容会保留为待继续，等你一段时间没有和我互动、我也没有其他事务时，再接着完成。`, "idle", text);
      }
      if (/^(?:等待|继续|等你完成|你继续|继续完成)(?:吧)?$/.test(text)) {
        return options.publishInteraction(`好，我继续${currentTask.label || interestStatusLabel(currentTask.type)}，完成后再告诉你。`, "thinking", text);
      }
      const reply = await options.modelService.caughtInterestReply(currentTask, currentTask.config);
      return options.publishInteraction(reply, "surprised", text);
    }
    return await tryHandleInterestGameChat(text)
      || await tryHandleVirtualLifeChat(text)
      || await tryHandleDiaryChat(text);
  }

  function interrupt(reason = "用户终止活动") {
    if (!currentTask) return { interrupted: false, state: publishState() };
    const task = currentTask;
    const label = task.label || interestStatusLabel(task.type);
    updateTask(task, {
      phase: "stopping",
      label: "正在停止试玩并保存当前记录",
      logs: [...(task.logs || []), {
        stage: "stopping",
        label: "收到停止请求，正在关闭隔离窗口",
        at: now().toISOString()
      }].slice(-24)
    });
    task.controller.abort(abortError(reason));
    return { interrupted: true, label };
  }

  async function tick() {
    if (tickPromise) return tickPromise;
    if (!accepting || currentTask || options.isOwnerTaskRunning?.() || options.isScheduleBusy?.()
      || options.isProactiveBusy?.() || !options.isHostReady?.()) return null;
    tickPromise = (async () => {
      const config = snapshotConfig(options.getConfig());
      const settings = settingsFor(config);
      if (!settings.enabled || !settings.autonomousLifeEnabled) return null;
      const snapshot = await dependencies.getInterestSandboxSnapshot(baseDir(), now(), settings);
      const diaryDue = Boolean(snapshot.session?.diaryDueAt)
        && new Date(snapshot.session.diaryDueAt).getTime() <= now().getTime()
        && !snapshot.today.diaryWritten;
      const idleEnough = options.ownerInteractionIdleSeconds?.() >= settings.idleMinutes * 60;
      if (!idleEnough) return null;
      const completedAfterLaunch = Boolean(snapshot.session?.lastTaskCompletedAt)
        && new Date(snapshot.session.lastTaskCompletedAt) >= new Date(snapshot.session.launchedAt);
      const pendingType = !diaryDue ? snapshot.session?.pendingActivity : null;
      const decision = dependencies.selectInterestActivity(settings, snapshot, now(), {
        manualType: pendingType || undefined,
        automaticDiaryDue: diaryDue,
        hasCompletedOwnerTask: completedAfterLaunch
      });
      if (!decision.allowed) {
        if (decision.budgetExhausted && !snapshot.session?.budgetRequestNotified) {
          await dependencies.updateInterestSession(baseDir(), { budgetRequestNotified: true });
          options.publishProactiveEvent?.({
            kind: "autonomous_budget_request",
            message: "我今天分到的自主生活 Token 已经用完了，所以先停下来了。如果你希望我继续活动，可以在私密空间提高每日总预算。",
            mood: "sad"
          });
        }
        return decision;
      }
      return executeInterestActivity(decision.type, {
        manual: Boolean(pendingType),
        routineId: decision.routineId || "",
        category: decision.category || "creative",
        automaticDiaryDue: diaryDue,
        hasCompletedOwnerTask: completedAfterLaunch,
        localOnly: decision.localOnly
      });
    })().catch((error) => {
      if (error?.name !== "AbortError") options.onError?.("tick", error);
      return null;
    }).finally(() => {
      tickPromise = null;
    });
    return tickPromise;
  }

  async function start() {
    if (accepting && timer) return;
    accepting = true;
    stopPromise = null;
    await dependencies.initializeInterestSession(baseDir(), now(), settingsFor());
    if (!timer) timer = setIntervalImpl(() => { void tick(); }, options.tickIntervalMs ?? 5 * 60_000);
  }

  function stop() {
    if (stopPromise) return stopPromise;
    accepting = false;
    if (timer) clearIntervalImpl(timer);
    timer = null;
    if (currentTask) currentTask.controller.abort(abortError("自主创作服务正在停止。"));
    const pending = [currentTask?.promise, tickPromise].filter(Boolean);
    stopPromise = Promise.allSettled(pending).then(() => undefined);
    return stopPromise;
  }

  function register(channel, listener) {
    options.trustedIpc.handle(channel, listener);
    registeredChannels.add(channel);
  }

  function registerIpc() {
    if (disposed) throw new Error("自主创作服务已经释放。");
    try {
      register("agent:get-interest-sandbox", () => dependencies.getInterestSandboxSnapshot(baseDir(), now(), settingsFor()));
      register("agent:run-interest-activity", (_event, type) => executeInterestActivity(type, { manual: true }));
      register("agent:get-interest-state", () => publishState());
      register("agent:cleanup-interest-sandbox", async (_event, mode) => {
        const result = await dependencies.cleanupInterestSandbox(baseDir(), mode);
        return { result, snapshot: await dependencies.getInterestSandboxSnapshot(baseDir(), now(), settingsFor()) };
      });
      register("agent:play-interest-game", async (_event, activityId) => {
        const activity = await dependencies.getInterestActivity(baseDir(), activityId);
        return executeExistingGamePlaytest(activity);
      });
      register("agent:interrupt-interest-activity", () => interrupt("用户从桌面气泡终止活动"));
      register("agent:update-interest-location", async (_event, location) => {
        const label = await options.resolveLocationLabel(location);
        await dependencies.saveInterestLocation(baseDir(), { ...location, ...label });
        return dependencies.getInterestSandboxSnapshot(baseDir(), now(), settingsFor());
      });
      register("agent:open-interest-sandbox", async () => {
        const snapshot = await dependencies.getInterestSandboxSnapshot(baseDir(), now(), settingsFor());
        await options.openPath(snapshot.root);
        return snapshot.root;
      });
      register("agent:open-interest-artifact", async (_event, artifactPath) => {
        if (!dependencies.isSafeInterestArtifact(baseDir(), artifactPath)) throw new Error("只能打开兴趣沙盒内的作品。");
        if (!await options.isFile(path.resolve(artifactPath))) {
          throw new Error("作品文件已经被移除。请在“空间管理”中清理游戏文件夹，以同步活动记录。");
        }
        const error = await options.openPath(path.resolve(artifactPath));
        if (error) throw new Error(error);
        return true;
      });
      register("agent:open-interest-category", async (_event, category) => {
        const names = { diary: "diary", drawing: "drawings", mini_game: "games" };
        const directory = names[category];
        if (!directory) throw new Error("不支持的兴趣作品分类。");
        const snapshot = await dependencies.getInterestSandboxSnapshot(baseDir(), now(), settingsFor());
        const target = path.join(snapshot.root, directory);
        const error = await options.openPath(target);
        if (error) throw new Error(error);
        return target;
      });
    } catch (error) {
      for (const channel of registeredChannels) options.trustedIpc.removeHandler(channel);
      registeredChannels.clear();
      throw error;
    }
    return service;
  }

  async function dispose() {
    if (disposed) return stop();
    disposed = true;
    await stop();
    for (const channel of registeredChannels) options.trustedIpc.removeHandler(channel);
    registeredChannels.clear();
  }

  const service = {
    caughtReply: () => currentTask ? options.modelService.caughtInterestReply(currentTask, currentTask.config) : null,
    dispose,
    executeExistingGamePlaytest,
    executeInterestActivity,
    handleChat,
    interrupt,
    isBusy: () => Boolean(currentTask),
    markOwnerTaskCompleted: () => dependencies.updateInterestSession(baseDir(), { lastTaskCompletedAt: now().toISOString() }),
    registerIpc,
    snapshot: () => ({
      ...publicState(),
      accepting,
      tickRunning: Boolean(tickPromise),
      channels: [...registeredChannels]
    }),
    start,
    stop,
    tick
  };
  return service;
}

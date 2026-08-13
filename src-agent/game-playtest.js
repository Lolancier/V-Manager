import path from "node:path";

export function normalizePlaytestLimits(raw = {}) {
  const seconds = Number(raw.maxSeconds);
  const actions = Number(raw.maxActions);
  return {
    maxSeconds: Number.isFinite(seconds) ? Math.min(60, Math.max(5, Math.round(seconds))) : 20,
    maxActions: Number.isFinite(actions) ? Math.min(120, Math.max(8, Math.round(actions))) : 40
  };
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function inferScore(state) {
  const exposed = [state?.highestScore, state?.highScore, state?.score, state?.points].map(numberOrNull).filter((value) => value != null);
  if (exposed.length) return Math.max(...exposed);
  const text = String(state?.bodyText || "");
  const match = text.match(/(?:最高分|得分|分数|score|points?)\s*[:：]?\s*(-?\d+(?:\.\d+)?)/i);
  return match ? Number(match[1]) : null;
}

function inferOutcome(state) {
  const status = String(state?.status || state?.gameStatus || "").toLowerCase();
  const text = `${status} ${state?.message || ""} ${state?.bodyText || ""}`;
  if (/\b(won|win|victory|success)\b|胜利|通关|完成挑战/i.test(text)) return "won";
  if (/\b(lost|lose|gameover|game over|failed)\b|失败|游戏结束|未接住/i.test(text)) return "lost";
  return "ran";
}

function chooseKey(state, index) {
  const recommended = Array.isArray(state?.recommendedActions) ? state.recommendedActions : [];
  const key = recommended[index % Math.max(1, recommended.length)];
  if (typeof key === "string" && /^[\w ]+$|^Arrow(?:Left|Right|Up|Down)$/.test(key)) return key;
  return ["Enter", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"][index % 6];
}

async function withTimeout(promise, milliseconds, message, signal) {
  let timer;
  let abortHandler;
  try {
    return await Promise.race([
      promise,
      new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); }),
      new Promise((_resolve, reject) => {
        abortHandler = () => reject(Object.assign(new Error("试玩已终止。"), { name: "AbortError" }));
        if (signal?.aborted) abortHandler();
        else signal?.addEventListener("abort", abortHandler, { once: true });
      })
    ]);
  } finally {
    clearTimeout(timer);
    if (abortHandler) signal?.removeEventListener("abort", abortHandler);
  }
}

export async function runGamePlaytest(options = {}) {
  const limits = normalizePlaytestLimits(options);
  if (!options.artifactPath || path.extname(options.artifactPath).toLowerCase() !== ".html") throw new Error("试玩目标必须是沙盒内的 HTML 游戏。");
  if (typeof options.createDriver !== "function") throw new Error("缺少隔离试玩窗口驱动。");
  const startedAt = new Date();
  let driver = null;
  let actions = 0;
  let highestScore = null;
  let lastState = null;
  let outcome = "ran";
  const observedStates = new Set();
  const timeline = [];
  const progress = (stage, label, extra = {}) => {
    const entry = { stage, label, actions, highestScore, at: new Date().toISOString(), ...extra };
    timeline.push(entry);
    options.onProgress?.(entry);
  };
  try {
    progress("creating", "正在创建隔离试玩环境");
    driver = await withTimeout(options.createDriver(options.artifactPath), 5_000, "创建隔离试玩窗口超时。", options.signal);
    progress("loading", "正在加载小游戏");
    await withTimeout(driver.load(), 10_000, "小游戏加载超时。", options.signal);
    progress("reading", "正在读取游戏规则和可用操作");
    lastState = await withTimeout(driver.readState(), 3_000, "读取游戏状态超时。", options.signal);
    if (lastState?.buttons?.length) {
      progress("starting", `点击“${lastState.buttons[0].text || "开始"}”`);
      await withTimeout(driver.click(lastState.buttons[0].x, lastState.buttons[0].y), 2_000, "点击开始按钮超时。", options.signal);
      actions += 1;
      await withTimeout(driver.wait(250), 1_000, "等待游戏响应超时。", options.signal);
    }
    while (actions < limits.maxActions && Date.now() - startedAt.getTime() < limits.maxSeconds * 1000) {
      if (options.signal?.aborted) throw Object.assign(new Error("试玩已终止。"), { name: "AbortError" });
      lastState = await withTimeout(driver.readState(), 3_000, "读取游戏状态超时。", options.signal);
      observedStates.add(JSON.stringify([lastState?.status, lastState?.gameStatus, lastState?.score, lastState?.highestScore, String(lastState?.bodyText || "").slice(0, 300)]));
      const score = inferScore(lastState);
      if (score != null) highestScore = highestScore == null ? score : Math.max(highestScore, score);
      outcome = inferOutcome(lastState);
      if (outcome === "won" || outcome === "lost") break;

      if (lastState?.canvas && actions % 4 === 3) {
        const column = (actions % 3 + 1) / 4;
        if (actions % 4 === 3) progress("playing", `正在试玩 · 第 ${actions + 1}/${limits.maxActions} 次操作`, { message: String(lastState?.message || "").slice(0, 160) });
        await withTimeout(driver.click(lastState.canvas.x + lastState.canvas.width * column, lastState.canvas.y + lastState.canvas.height * 0.55), 2_000, "游戏点击操作超时。", options.signal);
      } else {
        const key = chooseKey(lastState, actions);
        if (actions % 4 === 0) progress("playing", `正在试玩 · 第 ${actions + 1}/${limits.maxActions} 次操作`, { key, message: String(lastState?.message || "").slice(0, 160) });
        await withTimeout(driver.key(key), 2_000, "游戏按键操作超时。", options.signal);
      }
      actions += 1;
      await withTimeout(driver.wait(220), 1_000, "等待游戏响应超时。", options.signal);
    }
    progress("scoring", "正在读取最终分数和输赢结果");
    lastState = await withTimeout(driver.readState(), 3_000, "读取最终游戏状态超时。", options.signal);
    const finalScore = inferScore(lastState);
    if (finalScore != null) highestScore = highestScore == null ? finalScore : Math.max(highestScore, finalScore);
    outcome = inferOutcome(lastState);
    progress("screenshot", "正在保存试玩截图");
    const screenshotPath = await withTimeout(driver.screenshot(options.screenshotPath), 8_000, "保存试玩截图超时。", options.signal);
    const errors = driver.errors?.() || [];
    const hasContent = Boolean(String(lastState?.bodyText || "").trim() || lastState?.canvas || lastState?.buttons?.length);
    const fatal = errors.some((item) => ["page-error", "render-gone", "load-failed", "unresponsive"].includes(item.type));
    const result = {
      ok: hasContent && !fatal,
      outcome: hasContent && !fatal ? outcome : "failed",
      highestScore,
      actions,
      durationMs: Date.now() - startedAt.getTime(),
      screenshotPath,
      state: {
        protocolDetected: Boolean(lastState?.protocolDetected),
        stateChanged: observedStates.size > 1,
        status: String(lastState?.status || lastState?.gameStatus || ""),
        message: String(lastState?.message || "").slice(0, 300),
        bodyText: String(lastState?.bodyText || "").slice(0, 1000)
      },
      errors: errors.slice(0, 20),
      timeline
    };
    progress("completed", result.ok ? "试玩完成" : "试玩完成，但检测到运行问题", { outcome: result.outcome });
    return result;
  } catch (error) {
    const cancelled = error?.name === "AbortError" || options.signal?.aborted;
    progress(cancelled ? "cancelled" : "error", cancelled ? "试玩已按你的要求停止" : "试玩过程中出现错误", { error: String(error?.message || error).slice(0, 300) });
    return {
      ok: false,
      outcome: cancelled ? "cancelled" : "failed",
      cancelled,
      highestScore,
      actions,
      durationMs: Date.now() - startedAt.getTime(),
      screenshotPath: "",
      state: lastState || {},
      errors: [...(driver?.errors?.() || []), { type: cancelled ? "playtest-cancelled" : "playtest-error", message: String(error?.message || error).slice(0, 500) }].slice(0, 20),
      timeline
    };
  } finally {
    await withTimeout(driver?.close() ?? Promise.resolve(), 5_000, "关闭试玩窗口超时。").catch(() => {});
  }
}

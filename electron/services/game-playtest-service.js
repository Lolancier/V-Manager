export function createGamePlaytestService(options) {
  if (typeof options?.runPlaytest !== "function") throw new Error("缺少小游戏试玩执行器。");
  if (typeof options?.createDriver !== "function") throw new Error("缺少小游戏隔离窗口驱动。");
  const active = new Set();
  let disposed = false;

  return {
    async run(runOptions = {}) {
      if (disposed) throw new Error("小游戏试玩服务已经关闭。");
      const controller = new AbortController();
      const abort = () => controller.abort();
      if (runOptions.signal?.aborted) abort();
      else runOptions.signal?.addEventListener("abort", abort, { once: true });
      active.add(controller);
      try {
        return await options.runPlaytest({
          ...runOptions,
          signal: controller.signal,
          createDriver: options.createDriver
        });
      } finally {
        runOptions.signal?.removeEventListener("abort", abort);
        active.delete(controller);
      }
    },
    dispose() {
      if (disposed) return false;
      disposed = true;
      for (const controller of active) controller.abort();
      return true;
    },
    snapshot() {
      return { disposed, active: active.size };
    }
  };
}

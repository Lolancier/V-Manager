import path from "node:path";

function asEnsureResult(index) {
  if (typeof index?.rebuilt === "boolean") return index;
  return {
    rebuilt: true,
    indexedFileCount: Array.isArray(index?.files) ? index.files.length : 0,
    indexedChunkCount: Array.isArray(index?.chunks) ? index.chunks.length : 0,
    embeddedChunkCount: Number(index?.embeddedCount) || 0,
    updatedAt: index?.updatedAt ?? null
  };
}

function cancellationError(signal) {
  if (signal?.reason instanceof Error) return signal.reason;
  const error = new Error("后台 RAG 任务在排队期间已取消。");
  error.name = "AbortError";
  return error;
}

export function createRagTaskClient(options) {
  const states = new Map();

  const stateFor = (baseDir) => {
    const resolvedBaseDir = path.resolve(baseDir);
    let state = states.get(resolvedBaseDir);
    if (!state) {
      state = { baseDir: resolvedBaseDir, tail: Promise.resolve(), tasks: new Map(), barriers: 0 };
      states.set(resolvedBaseDir, state);
    }
    return state;
  };

  const schedule = (type, baseDir, runOptions) => {
    const state = stateFor(baseDir);
    if (state.tasks.has(type)) return state.tasks.get(type);
    if (type === "rag:ensure" && state.tasks.has("rag:rebuild")) {
      const joined = state.tasks.get("rag:rebuild").then(asEnsureResult);
      state.tasks.set(type, joined);
      void joined.finally(() => {
        if (state.tasks.get(type) === joined) state.tasks.delete(type);
        if (state.tasks.size === 0 && state.barriers === 0) states.delete(state.baseDir);
      }).catch(() => {});
      return joined;
    }
    let publishExecution;
    const executionReady = new Promise((resolve) => { publishExecution = resolve; });
    state.barriers += 1;
    const barrier = state.tail
      .catch(() => {})
      .then(() => {
        if (runOptions?.signal?.aborted) {
          const cancelled = Promise.reject(cancellationError(runOptions.signal));
          void cancelled.catch(() => {});
          publishExecution(cancelled);
          return cancelled;
        }
        const execution = options.supervisor.run(type, { baseDir: state.baseDir }, runOptions);
        publishExecution(execution);
        return execution.completion || execution;
      });
    state.tail = barrier;
    const task = executionReady.then((execution) => execution);
    state.tasks.set(type, task);
    void task.finally(() => {
      if (state.tasks.get(type) === task) state.tasks.delete(type);
      if (state.tasks.size === 0 && state.barriers === 0) states.delete(state.baseDir);
    }).catch(() => {});
    void barrier.finally(() => {
      state.barriers -= 1;
      if (state.tasks.size === 0 && state.barriers === 0) states.delete(state.baseDir);
    }).catch(() => {});
    return task;
  };

  return {
    ensure(baseDir, runOptions) {
      return schedule("rag:ensure", baseDir, runOptions);
    },
    rebuild(baseDir, runOptions) {
      return schedule("rag:rebuild", baseDir, runOptions);
    },
    snapshot() {
      return [...states.values()].map((state) => ({ baseDir: state.baseDir, tasks: [...state.tasks.keys()], barriers: state.barriers }));
    }
  };
}

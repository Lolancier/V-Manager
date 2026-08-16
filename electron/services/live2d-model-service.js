import fs from "node:fs/promises";
import { watch } from "node:fs";
import path from "node:path";
import { saveConfig } from "../../src-agent/core.js";

export const LIVE2D_MODEL_HANDLE_CHANNELS = Object.freeze([
  "agent:get-live2d-models",
  "agent:refresh-live2d-models",
  "agent:open-live2d-models-folder"
]);

const builtInLive2DModels = [
  { id: "qianqian", label: "芊芊", detail: "完整表情、形态与动作适配", builtIn: true, capabilities: { expressionCount: 32, motionGroupCount: 2, hasLipSync: true, hasEyeBlink: true, hasDisplayInfo: true } },
  { id: "hiyori", label: "Hiyori", detail: "通用参数适配 · 动作 2 组", builtIn: true, capabilities: { expressionCount: 0, motionGroupCount: 2, hasLipSync: true, hasEyeBlink: true, hasDisplayInfo: true } },
  { id: "epsilon", label: "Epsilon", detail: "通用参数 + 8 个原生表情", builtIn: true, capabilities: { expressionCount: 8, motionGroupCount: 6, hasLipSync: true, hasEyeBlink: true, hasDisplayInfo: true } }
];

export async function findModelFiles(fsImpl, root, directory = root, depth = 0) {
  if (depth > 4) return [];
  const entries = await fsImpl.readdir(directory, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await findModelFiles(fsImpl, root, target, depth + 1));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".model3.json")) files.push(target);
  }
  return files;
}

export function createLive2DModelService(options) {
  const dependencies = {
    fs,
    watch,
    saveConfig: options.saveConfig || saveConfig,
    setTimeout: options.setTimeout || globalThis.setTimeout,
    clearTimeout: options.clearTimeout || globalThis.clearTimeout,
    ...(options.dependencies || {})
  };
  const registeredChannels = new Set();
  const customModelRoots = new Map();
  let modelOptions = [...builtInLive2DModels];
  let directoryWatcher = null;
  let scanTimer = null;
  let refreshPromise = null;
  let startPromise = null;
  let stopPromise = null;
  let disposePromise = null;
  let started = false;
  let disposed = false;
  let lifecycleGeneration = 0;

  const baseDir = () => options.getBaseDir();
  const modelsDirectory = () => path.join(baseDir(), "agent-data", "models");

  async function readCustomModelOption(root, modelFile) {
    try {
      const definition = JSON.parse(await dependencies.fs.readFile(modelFile, "utf8"));
      const modelRoot = path.dirname(modelFile);
      const requiredFiles = [definition?.FileReferences?.Moc, ...(definition?.FileReferences?.Textures ?? [])]
        .filter(Boolean)
        .map((file) => path.resolve(modelRoot, file));
      if (!definition?.FileReferences?.Moc || requiredFiles.some((file) => {
        const relative = path.relative(modelRoot, file);
        return relative.startsWith("..") || path.isAbsolute(relative);
      })) return null;
      for (const file of requiredFiles) await dependencies.fs.access(file);

      const relativeModelFile = path.relative(root, modelFile).replaceAll("\\", "/");
      const id = `custom-${Buffer.from(relativeModelFile).toString("base64url")}`;
      const baseName = path.basename(modelFile).replace(/\.model3\.json$/i, "");
      const parentName = path.basename(modelRoot);
      const expressions = definition?.FileReferences?.Expressions ?? [];
      const motions = definition?.FileReferences?.Motions ?? {};
      const groups = definition?.Groups ?? [];
      const hasGroup = (name) => groups.some((group) => String(group?.Name || "").toLowerCase() === name.toLowerCase() && (group?.Ids?.length ?? 0) > 0);
      const capabilities = {
        expressionCount: expressions.length,
        motionGroupCount: Object.keys(motions).length,
        hasLipSync: hasGroup("LipSync"),
        hasEyeBlink: hasGroup("EyeBlink"),
        hasDisplayInfo: Boolean(definition?.FileReferences?.DisplayInfo)
      };
      const abilityLabels = [
        expressions.length ? `${expressions.length} 个原生表情` : "通用参数",
        capabilities.hasLipSync ? "口型" : null,
        capabilities.hasEyeBlink ? "眨眼" : null
      ].filter(Boolean);
      return {
        id,
        label: baseName || parentName,
        detail: `用户模型 · ${abilityLabels.join(" + ")} · ${path.relative(root, modelRoot) || parentName}`,
        directory: `vivi-model://local/${encodeURIComponent(id)}/`,
        fileName: path.basename(modelFile),
        builtIn: false,
        capabilities,
        root: modelRoot
      };
    } catch {
      return null;
    }
  }

  function refreshModels({ broadcast = true } = {}) {
    if (disposed) return Promise.reject(new Error("Live2D 模型服务已经释放。"));
    if (stopPromise) return Promise.reject(new Error("Live2D 模型服务正在停止。"));
    if (refreshPromise?.generation === lifecycleGeneration) return refreshPromise.promise;
    const generation = lifecycleGeneration;
    const isActive = () => !disposed && generation === lifecycleGeneration;
    const ownPromise = (async () => {
      const root = modelsDirectory();
      await dependencies.fs.mkdir(root, { recursive: true });
      const customModels = (await Promise.all(
        (await findModelFiles(dependencies.fs, root)).map((file) => readCustomModelOption(root, file))
      )).filter(Boolean);

      const nextModelOptions = [
        ...builtInLive2DModels,
        ...customModels.map(({ root: _root, ...model }) => model)
      ];
      let nextConfig = null;

      if (!nextModelOptions.some((model) => model.id === options.getConfig().appearance?.live2dModel)) {
        nextConfig = options.mergeConfig({
          ...options.getConfig(),
          appearance: { ...options.getConfig().appearance, live2dModel: "qianqian" }
        });
      }

      if (nextConfig && isActive()) await dependencies.saveConfig(baseDir(), nextConfig);
      if (!isActive()) throw new Error("Live2D 模型扫描已被停止。");

      customModelRoots.clear();
      for (const model of customModels) customModelRoots.set(model.id, model.root);
      modelOptions = nextModelOptions;
      if (nextConfig) {
        options.setConfig(nextConfig);
        options.broadcastConfigUpdated(nextConfig);
      }
      if (broadcast) options.broadcastModels(nextModelOptions);
      return nextModelOptions;
    })();
    refreshPromise = { promise: ownPromise, generation };
    void ownPromise.then(() => {
      if (refreshPromise?.promise === ownPromise) refreshPromise = null;
    }, () => {
      if (refreshPromise?.promise === ownPromise) refreshPromise = null;
    });
    return ownPromise;
  }

  function startWatcher(generation) {
    if (disposed || generation !== lifecycleGeneration || directoryWatcher) return;
    directoryWatcher = dependencies.watch(modelsDirectory(), { recursive: true }, () => {
      if (disposed || !started || generation !== lifecycleGeneration) return;
      if (scanTimer) dependencies.clearTimeout(scanTimer);
      scanTimer = dependencies.setTimeout(() => {
        scanTimer = null;
        void refreshModels().catch((error) => options.onError?.("watch-refresh", error));
      }, 500);
    });
  }

  function register(channel, listener) {
    options.trustedIpc.handle(channel, listener);
    registeredChannels.add(channel);
  }

  function registerIpc() {
    if (disposed) throw new Error("Live2D 模型服务已经释放。");
    try {
      register("agent:get-live2d-models", () => modelOptions);
      register("agent:refresh-live2d-models", () => refreshModels());
      register("agent:open-live2d-models-folder", async () => {
        const root = modelsDirectory();
        await dependencies.fs.mkdir(root, { recursive: true });
        return options.openPath(root);
      });
    } catch (error) {
      for (const channel of registeredChannels) options.trustedIpc.removeHandler(channel);
      registeredChannels.clear();
      throw error;
    }
    return service;
  }

  function start(startOptions = {}) {
    if (disposed) return Promise.reject(new Error("Live2D 模型服务已经释放。"));
    if (stopPromise) return Promise.reject(new Error("Live2D 模型服务正在停止。"));
    if (started) return Promise.resolve(snapshot());
    if (startPromise?.generation === lifecycleGeneration) return startPromise.promise;
    const generation = lifecycleGeneration;
    const ownPromise = (async () => {
      if (startOptions.refresh !== false) await refreshModels({ broadcast: startOptions.broadcast !== false });
      if (disposed || generation !== lifecycleGeneration) throw new Error("Live2D 模型服务启动已被停止。");
      startWatcher(generation);
      started = true;
      return snapshot();
    })();
    startPromise = { promise: ownPromise, generation };
    void ownPromise.then(() => {
      if (startPromise?.promise === ownPromise) startPromise = null;
    }, () => {
      if (startPromise?.promise === ownPromise) startPromise = null;
    });
    return ownPromise;
  }

  function stop() {
    if (stopPromise) return stopPromise;
    lifecycleGeneration += 1;
    started = false;
    if (scanTimer) dependencies.clearTimeout(scanTimer);
    scanTimer = null;
    directoryWatcher?.close();
    directoryWatcher = null;
    const convergence = refreshPromise
      ? refreshPromise.promise.catch(() => {})
      : Promise.resolve();
    const ownPromise = convergence.then(() => {
      if (stopPromise === ownPromise) stopPromise = null;
      return snapshot();
    });
    stopPromise = ownPromise;
    return ownPromise;
  }

  function dispose() {
    if (disposePromise) return disposePromise;
    disposed = true;
    const ownPromise = stop().then(() => {
      for (const channel of registeredChannels) options.trustedIpc.removeHandler(channel);
      registeredChannels.clear();
      return snapshot();
    });
    disposePromise = ownPromise;
    void ownPromise.catch(() => {});
    return ownPromise;
  }

  function snapshot() {
    return {
      started,
      disposed,
      models: modelOptions.length,
      customModels: customModelRoots.size,
      watching: Boolean(directoryWatcher),
      refreshing: Boolean(refreshPromise?.generation === lifecycleGeneration && refreshPromise),
      stopping: Boolean(stopPromise),
      channels: [...registeredChannels]
    };
  }

  const service = {
    dispose,
    getModelRoot: (modelId) => customModelRoots.get(modelId),
    getModels: () => modelOptions,
    modelsDirectory,
    refreshModels,
    registerIpc,
    snapshot,
    start,
    stop
  };
  return service;
}

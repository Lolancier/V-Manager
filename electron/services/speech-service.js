import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { generateAsmrScript } from "../../src-agent/core.js";
import { listElevenLabsVoices, synthesizeElevenLabsSpeech } from "../../src-agent/elevenlabs.js";
import { installLocalTtsPack, listLocalTtsPacks, synthesizeLocalSpeech } from "../../src-agent/local-tts.js";
import { importGptSovitsProfile, installGptSovitsProfile, listGptSovitsProfiles, synthesizeGptSovitsSpeech } from "../../src-agent/gpt-sovits.js";
import { getLocalSttStatus, installLocalStt, transcribeLocalSpeech } from "../../src-agent/local-stt.js";
import { pruneAudioCache, touchAudioCacheFile } from "../../src-agent/audio-cache.js";
import { sanitizeSpeechText } from "../../src-agent/speech-text.js";
import { ensureGptSovitsService, isGptSovitsServiceReady, stopGptSovitsService } from "../../src-agent/gpt-sovits-runtime.js";

export const SPEECH_HANDLE_CHANNELS = Object.freeze([
  "agent:select-asmr-text-file",
  "agent:generate-asmr-script",
  "agent:list-elevenlabs-voices",
  "agent:synthesize-speech",
  "agent:list-local-tts-packs",
  "agent:install-local-tts-pack",
  "agent:open-local-tts-folder",
  "agent:list-gpt-sovits-profiles",
  "agent:install-gpt-sovits-profile",
  "agent:import-gpt-sovits-profile",
  "agent:get-gpt-sovits-runtime-status",
  "agent:start-gpt-sovits-runtime",
  "agent:stop-gpt-sovits-runtime",
  "agent:get-local-stt-status",
  "agent:install-local-stt",
  "agent:transcribe-local-speech",
  "agent:open-local-stt-folder"
]);

export const SPEECH_EVENT_CHANNELS = Object.freeze(["agent:speech-signal"]);

const defaultDependencies = {
  generateAsmrScript,
  listElevenLabsVoices,
  synthesizeElevenLabsSpeech,
  installLocalTtsPack,
  listLocalTtsPacks,
  synthesizeLocalSpeech,
  importGptSovitsProfile,
  installGptSovitsProfile,
  listGptSovitsProfiles,
  synthesizeGptSovitsSpeech,
  getLocalSttStatus,
  installLocalStt,
  transcribeLocalSpeech,
  pruneAudioCache,
  touchAudioCacheFile,
  sanitizeSpeechText,
  ensureGptSovitsService,
  isGptSovitsServiceReady,
  stopGptSovitsService
};

const removeAudioCache = (cacheDir) => fs.rm(cacheDir, { recursive: true, force: true });

function normalizeProvider(value) {
  if (["local", "gpt_sovits", "elevenlabs"].includes(value)) return value;
  throw new Error("语音 provider 必须明确选择 local、gpt_sovits 或 elevenlabs。");
}

function cacheDescriptor(voiceConfig, text, asmr, sanitize, generation) {
  const speechText = sanitize(text);
  if (!speechText) throw new Error("回复中只有舞台动作或内心独白，没有可朗读的正文。");
  const provider = normalizeProvider(voiceConfig.provider);
  const common = { text: speechText, asmr: Boolean(asmr), provider, generation };
  const settings = provider === "local"
    ? {
        localPackId: voiceConfig.localPackId ?? null,
        localSpeakerId: voiceConfig.localSpeakerId ?? null,
        localSpeed: voiceConfig.localSpeed ?? null,
        localSilenceScale: voiceConfig.localSilenceScale ?? null
      }
    : provider === "gpt_sovits"
      ? {
          gptSovitsBaseUrl: voiceConfig.gptSovitsBaseUrl ?? null,
          gptSovitsProfileId: voiceConfig.gptSovitsProfileId ?? null,
          gptSovitsSpeed: voiceConfig.gptSovitsSpeed ?? null,
          gptSovitsAutoStart: voiceConfig.gptSovitsAutoStart !== false
        }
      : {
          baseUrl: voiceConfig.baseUrl ?? null,
          model: voiceConfig.model ?? null,
          voice: voiceConfig.voice ?? null,
          outputFormat: voiceConfig.outputFormat ?? null,
          speed: voiceConfig.speed ?? null,
          stability: voiceConfig.stability ?? null,
          similarityBoost: voiceConfig.similarityBoost ?? null
        };
  const key = createHash("sha256").update(JSON.stringify({ ...common, ...settings })).digest("hex");
  return { key, speechText, provider, asmr: Boolean(asmr) };
}

export function createSpeechSynthesizer(options) {
  const dependencies = { ...defaultDependencies, ...(options.dependencies || {}) };
  const inFlight = new Map();
  let generation = 0;
  let cacheMutation = Promise.resolve();
  const mutateCache = (operation) => {
    const task = cacheMutation.then(operation, operation);
    cacheMutation = task.catch(() => {});
    return task;
  };
  const synthesizeSpeechWithCache = (voiceConfig = {}, text, asmr) => {
    const taskGeneration = generation;
    let descriptor;
    try {
      descriptor = cacheDescriptor(voiceConfig, text, asmr, dependencies.sanitizeSpeechText, taskGeneration);
    } catch (error) {
      return Promise.reject(error);
    }
    if (inFlight.has(descriptor.key)) return inFlight.get(descriptor.key);
    const task = (async () => {
      const baseDir = options.getBaseDir();
      const cacheDir = path.join(baseDir, "agent-data", "audio-cache");
      const usesWav = descriptor.provider !== "elevenlabs";
      const audioPath = path.join(cacheDir, `${descriptor.key}.${usesWav ? "wav" : "mp3"}`);
      await fs.mkdir(cacheDir, { recursive: true });
      await dependencies.pruneAudioCache(cacheDir);
      const cached = await fs.readFile(audioPath).catch(() => null);
      if (cached && generation === taskGeneration) {
        await dependencies.touchAudioCacheFile(audioPath);
        await dependencies.pruneAudioCache(cacheDir, { preserve: [audioPath] });
        return { audioBase64: cached.toString("base64"), mimeType: usesWav ? "audio/wav" : "audio/mpeg", requestId: "cache", characterCost: "0", cached: true };
      }

      let result;
      if (descriptor.provider === "local") {
        result = await dependencies.synthesizeLocalSpeech(baseDir, voiceConfig, descriptor.speechText);
      } else if (descriptor.provider === "gpt_sovits") {
        if (voiceConfig.gptSovitsAutoStart !== false) {
          await dependencies.ensureGptSovitsService(voiceConfig.gptSovitsBaseUrl, { fetchImpl: options.fetch });
        } else if (!await dependencies.isGptSovitsServiceReady(voiceConfig.gptSovitsBaseUrl, options.fetch)) {
          throw new Error("GPT-SoVITS 当前未运行。请到“设置 → 语音与 ASMR”手动启动，或开启“随 V-Manager 启动”。");
        }
        result = await dependencies.synthesizeGptSovitsSpeech(baseDir, voiceConfig, descriptor.speechText, options.fetch);
      } else {
        result = await dependencies.synthesizeElevenLabsSpeech(voiceConfig, descriptor.speechText, { asmr: descriptor.asmr, fetchImpl: options.fetch });
      }

      await mutateCache(async () => {
        if (generation !== taskGeneration) return;
        await fs.mkdir(cacheDir, { recursive: true });
        const temporaryPath = `${audioPath}.part`;
        await fs.unlink(temporaryPath).catch(() => {});
        try {
          await fs.writeFile(temporaryPath, Buffer.from(result.audioBase64, "base64"));
          await fs.rename(temporaryPath, audioPath);
        } finally {
          await fs.unlink(temporaryPath).catch(() => {});
        }
        await dependencies.pruneAudioCache(cacheDir, { preserve: [audioPath] });
      });
      return { ...result, cached: false };
    })();
    const trackedTask = task.finally(() => {
      if (inFlight.get(descriptor.key) === trackedTask) inFlight.delete(descriptor.key);
    });
    inFlight.set(descriptor.key, trackedTask);
    return trackedTask;
  };
  synthesizeSpeechWithCache.invalidateCache = async () => {
    generation += 1;
    const cacheDir = path.join(options.getBaseDir(), "agent-data", "audio-cache");
    await mutateCache(() => (dependencies.removeAudioCache || removeAudioCache)(cacheDir));
  };
  return synthesizeSpeechWithCache;
}

function normalizeSpeechSignal(signal) {
  return {
    active: Boolean(signal?.active),
    level: Math.max(0, Math.min(1, Number(signal?.level) || 0)),
    phase: ["start", "end", "fallback"].includes(signal?.phase) ? signal.phase : undefined,
    text: typeof signal?.text === "string" ? signal.text : undefined,
    durationMs: Number.isFinite(Number(signal?.durationMs)) ? Number(signal.durationMs) : undefined,
    finalSegment: Boolean(signal?.finalSegment),
    mood: typeof signal?.mood === "string" ? signal.mood : undefined,
    faceParams: signal?.faceParams && typeof signal.faceParams === "object" ? signal.faceParams : undefined
  };
}

export function registerSpeechServiceIpc(options) {
  const dependencies = { ...defaultDependencies, ...(options.dependencies || {}) };
  const synthesizeSpeech = createSpeechSynthesizer({ getBaseDir: options.getBaseDir, fetch: options.fetch, dependencies });
  const getConfig = async () => options.mergeConfig(await options.loadConfig(options.getBaseDir()));
  const currentVoiceConfig = () => options.getCurrentConfig().voice;
  const currentSpeechInputConfig = () => options.getCurrentConfig().speechInput;
  const handlers = new Map([
    ["agent:select-asmr-text-file", async () => {
      const result = await options.showOpenDialog({
        title: "导入 ASMR 文本",
        properties: ["openFile"],
        filters: [{ name: "文本", extensions: ["txt", "md"] }]
      });
      if (result.canceled || !result.filePaths[0]) return null;
      const content = await fs.readFile(result.filePaths[0], "utf8");
      return { path: result.filePaths[0], content: content.slice(0, 200000) };
    }],
    ["agent:generate-asmr-script", async (_event, payload) => dependencies.generateAsmrScript(options.getBaseDir(), payload ?? {}, options.fetch)],
    ["agent:list-elevenlabs-voices", async (_event, voiceOverride) => {
      const config = await getConfig();
      return dependencies.listElevenLabsVoices({ ...config.voice, ...(voiceOverride ?? {}) }, options.fetch);
    }],
    ["agent:synthesize-speech", async (_event, payload) => {
      const config = await getConfig();
      return synthesizeSpeech({ ...config.voice, ...(payload?.voiceConfig ?? {}) }, payload?.text, Boolean(payload?.asmr));
    }],
    ["agent:list-local-tts-packs", async () => dependencies.listLocalTtsPacks(options.getBaseDir())],
    ["agent:install-local-tts-pack", async (_event, packId) => dependencies.installLocalTtsPack(options.getBaseDir(), packId, options.broadcastLocalTtsProgress, options.fetch)],
    ["agent:open-local-tts-folder", async () => {
      const target = path.join(options.getBaseDir(), "agent-data", "tts-models");
      await fs.mkdir(target, { recursive: true });
      await options.openPath(target);
      return target;
    }],
    ["agent:list-gpt-sovits-profiles", async () => dependencies.listGptSovitsProfiles(options.getBaseDir())],
    ["agent:install-gpt-sovits-profile", async (_event, profileId) => {
      const result = await dependencies.installGptSovitsProfile(options.getBaseDir(), profileId, options.broadcastGptSovitsProgress, options.fetch);
      await synthesizeSpeech.invalidateCache();
      return result;
    }],
    ["agent:import-gpt-sovits-profile", async (_event, input) => {
      const selection = await options.showOpenDialog({
        title: "选择 GPT、SoVITS 权重和参考音频（共 3 个文件）",
        properties: ["openFile", "multiSelections"],
        filters: [{ name: "GPT-SoVITS 声线文件", extensions: ["ckpt", "pth", "wav", "mp3", "flac", "ogg", "m4a"] }]
      });
      if (selection.canceled) return null;
      const result = await dependencies.importGptSovitsProfile(options.getBaseDir(), input, selection.filePaths);
      await synthesizeSpeech.invalidateCache();
      return result;
    }],
    ["agent:get-gpt-sovits-runtime-status", async (_event, baseUrl) => ({ ready: await dependencies.isGptSovitsServiceReady(baseUrl || currentVoiceConfig().gptSovitsBaseUrl, options.fetch) })],
    ["agent:start-gpt-sovits-runtime", async (_event, baseUrl) => dependencies.ensureGptSovitsService(baseUrl || currentVoiceConfig().gptSovitsBaseUrl, { fetchImpl: options.fetch })],
    ["agent:stop-gpt-sovits-runtime", async (_event, baseUrl) => dependencies.stopGptSovitsService(baseUrl || currentVoiceConfig().gptSovitsBaseUrl, options.fetch)],
    ["agent:get-local-stt-status", async (_event, modelId) => {
      const config = await getConfig();
      return dependencies.getLocalSttStatus(options.getBaseDir(), modelId || config.speechInput.model);
    }],
    ["agent:install-local-stt", async (_event, modelId) => dependencies.installLocalStt(options.getBaseDir(), modelId, options.broadcastSttProgress, options.fetch)],
    ["agent:transcribe-local-speech", async (_event, audioBytes) => {
      const config = await getConfig();
      return dependencies.transcribeLocalSpeech(options.getBaseDir(), audioBytes, config.speechInput);
    }],
    ["agent:open-local-stt-folder", async () => {
      const status = await dependencies.getLocalSttStatus(options.getBaseDir(), currentSpeechInputConfig().model);
      await fs.mkdir(status.root, { recursive: true });
      return options.openPath(status.root);
    }]
  ]);

  const registeredHandles = [];
  let disposeSpeechSignal = null;
  try {
    for (const [channel, handler] of handlers) {
      options.trustedIpc.handle(channel, handler);
      registeredHandles.push(channel);
    }
    disposeSpeechSignal = options.trustedIpc.on("agent:speech-signal", (_event, signal) => options.broadcastSpeechSignal(normalizeSpeechSignal(signal)));
  } catch (error) {
    for (const channel of registeredHandles.reverse()) {
      try { options.trustedIpc.removeHandler(channel); } catch { /* preserve the registration failure */ }
    }
    try { disposeSpeechSignal?.(); } catch { /* preserve the registration failure */ }
    throw error;
  }
  let disposed = false;
  return {
    ensureGptSovitsRuntime(baseUrl) {
      return dependencies.ensureGptSovitsService(baseUrl || currentVoiceConfig().gptSovitsBaseUrl, { fetchImpl: options.fetch });
    },
    stopGptSovitsRuntime(baseUrl) {
      return dependencies.stopGptSovitsService(baseUrl || currentVoiceConfig().gptSovitsBaseUrl, options.fetch);
    },
    dispose() {
      if (disposed) return;
      for (const channel of handlers.keys()) options.trustedIpc.removeHandler(channel);
      disposeSpeechSignal?.();
      disposed = true;
    }
  };
}

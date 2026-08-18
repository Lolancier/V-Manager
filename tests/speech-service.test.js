import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createSpeechSynthesizer, registerSpeechServiceIpc, SPEECH_EVENT_CHANNELS, SPEECH_HANDLE_CHANNELS } from "../electron/services/speech-service.js";
import { createTrustedIpcRegistrar } from "../electron/ipc-security.js";

const audioResult = (label = "audio") => ({
  audioBase64: Buffer.from(label).toString("base64"),
  mimeType: "audio/mpeg",
  requestId: label,
  characterCost: "0"
});

async function temporaryBase(t) {
  const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "v-manager-speech-"));
  t.after(() => fs.rm(baseDir, { recursive: true, force: true }));
  return baseDir;
}

function synthesizerDependencies(overrides = {}) {
  return {
    sanitizeSpeechText: (text) => String(text || "").trim(),
    pruneAudioCache: async () => {},
    touchAudioCacheFile: async () => {},
    synthesizeLocalSpeech: async () => audioResult("local"),
    synthesizeGptSovitsSpeech: async () => audioResult("gpt"),
    synthesizeElevenLabsSpeech: async () => audioResult("eleven"),
    ensureGptSovitsService: async () => ({ ready: true }),
    isGptSovitsServiceReady: async () => true,
    ...overrides
  };
}

test("same normalized cache key shares one in-flight provider call", async (t) => {
  const baseDir = await temporaryBase(t);
  let calls = 0;
  let release;
  let started;
  const providerStarted = new Promise((resolve) => { started = resolve; });
  const providerResult = new Promise((resolve) => { release = resolve; });
  const synthesize = createSpeechSynthesizer({
    getBaseDir: () => baseDir,
    dependencies: synthesizerDependencies({
      synthesizeLocalSpeech: async () => { calls += 1; started(); return providerResult; }
    })
  });
  const config = { provider: "local", localPackId: "pack", localSpeakerId: 0 };
  const first = synthesize(config, "  hello  ", false);
  const second = synthesize({ ...config }, "hello", false);
  assert.equal(first, second);
  await providerStarted;
  assert.equal(calls, 1);
  release(audioResult("shared"));
  assert.deepEqual(await first, await second);
});

test("different cache keys run concurrently instead of using a global synthesis lock", async (t) => {
  const baseDir = await temporaryBase(t);
  const releases = [];
  let calls = 0;
  let bothStarted;
  const started = new Promise((resolve) => { bothStarted = resolve; });
  const synthesize = createSpeechSynthesizer({
    getBaseDir: () => baseDir,
    dependencies: synthesizerDependencies({
      synthesizeLocalSpeech: async () => {
        calls += 1;
        if (calls === 2) bothStarted();
        return new Promise((resolve) => releases.push(resolve));
      }
    })
  });
  const config = { provider: "local", localPackId: "pack", localSpeakerId: 0 };
  const first = synthesize(config, "first", false);
  const second = synthesize({ ...config, localSpeakerId: 1 }, "second", false);
  await started;
  assert.equal(calls, 2);
  releases.forEach((resolve, index) => resolve(audioResult(`audio-${index}`)));
  await Promise.all([first, second]);
});

test("failed synthesis clears in-flight state and can be retried", async (t) => {
  const baseDir = await temporaryBase(t);
  let calls = 0;
  const synthesize = createSpeechSynthesizer({
    getBaseDir: () => baseDir,
    dependencies: synthesizerDependencies({
      synthesizeElevenLabsSpeech: async () => {
        calls += 1;
        if (calls === 1) throw new Error("provider failed");
        return audioResult("retry");
      }
    })
  });
  const config = { provider: "elevenlabs", voice: "voice-a" };
  await assert.rejects(synthesize(config, "retry me", false), /provider failed/);
  assert.equal((await synthesize(config, "retry me", false)).cached, false);
  assert.equal(calls, 2);
});

test("disk cache hit skips the provider", async (t) => {
  const baseDir = await temporaryBase(t);
  let calls = 0;
  const dependencies = synthesizerDependencies({
    synthesizeLocalSpeech: async () => { calls += 1; return audioResult("cached-audio"); }
  });
  const config = { provider: "local", localPackId: "pack", localSpeakerId: 0 };
  const firstSynthesizer = createSpeechSynthesizer({ getBaseDir: () => baseDir, dependencies });
  assert.equal((await firstSynthesizer(config, "cache me", false)).cached, false);
  const secondSynthesizer = createSpeechSynthesizer({ getBaseDir: () => baseDir, dependencies });
  const cached = await secondSynthesizer(config, "cache me", false);
  assert.equal(cached.cached, true);
  assert.equal(cached.audioBase64, audioResult("cached-audio").audioBase64);
  assert.equal(calls, 1);
});

test("provider selection is strict and calls exactly one provider", async (t) => {
  const baseDir = await temporaryBase(t);
  const calls = { local: 0, gpt: 0, eleven: 0 };
  const synthesize = createSpeechSynthesizer({
    getBaseDir: () => baseDir,
    dependencies: synthesizerDependencies({
      synthesizeLocalSpeech: async () => { calls.local += 1; return audioResult("local"); },
      synthesizeGptSovitsSpeech: async () => { calls.gpt += 1; return audioResult("gpt"); },
      synthesizeElevenLabsSpeech: async () => { calls.eleven += 1; return audioResult("eleven"); }
    })
  });
  await synthesize({ provider: "local", localPackId: "pack" }, "local text", false);
  await synthesize({ provider: "gpt_sovits", gptSovitsProfileId: "profile" }, "gpt text", false);
  await synthesize({ provider: "elevenlabs", voice: "voice" }, "eleven text", false);
  assert.deepEqual(calls, { local: 1, gpt: 1, eleven: 1 });

  await assert.rejects(synthesize({ provider: "" }, "invalid", false), /provider/);
  await assert.rejects(synthesize({ provider: "unknown" }, "invalid", false), /provider/);
  assert.deepEqual(calls, { local: 1, gpt: 1, eleven: 1 });
});

test("native speech synthesis routes through the background task supervisor when configured", async (t) => {
  const baseDir = await temporaryBase(t);
  const tasks = [];
  const synthesize = createSpeechSynthesizer({
    getBaseDir: () => baseDir,
    runBackgroundTask: async (type, payload, options) => {
      tasks.push({ type, payload, options });
      return audioResult(type);
    },
    dependencies: synthesizerDependencies({
      synthesizeLocalSpeech: async () => { throw new Error("主进程不应直接执行本地推理"); },
      synthesizeGptSovitsSpeech: async () => { throw new Error("主进程不应直接执行 GPT 推理"); },
      synthesizeElevenLabsSpeech: async () => { throw new Error("主进程不应直接执行云端语音"); }
    })
  });

  await synthesize({ provider: "local", localPackId: "pack" }, "local text", false);
  await synthesize({ provider: "gpt_sovits", gptSovitsProfileId: "profile" }, "gpt text", false);
  await synthesize({ provider: "elevenlabs", voice: "voice" }, "eleven text", true);
  assert.deepEqual(tasks.map((task) => task.type), [
    "speech:local-synthesize",
    "speech:gpt-synthesize",
    "speech:elevenlabs-synthesize"
  ]);
  assert.equal(tasks[0].payload.baseDir, baseDir);
  assert.equal(tasks[2].payload.asmr, true);
});

test("unknown provider is rejected before cache directory creation", async (t) => {
  const baseDir = await temporaryBase(t);
  const synthesize = createSpeechSynthesizer({ getBaseDir: () => baseDir, dependencies: synthesizerDependencies() });
  await assert.rejects(synthesize({ provider: "" }, "invalid", false), /provider/);
  await assert.rejects(fs.access(path.join(baseDir, "agent-data", "audio-cache")));
});

function serviceOptions(baseDir, trustedIpc, overrides = {}) {
  const currentConfig = {
    voice: { provider: "gpt_sovits", gptSovitsProfileId: "same-profile", gptSovitsBaseUrl: "http://127.0.0.1:9880" },
    speechInput: { model: "small-q5_1", language: "zh" }
  };
  return {
    trustedIpc,
    getBaseDir: () => baseDir,
    getCurrentConfig: () => currentConfig,
    loadConfig: async () => currentConfig,
    mergeConfig: (config) => config,
    showOpenDialog: async () => ({ canceled: false, filePaths: ["gpt.ckpt", "sovits.pth", "reference.wav"] }),
    openPath: async (target) => `opened:${target}`,
    fetch: async () => {},
    broadcastSpeechSignal: () => {},
    broadcastSttProgress: () => {},
    broadcastLocalTtsProgress: () => {},
    broadcastGptSovitsProgress: () => {},
    dependencies: synthesizerDependencies({
      generateAsmrScript: async () => ({}),
      listElevenLabsVoices: async () => [],
      listLocalTtsPacks: async () => [],
      installLocalTtsPack: async () => ({}),
      listGptSovitsProfiles: async () => [],
      installGptSovitsProfile: async () => ({}),
      importGptSovitsProfile: async () => ({}),
      getLocalSttStatus: async () => ({ root: path.join(baseDir, "stt") }),
      installLocalStt: async () => ({}),
      transcribeLocalSpeech: async () => ({}),
      stopGptSovitsService: async () => ({ ready: false })
    }),
    ...overrides
  };
}

test("service owns 18 handles and one listener with idempotent disposal", async (t) => {
  const baseDir = await temporaryBase(t);
  const handlers = new Map();
  const removed = [];
  const listenerDisposals = [];
  const trustedIpc = {
    handle: (channel, handler) => handlers.set(channel, handler),
    removeHandler: (channel) => removed.push(channel),
    on: (channel) => {
      assert.deepEqual([channel], [...SPEECH_EVENT_CHANNELS]);
      return () => listenerDisposals.push(channel);
    }
  };
  const service = registerSpeechServiceIpc(serviceOptions(baseDir, trustedIpc));
  assert.equal(SPEECH_HANDLE_CHANNELS.length, 18);
  assert.deepEqual([...handlers.keys()], [...SPEECH_HANDLE_CHANNELS]);

  const localTtsFolder = await handlers.get("agent:open-local-tts-folder")({});
  const localSttFolder = await handlers.get("agent:open-local-stt-folder")({});
  assert.equal(localTtsFolder, path.join(baseDir, "agent-data", "tts-models"));
  assert.equal(localSttFolder, `opened:${path.join(baseDir, "stt")}`);

  service.dispose();
  service.dispose();
  assert.deepEqual(removed, [...SPEECH_HANDLE_CHANNELS]);
  assert.deepEqual(listenerDisposals, [...SPEECH_EVENT_CHANNELS]);
});

test("automatic speech quietly skips when auto-read is disabled or GPT-SoVITS is stopped", async (t) => {
  const baseDir = await temporaryBase(t);
  const handlers = new Map();
  let readinessChecks = 0;
  let providerCalls = 0;
  const options = serviceOptions(baseDir, {
    handle: (channel, handler) => handlers.set(channel, handler),
    removeHandler: () => {},
    on: () => () => {}
  });
  options.dependencies.isGptSovitsServiceReady = async () => {
    readinessChecks += 1;
    return false;
  };
  options.dependencies.synthesizeGptSovitsSpeech = async () => {
    providerCalls += 1;
    return audioResult("unexpected");
  };
  registerSpeechServiceIpc(options);
  const handler = handlers.get("agent:synthesize-speech");
  const payload = {
    text: "automatic",
    automatic: true,
    voiceConfig: { enabled: true, provider: "gpt_sovits", gptSovitsAutoStart: true }
  };

  assert.deepEqual(await handler({}, payload), { skipped: true, reason: "automatic-voice-disabled" });
  assert.equal(readinessChecks, 0);
  options.getCurrentConfig().voice.enabled = true;
  assert.deepEqual(await handler({}, payload), { skipped: true, reason: "gpt-sovits-not-running" });
  assert.equal(readinessChecks, 1);
  assert.equal(providerCalls, 0);
});

test("local transcription routes through the background task supervisor when configured", async (t) => {
  const baseDir = await temporaryBase(t);
  const handlers = new Map();
  const tasks = [];
  const options = serviceOptions(baseDir, {
    handle: (channel, handler) => handlers.set(channel, handler),
    removeHandler: () => {},
    on: () => () => {}
  }, {
    runBackgroundTask: async (type, payload, runOptions) => {
      tasks.push({ type, payload, runOptions });
      return { text: "你好", modelId: payload.speechInput.model };
    }
  });
  options.dependencies.transcribeLocalSpeech = async () => { throw new Error("主进程不应直接执行 STT"); };
  registerSpeechServiceIpc(options);
  const audio = new Uint8Array([1, 2, 3]);
  const result = await handlers.get("agent:transcribe-local-speech")({}, audio);
  assert.deepEqual(result, { text: "你好", modelId: "small-q5_1" });
  assert.equal(tasks[0].type, "speech:local-transcribe");
  assert.equal(tasks[0].payload.baseDir, baseDir);
  assert.deepEqual([...tasks[0].payload.audioBytes], [...audio]);
});

test("registration failure rolls back handles registered earlier", async (t) => {
  const baseDir = await temporaryBase(t);
  const registered = [];
  const removed = [];
  const trustedIpc = {
    handle: (channel) => {
      if (registered.length === 5) throw new Error("registration failed");
      registered.push(channel);
    },
    removeHandler: (channel) => removed.push(channel),
    on: () => { throw new Error("on should not be reached"); }
  };
  assert.throws(() => registerSpeechServiceIpc(serviceOptions(baseDir, trustedIpc)), /registration failed/);
  assert.deepEqual(removed, [...registered].reverse());
});

test("listener registration failure rolls back all 18 handles", async (t) => {
  const baseDir = await temporaryBase(t);
  const registered = [];
  const removed = [];
  const trustedIpc = {
    handle: (channel) => registered.push(channel),
    removeHandler: (channel) => removed.push(channel),
    on: () => { throw new Error("listener registration failed"); }
  };
  assert.throws(() => registerSpeechServiceIpc(serviceOptions(baseDir, trustedIpc)), /listener registration failed/);
  assert.deepEqual(registered, [...SPEECH_HANDLE_CHANNELS]);
  assert.deepEqual(removed, [...SPEECH_HANDLE_CHANNELS].reverse());
});

test("profile install and import invalidate cached speech for the same profile id", async (t) => {
  const baseDir = await temporaryBase(t);
  const handlers = new Map();
  let providerCalls = 0;
  const options = serviceOptions(baseDir, {
    handle: (channel, handler) => handlers.set(channel, handler),
    removeHandler: () => {},
    on: () => () => {}
  });
  options.dependencies.synthesizeGptSovitsSpeech = async () => { providerCalls += 1; return audioResult(`gpt-${providerCalls}`); };
  registerSpeechServiceIpc(options);
  const payload = { text: "same text", asmr: false, voiceConfig: { provider: "gpt_sovits", gptSovitsProfileId: "same-profile" } };
  await handlers.get("agent:synthesize-speech")({}, payload);
  assert.equal((await handlers.get("agent:synthesize-speech")({}, payload)).cached, true);
  await handlers.get("agent:install-gpt-sovits-profile")({}, "same-profile");
  await handlers.get("agent:synthesize-speech")({}, payload);
  await handlers.get("agent:import-gpt-sovits-profile")({}, { id: "same-profile" });
  await handlers.get("agent:synthesize-speech")({}, payload);
  assert.equal(providerCalls, 3);
});

test("profile invalidation prevents an older in-flight result from repopulating disk cache", async (t) => {
  const baseDir = await temporaryBase(t);
  const payload = { text: "same text", asmr: false, voiceConfig: { provider: "gpt_sovits", gptSovitsProfileId: "same-profile" } };
  const firstHandlers = new Map();
  const firstOptions = serviceOptions(baseDir, {
    handle: (channel, handler) => firstHandlers.set(channel, handler),
    removeHandler: () => {},
    on: () => () => {}
  });
  let providerCalls = 0;
  let releaseFirst;
  let markStarted;
  const started = new Promise((resolve) => { markStarted = resolve; });
  firstOptions.dependencies.synthesizeGptSovitsSpeech = async () => {
    providerCalls += 1;
    markStarted();
    return new Promise((resolve) => { releaseFirst = resolve; });
  };
  const firstService = registerSpeechServiceIpc(firstOptions);
  const oldSynthesis = firstHandlers.get("agent:synthesize-speech")({}, payload);
  await started;
  await firstHandlers.get("agent:install-gpt-sovits-profile")({}, "same-profile");
  releaseFirst(audioResult("old-profile"));
  await oldSynthesis;
  firstService.dispose();

  const secondHandlers = new Map();
  const secondOptions = serviceOptions(baseDir, {
    handle: (channel, handler) => secondHandlers.set(channel, handler),
    removeHandler: () => {},
    on: () => () => {}
  });
  secondOptions.dependencies.synthesizeGptSovitsSpeech = async () => { providerCalls += 1; return audioResult("new-profile"); };
  registerSpeechServiceIpc(secondOptions);
  assert.equal((await secondHandlers.get("agent:synthesize-speech")({}, payload)).cached, false);
  assert.equal(providerCalls, 2);
});

test("delayed cache removal cannot delete a new generation write or let the old generation repopulate cache", async (t) => {
  const baseDir = await temporaryBase(t);
  let releaseOldProvider;
  let markOldStarted;
  let releaseRemoval;
  let markRemovalStarted;
  let markNewStarted;
  let providerCalls = 0;
  const oldStarted = new Promise((resolve) => { markOldStarted = resolve; });
  const removalStarted = new Promise((resolve) => { markRemovalStarted = resolve; });
  const newStarted = new Promise((resolve) => { markNewStarted = resolve; });
  const synthesize = createSpeechSynthesizer({
    getBaseDir: () => baseDir,
    dependencies: synthesizerDependencies({
      removeAudioCache: async (cacheDir) => {
        markRemovalStarted();
        await new Promise((resolve) => { releaseRemoval = resolve; });
        await fs.rm(cacheDir, { recursive: true, force: true });
      },
      synthesizeLocalSpeech: async () => {
        providerCalls += 1;
        if (providerCalls === 1) {
          markOldStarted();
          return new Promise((resolve) => { releaseOldProvider = resolve; });
        }
        markNewStarted();
        return audioResult("new-generation");
      }
    })
  });
  const config = { provider: "local", localPackId: "pack" };
  const oldSynthesis = synthesize(config, "same text", false);
  await oldStarted;
  const invalidation = synthesize.invalidateCache();
  await removalStarted;
  const newSynthesis = synthesize(config, "same text", false);
  await newStarted;
  releaseRemoval();
  await invalidation;
  const newResult = await newSynthesis;
  assert.equal(newResult.audioBase64, audioResult("new-generation").audioBase64);

  releaseOldProvider(audioResult("old-generation"));
  await oldSynthesis;
  const cached = await synthesize(config, "same text", false);
  assert.equal(cached.cached, true);
  assert.equal(cached.audioBase64, audioResult("new-generation").audioBase64);
  assert.equal(providerCalls, 2);
  const cacheFiles = await fs.readdir(path.join(baseDir, "agent-data", "audio-cache"));
  assert.equal(cacheFiles.filter((name) => !name.endsWith(".part")).length, 1);
});

test("the host fetch implementation reaches every speech-domain network entry", async (t) => {
  const baseDir = await temporaryBase(t);
  const handlers = new Map();
  const sentinelFetch = async () => { throw new Error("sentinel fetch must be consumed by the injected dependency"); };
  const received = [];
  const capture = (label, fetchImpl) => {
    received.push(label);
    assert.equal(fetchImpl, sentinelFetch, `${label} did not receive the host fetch implementation`);
  };
  const options = serviceOptions(baseDir, {
    handle: (channel, handler) => handlers.set(channel, handler),
    removeHandler: () => {},
    on: () => () => {}
  }, { fetch: sentinelFetch });
  options.dependencies.generateAsmrScript = async (_baseDir, _payload, fetchImpl) => { capture("asmr", fetchImpl); return "script"; };
  options.dependencies.listElevenLabsVoices = async (_voice, fetchImpl) => { capture("eleven-list", fetchImpl); return []; };
  options.dependencies.synthesizeElevenLabsSpeech = async (_voice, _text, synthesisOptions) => { capture("eleven-synthesize", synthesisOptions.fetchImpl); return audioResult("eleven"); };
  options.dependencies.installLocalTtsPack = async (_baseDir, _packId, _progress, fetchImpl) => { capture("local-tts-install", fetchImpl); return {}; };
  options.dependencies.installGptSovitsProfile = async (_baseDir, _profileId, _progress, fetchImpl) => { capture("gpt-profile-install", fetchImpl); return {}; };
  options.dependencies.synthesizeGptSovitsSpeech = async (_baseDir, _voice, _text, fetchImpl) => { capture("gpt-synthesize", fetchImpl); return audioResult("gpt"); };
  options.dependencies.isGptSovitsServiceReady = async (_baseUrl, fetchImpl) => { capture("gpt-ready", fetchImpl); return true; };
  options.dependencies.ensureGptSovitsService = async (_baseUrl, runtimeOptions) => { capture("gpt-start", runtimeOptions.fetchImpl); return { ready: true }; };
  options.dependencies.stopGptSovitsService = async (_baseUrl, fetchImpl) => { capture("gpt-stop", fetchImpl); return { ready: false }; };
  options.dependencies.installLocalStt = async (_baseDir, _modelId, _progress, fetchImpl) => { capture("local-stt-install", fetchImpl); return {}; };
  const service = registerSpeechServiceIpc(options);

  await handlers.get("agent:generate-asmr-script")({}, {});
  await handlers.get("agent:list-elevenlabs-voices")({}, {});
  await handlers.get("agent:install-local-tts-pack")({}, "pack");
  await handlers.get("agent:install-gpt-sovits-profile")({}, "profile");
  await handlers.get("agent:get-gpt-sovits-runtime-status")({}, "http://127.0.0.1:9880");
  await handlers.get("agent:start-gpt-sovits-runtime")({}, "http://127.0.0.1:9880");
  await handlers.get("agent:stop-gpt-sovits-runtime")({}, "http://127.0.0.1:9880");
  await handlers.get("agent:install-local-stt")({}, "small-q5_1");
  await handlers.get("agent:synthesize-speech")({}, { text: "eleven", voiceConfig: { provider: "elevenlabs", voice: "voice" } });
  await handlers.get("agent:synthesize-speech")({}, { text: "gpt", voiceConfig: { provider: "gpt_sovits", gptSovitsProfileId: "profile" } });
  await service.ensureGptSovitsRuntime();
  await service.stopGptSovitsRuntime();

  assert.deepEqual(received, [
    "asmr", "eleven-list", "local-tts-install", "gpt-profile-install",
    "gpt-ready", "gpt-start", "gpt-stop", "local-stt-install",
    "eleven-synthesize", "gpt-start", "gpt-synthesize", "gpt-start", "gpt-stop"
  ]);
  service.dispose();
});

test("speech service composes with trusted registrar and normalizes trusted signals", async (t) => {
  const baseDir = await temporaryBase(t);
  const handlers = new Map();
  const listeners = new Map();
  const rawIpcMain = {
    handle: (channel, handler) => handlers.set(channel, handler),
    removeHandler: (channel) => handlers.delete(channel),
    on: (channel, listener) => listeners.set(channel, listener),
    removeListener: (channel, listener) => { if (listeners.get(channel) === listener) listeners.delete(channel); }
  };
  const trustedIpc = createTrustedIpcRegistrar(rawIpcMain, {
    isDev: true,
    devServerUrl: "http://localhost:5173",
    rendererRoot: path.resolve("dist")
  });
  let businessCalls = 0;
  const signals = [];
  const options = serviceOptions(baseDir, trustedIpc, { broadcastSpeechSignal: (signal) => signals.push(signal) });
  options.dependencies.listLocalTtsPacks = async () => { businessCalls += 1; return ["pack"]; };
  const service = registerSpeechServiceIpc(options);
  const mainFrame = { url: "http://localhost:5173/?view=settings" };
  const trustedEvent = { senderFrame: mainFrame, sender: { mainFrame } };
  assert.deepEqual(await handlers.get("agent:list-local-tts-packs")(trustedEvent), ["pack"]);
  const foreignFrame = { url: "https://example.com" };
  assert.throws(() => handlers.get("agent:list-local-tts-packs")({ senderFrame: foreignFrame, sender: { mainFrame: foreignFrame } }), /拒绝/);
  assert.equal(businessCalls, 1);

  const signalListener = listeners.get("agent:speech-signal");
  assert.doesNotThrow(() => signalListener({ senderFrame: foreignFrame, sender: { mainFrame: foreignFrame } }, { active: true }));
  signalListener(trustedEvent, { active: 1, level: 4, phase: "bad", durationMs: "20", finalSegment: 1 });
  assert.deepEqual(signals, [{ active: true, level: 1, phase: undefined, text: undefined, durationMs: 20, finalSegment: true, mood: undefined, faceParams: undefined }]);
  service.dispose();
  assert.equal(handlers.size, 0);
  assert.equal(listeners.size, 0);
});

test("install-gpt-sovits-runtime picks a directory, copies the blueprint, and persists the root", async (t) => {
  const baseDir = await temporaryBase(t);
  const handlers = new Map();
  let installedSource;
  let installOptions;
  let saved;
  const options = serviceOptions(baseDir, {
    handle: (channel, handler) => handlers.set(channel, handler),
    removeHandler: () => {},
    on: () => () => {}
  }, {
    showOpenDialog: async () => ({ canceled: false, filePaths: ["D:/Runtimes"] }),
    getGptSovitsSourceRoot: () => "D:/Blueprint",
    saveConfig: async (_base, config) => { saved = config; },
    broadcastGptSovitsInstallProgress: () => {}
  });
  options.dependencies.installGptSovitsRuntime = async (targetRoot, opts) => {
    installedSource = targetRoot;
    installOptions = opts;
    opts.onProgress?.({ percent: 100, copiedMb: 10, totalMb: 10 });
    return targetRoot;
  };
  registerSpeechServiceIpc(options);
  const result = await handlers.get("agent:install-gpt-sovits-runtime")({}, {});
  assert.deepEqual(result, { canceled: false, runtimeRoot: "D:/Runtimes" });
  assert.equal(installedSource, "D:/Runtimes");
  assert.equal(installOptions.sourceRoot, "D:/Blueprint");
  assert.equal(saved.voice.gptSovitsRuntimeRoot, "D:/Runtimes");
});

test("install-gpt-sovits-runtime returns canceled when the dialog is dismissed", async (t) => {
  const baseDir = await temporaryBase(t);
  const handlers = new Map();
  const options = serviceOptions(baseDir, {
    handle: (channel, handler) => handlers.set(channel, handler),
    removeHandler: () => {},
    on: () => () => {}
  }, {
    showOpenDialog: async () => ({ canceled: true, filePaths: [] })
  });
  let called = false;
  options.dependencies.installGptSovitsRuntime = async () => { called = true; };
  registerSpeechServiceIpc(options);
  assert.deepEqual(await handlers.get("agent:install-gpt-sovits-runtime")({}, {}), { canceled: true });
  assert.equal(called, false);
});

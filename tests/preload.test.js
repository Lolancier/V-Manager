import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";

const EXPECTED_API = `
getBootstrap getStartupStatus notifyRendererReady saveConfig listPersonaCards createPersonaCard
generatePersonaCardDraft updatePersonaCard activatePersonaCard archivePersonaCard restorePersonaCard
getMemoryDatabaseStats getLive2DModels refreshLive2DModels openLive2DModelsFolder selectAsmrTextFile
generateAsmrScript listElevenLabsVoices synthesizeSpeech reportSpeechSignal listLocalTtsPacks installLocalTtsPack
openLocalTtsFolder listGptSovitsProfiles installGptSovitsProfile importGptSovitsProfile getGptSovitsRuntimeStatus
startGptSovitsRuntime stopGptSovitsRuntime installGptSovitsRuntime getLocalSttStatus installLocalStt transcribeLocalSpeech openLocalSttFolder
getRelationshipProfile resetRelationshipProfile petTouch chat searchFiles getAppRegistry refreshAppRegistry getRagStatus
rebuildRagIndex testEmbedding getSystemResourceSnapshot getFileManagerSnapshot scanManagedDirectory previewFileOrganization
executeFileOrganization listFileOperations listDeepSeekModels undoFileOperation openExternal testDeepSeek testDeepSeekRelay testAstrBot clearMemory showPetContextMenu
openSettingsWindow openComposerWindow openChatWindow openCodeWindow getAutoLaunch setAutoLaunch getLifeState
getCompanionMemory getInterestSandbox getInterestState cleanupInterestSandbox updateInterestLocation runInterestActivity
playInterestGame interruptInterestActivity openInterestSandbox openInterestCategory openInterestArtifact pauseProactiveToday
resetWorkSession listSchedules cancelSchedule openScaleWindow openExpressionWindow triggerExpression clearExpressions
getChatState getCodeWorkspace selectCodeWorkspace readCodeFile writeCodeFile getPetWindowBounds getPetScale getPositionLock
setPositionLock setPetWindowPosition setPetMousePassthrough updatePetWindowLayout updateBubbleWindowSize getDataPath
openDataFolder openPersonaFolder onMenuAction onConfigUpdated onPetScaleUpdated onChatStateUpdated onLive2DModelsUpdated
onBubblePlacementUpdated onLocalSttProgress onPositionLockUpdated onTriggerExpression onClearExpressions
onExpressionsUpdated onStartupProgress onLocalTtsProgress onGptSovitsProgress onGptSovitsInstallProgress onAutoLaunchUpdated onLifeStateUpdated
onSchedulesUpdated onCursorScreenPosition onMoodUpdated onSpeechSignalUpdated onRelationshipUpdated onInterestStateUpdated
`.trim().split(/\s+/).sort();

async function loadPreload() {
  const calls = [];
  const listeners = new Map();
  let exposed;
  const ipcRenderer = {
    invoke: (channel, ...args) => {
      calls.push(["invoke", channel, ...args]);
      return Promise.resolve({ channel, args });
    },
    send: (channel, ...args) => calls.push(["send", channel, ...args]),
    on: (channel, listener) => listeners.set(channel, listener),
    removeListener: (channel, listener) => {
      calls.push(["removeListener", channel, listener]);
      if (listeners.get(channel) === listener) listeners.delete(channel);
    }
  };
  const source = await fs.readFile(new URL("../electron/preload.cjs", import.meta.url), "utf8");
  vm.runInNewContext(source, {
    require: (specifier) => {
      assert.equal(specifier, "electron");
      return {
        contextBridge: { exposeInMainWorld: (name, api) => { exposed = { name, api }; } },
        ipcRenderer
      };
    }
  }, { filename: "electron/preload.cjs" });
  return { ...exposed, calls, listeners };
}

test("preload exposes the complete compatible agentDesktop API from its canonical CJS source", async () => {
  const { name, api } = await loadPreload();
  assert.equal(name, "agentDesktop");
  assert.deepEqual(Object.keys(api).sort(), EXPECTED_API);
});

test("preload preserves IPC argument shapes and event unsubscription", async () => {
  const { api, calls, listeners } = await loadPreload();
  const config = { theme: "dark" };
  await api.updatePersonaCard("card-1", config);
  await api.generateAsmrScript("whisper", "hello");
  await api.writeCodeFile("src/a.js", "next", "previous");
  api.setPetMousePassthrough(1);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.slice(0, 4))), [
    ["invoke", "agent:update-persona-card", "card-1", config],
    ["invoke", "agent:generate-asmr-script", { mode: "whisper", prompt: "hello" }],
    ["invoke", "agent:write-code-file", { path: "src/a.js", content: "next", expectedContent: "previous" }],
    ["send", "agent:set-pet-mouse-passthrough", true]
  ]);

  await api.synthesizeSpeech("automatic", false, { provider: "gpt_sovits" }, true);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1))), [
    "invoke",
    "agent:synthesize-speech",
    { text: "automatic", asmr: false, voiceConfig: { provider: "gpt_sovits" }, automatic: true }
  ]);

  const received = [];
  const unsubscribe = api.onConfigUpdated((value) => received.push(value));
  const listener = listeners.get("agent:config-updated");
  listener({ ignored: true }, config);
  assert.deepEqual(received, [config]);
  unsubscribe();
  assert.equal(listeners.has("agent:config-updated"), false);
  assert.equal(calls.at(-1)[0], "removeListener");
  assert.equal(calls.at(-1)[1], "agent:config-updated");
  assert.equal(calls.at(-1)[2], listener);
});

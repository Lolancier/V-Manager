const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("agentDesktop", {
  getBootstrap: () => ipcRenderer.invoke("agent:get-bootstrap"),
  saveConfig: (config) => ipcRenderer.invoke("agent:save-config", config),
  getLive2DModels: () => ipcRenderer.invoke("agent:get-live2d-models"),
  refreshLive2DModels: () => ipcRenderer.invoke("agent:refresh-live2d-models"),
  openLive2DModelsFolder: () => ipcRenderer.invoke("agent:open-live2d-models-folder"),
  selectAsmrTextFile: () => ipcRenderer.invoke("agent:select-asmr-text-file"),
  generateAsmrScript: (mode, prompt) => ipcRenderer.invoke("agent:generate-asmr-script", { mode, prompt }),
  listElevenLabsVoices: (voiceConfig) => ipcRenderer.invoke("agent:list-elevenlabs-voices", voiceConfig),
  synthesizeSpeech: (text, asmr, voiceConfig) => ipcRenderer.invoke("agent:synthesize-speech", { text, asmr, voiceConfig }),
  getLocalSttStatus: (modelId) => ipcRenderer.invoke("agent:get-local-stt-status", modelId),
  installLocalStt: (modelId) => ipcRenderer.invoke("agent:install-local-stt", modelId),
  transcribeLocalSpeech: (audioBytes) => ipcRenderer.invoke("agent:transcribe-local-speech", audioBytes),
  openLocalSttFolder: () => ipcRenderer.invoke("agent:open-local-stt-folder"),
  getRelationshipProfile: () => ipcRenderer.invoke("agent:get-relationship-profile"),
  resetRelationshipProfile: () => ipcRenderer.invoke("agent:reset-relationship-profile"),
  chat: (payload) => ipcRenderer.invoke("agent:chat", payload),
  searchFiles: (query) => ipcRenderer.invoke("agent:search-files", query),
  getAppRegistry: () => ipcRenderer.invoke("agent:get-app-registry"),
  refreshAppRegistry: () => ipcRenderer.invoke("agent:refresh-app-registry"),
  getRagStatus: () => ipcRenderer.invoke("agent:get-rag-status"),
  rebuildRagIndex: () => ipcRenderer.invoke("agent:rebuild-rag-index"),
  testEmbedding: () => ipcRenderer.invoke("agent:test-embedding"),
  getSystemResourceSnapshot: () => ipcRenderer.invoke("agent:get-system-resource-snapshot"),
  getFileManagerSnapshot: () => ipcRenderer.invoke("agent:get-file-manager-snapshot"),
  openExternal: (url) => ipcRenderer.invoke("agent:open-external", url),
  testDeepSeek: () => ipcRenderer.invoke("agent:test-deepseek"),
  clearMemory: () => ipcRenderer.invoke("agent:clear-memory"),
  showPetContextMenu: () => ipcRenderer.send("agent:show-pet-context-menu"),
  openSettingsWindow: () => ipcRenderer.invoke("agent:open-settings-window"),
  openComposerWindow: () => ipcRenderer.invoke("agent:open-composer-window"),
  openChatWindow: () => ipcRenderer.invoke("agent:open-chat-window"),
  openCodeWindow: () => ipcRenderer.invoke("agent:open-code-window"),
  openScaleWindow: () => ipcRenderer.invoke("agent:open-scale-window"),
  openExpressionWindow: () => ipcRenderer.invoke("agent:open-expression-window"),
  triggerExpression: (name) => ipcRenderer.invoke("agent:trigger-expression", name),
  clearExpressions: () => ipcRenderer.invoke("agent:clear-expressions"),
  getChatState: () => ipcRenderer.invoke("agent:get-chat-state"),
  getCodeWorkspace: () => ipcRenderer.invoke("agent:get-code-workspace"),
  selectCodeWorkspace: () => ipcRenderer.invoke("agent:select-code-workspace"),
  readCodeFile: (path) => ipcRenderer.invoke("agent:read-code-file", path),
  getPetWindowBounds: () => ipcRenderer.invoke("agent:get-pet-window-bounds"),
  getPetScale: () => ipcRenderer.invoke("agent:get-pet-scale"),
  getPositionLock: () => ipcRenderer.invoke("agent:get-position-lock"),
  setPositionLock: (locked) => ipcRenderer.invoke("agent:set-position-lock", locked),
  setPetWindowPosition: (x, y) => ipcRenderer.invoke("agent:set-pet-window-position", { x, y }),
  setPetMousePassthrough: (ignore) => ipcRenderer.send("agent:set-pet-mouse-passthrough", Boolean(ignore)),
  updatePetWindowLayout: (scale) => ipcRenderer.invoke("agent:update-pet-window-layout", { scale }),
  updateBubbleWindowSize: (width, height) => ipcRenderer.invoke("agent:update-bubble-window-size", { width, height }),
  getDataPath: () => ipcRenderer.invoke("agent:get-data-path"),
  openDataFolder: () => ipcRenderer.invoke("agent:open-data-folder"),
  onMenuAction: (callback) => {
    const listener = (_event, action) => callback(action);
    ipcRenderer.on("agent:menu-action", listener);
    return () => ipcRenderer.removeListener("agent:menu-action", listener);
  },
  onConfigUpdated: (callback) => {
    const listener = (_event, config) => callback(config);
    ipcRenderer.on("agent:config-updated", listener);
    return () => ipcRenderer.removeListener("agent:config-updated", listener);
  },
  onPetScaleUpdated: (callback) => {
    const listener = (_event, scale) => callback(scale);
    ipcRenderer.on("agent:pet-scale-updated", listener);
    return () => ipcRenderer.removeListener("agent:pet-scale-updated", listener);
  },
  onChatStateUpdated: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("agent:chat-state-updated", listener);
    return () => ipcRenderer.removeListener("agent:chat-state-updated", listener);
  },
  onLive2DModelsUpdated: (callback) => {
    const listener = (_event, models) => callback(models);
    ipcRenderer.on("agent:live2d-models-updated", listener);
    return () => ipcRenderer.removeListener("agent:live2d-models-updated", listener);
  },
  onBubblePlacementUpdated: (callback) => {
    const listener = (_event, placement) => callback(placement);
    ipcRenderer.on("agent:bubble-placement-updated", listener);
    return () => ipcRenderer.removeListener("agent:bubble-placement-updated", listener);
  },
  onLocalSttProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on("agent:local-stt-progress", listener);
    return () => ipcRenderer.removeListener("agent:local-stt-progress", listener);
  },
  onPositionLockUpdated: (callback) => {
    const listener = (_event, locked) => callback(locked);
    ipcRenderer.on("agent:position-lock-updated", listener);
    return () => ipcRenderer.removeListener("agent:position-lock-updated", listener);
  },
  onTriggerExpression: (callback) => {
    const listener = (_event, name) => callback(name);
    ipcRenderer.on("agent:trigger-expression", listener);
    return () => ipcRenderer.removeListener("agent:trigger-expression", listener);
  },
  onClearExpressions: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("agent:clear-expressions", listener);
    return () => ipcRenderer.removeListener("agent:clear-expressions", listener);
  },
  onExpressionsUpdated: (callback) => {
    const listener = (_event, expressions) => callback(expressions);
    ipcRenderer.on("agent:expressions-updated", listener);
    return () => ipcRenderer.removeListener("agent:expressions-updated", listener);
  },
  onMoodUpdated: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("agent:mood-updated", listener);
    return () => ipcRenderer.removeListener("agent:mood-updated", listener);
  },
  onRelationshipUpdated: (callback) => {
    const listener = (_event, profile) => callback(profile);
    ipcRenderer.on("agent:relationship-updated", listener);
    return () => ipcRenderer.removeListener("agent:relationship-updated", listener);
  }
});

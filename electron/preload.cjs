const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("agentDesktop", {
  getBootstrap: () => ipcRenderer.invoke("agent:get-bootstrap"),
  saveConfig: (config) => ipcRenderer.invoke("agent:save-config", config),
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
  openScaleWindow: () => ipcRenderer.invoke("agent:open-scale-window"),
  openExpressionWindow: () => ipcRenderer.invoke("agent:open-expression-window"),
  triggerExpression: (name) => ipcRenderer.invoke("agent:trigger-expression", name),
  clearExpressions: () => ipcRenderer.invoke("agent:clear-expressions"),
  getChatState: () => ipcRenderer.invoke("agent:get-chat-state"),
  getPetWindowBounds: () => ipcRenderer.invoke("agent:get-pet-window-bounds"),
  getPetScale: () => ipcRenderer.invoke("agent:get-pet-scale"),
  getPositionLock: () => ipcRenderer.invoke("agent:get-position-lock"),
  setPositionLock: (locked) => ipcRenderer.invoke("agent:set-position-lock", locked),
  setPetWindowPosition: (x, y) => ipcRenderer.invoke("agent:set-pet-window-position", { x, y }),
  updatePetWindowLayout: (scale) => ipcRenderer.invoke("agent:update-pet-window-layout", { scale }),
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
  onMoodUpdated: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("agent:mood-updated", listener);
    return () => ipcRenderer.removeListener("agent:mood-updated", listener);
  }
});

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("agentDesktop", {
  getBootstrap: () => ipcRenderer.invoke("agent:get-bootstrap"),
  saveConfig: (config) => ipcRenderer.invoke("agent:save-config", config),
  chat: (payload) => ipcRenderer.invoke("agent:chat", payload),
  searchFiles: (query) => ipcRenderer.invoke("agent:search-files", query),
  getAppRegistry: () => ipcRenderer.invoke("agent:get-app-registry"),
  refreshAppRegistry: () => ipcRenderer.invoke("agent:refresh-app-registry"),
  getRagStatus: () => ipcRenderer.invoke("agent:get-rag-status"),
  rebuildRagIndex: () => ipcRenderer.invoke("agent:rebuild-rag-index"),
  openExternal: (url) => ipcRenderer.invoke("agent:open-external", url)
});

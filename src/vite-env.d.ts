/// <reference types="vite/client" />
/// <reference path="../third_party/live2d/CubismSdkForWeb-5-r.5/Core/live2dcubismcore.d.ts" />

type AgentStatus = "ready" | "partial" | "planned";

interface AgentAbility {
  id: string;
  name: string;
  status: AgentStatus;
  detail: string;
}

interface AgentKnowledge {
  file: string;
  score: number;
  content: string;
}

interface AgentConfig {
  appName: string;
  personaName: string;
  personaPrompt: string;
  deepseek: {
    apiKey: string;
    baseUrl: string;
    model: string;
  };
  embedding: {
    apiKey: string;
    baseUrl: string;
    model: string;
  };
  memory: {
    maxMessages: number;
    knowledgeTopK: number;
  };
}

interface AgentBootstrap {
  config: AgentConfig;
  knowledgeFiles: string[];
  abilities: AgentAbility[];
  runtime?: {
    mode: "desktop" | "preview";
    configPath?: string;
  };
}

interface ChatResult {
  reply: string;
  knowledge: AgentKnowledge[];
  meta: {
    responseMode: "deepseek" | "fallback_local" | "local_tool";
    usedKnowledge: boolean;
    knowledgeCount: number;
    knowledgeFiles: string[];
    fallbackReason: string;
    localTool?: string;
    model?: string;
    detectedMood?: string;
    faceParams?: Record<string, number>;
  };
}

interface ChatWindowState {
  messages: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  knowledge: AgentKnowledge[];
  lastReplyMeta: (ChatResult["meta"] & { sourceLabel: string }) | null;
}

interface FileSearchResult {
  name: string;
  location: string;
  type: "file" | "folder";
}

interface SystemResourceSnapshot {
  hostname: string;
  cpuModel: string;
  cpuUsagePercent: number;
  totalMemoryGB: number;
  usedMemoryGB: number;
  memoryUsagePercent: number;
  processCount: number;
  visibleAppCount: number;
  visibleApps: Array<{
    name: string;
    pid: number;
    windowTitle: string;
  }>;
  topProcesses: Array<{
    name: string;
    pid: number;
    cpuSeconds: number;
    memoryMB: number;
    windowTitle?: string;
  }>;
}

interface FileManagerSnapshot {
  desktopPath: string;
  driveDPath: string;
  desktopApps: FileSearchResult[];
  desktopFolders: FileSearchResult[];
  driveDFolders: FileSearchResult[];
}

interface AppRegistryEntry {
  id: string;
  label: string;
  aliases: string[];
  appIds: string[];
  commands: string[];
  installLocations?: string[];
  shortcutPaths?: string[];
  source: string;
  lastValidatedAt: string | null;
}

interface AppRegistrySnapshot {
  version: number;
  updatedAt: string | null;
  apps: AppRegistryEntry[];
}

interface RagStatusSnapshot {
  config: {
    enabled: boolean;
    mode: string;
    embeddingProvider: string;
    embeddingModel: string;
    chunkSize: number;
    chunkOverlap: number;
    topK: number;
    maxDepth: number;
    maxFiles: number;
    indexedRoots: string[];
  };
  status: {
    indexedFileCount: number;
    indexedChunkCount: number;
    embeddedChunkCount: number;
    updatedAt: string | null;
  };
}

interface Window {
  agentDesktop?: {
    getBootstrap: () => Promise<AgentBootstrap>;
    saveConfig: (config: AgentConfig) => Promise<AgentConfig>;
    chat: (payload: { message: string }) => Promise<ChatWindowState>;
    searchFiles: (query: string) => Promise<FileSearchResult[]>;
    getAppRegistry: () => Promise<AppRegistrySnapshot>;
    refreshAppRegistry: () => Promise<AppRegistrySnapshot>;
    getRagStatus: () => Promise<RagStatusSnapshot>;
    rebuildRagIndex: () => Promise<{ version: number; updatedAt: string | null; chunks: unknown[]; files: unknown[]; embeddedCount: number }>;
    testEmbedding: () => Promise<{ ok: boolean; message: string; model: string; baseUrl: string; dimensions?: number }>;
    getSystemResourceSnapshot: () => Promise<SystemResourceSnapshot>;
    getFileManagerSnapshot: () => Promise<FileManagerSnapshot>;
    openExternal: (url: string) => Promise<boolean>;
    testDeepSeek: () => Promise<{ ok: boolean; message: string; config: AgentConfig }>;
    clearMemory: () => Promise<boolean>;
    showPetContextMenu: () => void;
    openSettingsWindow: () => Promise<boolean>;
    openComposerWindow: () => Promise<boolean>;
    openChatWindow: () => Promise<boolean>;
    openScaleWindow: () => Promise<boolean>;
    openExpressionWindow: () => Promise<boolean>;
    triggerExpression: (name: string) => Promise<boolean>;
    clearExpressions: () => Promise<boolean>;
    getChatState: () => Promise<ChatWindowState>;
    getPetWindowBounds: () => Promise<{ x: number; y: number; width: number; height: number }>;
    getPetScale: () => Promise<number>;
    getPositionLock: () => Promise<boolean>;
    setPositionLock: (locked: boolean) => Promise<boolean>;
    setPetWindowPosition: (x: number, y: number) => Promise<boolean>;
    updatePetWindowLayout: (scale: number) => Promise<{ width: number; height: number } | null>;
    getDataPath: () => Promise<{ baseDir: string; dataDir: string; configPath: string; memoryPath: string; knowledgeDir: string; ragDir: string; registryDir: string }>;
    openDataFolder: () => Promise<boolean>;
    onMenuAction: (callback: (action: string) => void) => () => void;
    onConfigUpdated: (callback: (config: AgentConfig) => void) => () => void;
    onPetScaleUpdated: (callback: (scale: number) => void) => () => void;
    onChatStateUpdated: (callback: (state: ChatWindowState) => void) => () => void;
    onPositionLockUpdated: (callback: (locked: boolean) => void) => () => void;
    onTriggerExpression: (callback: (name: string) => void) => () => void;
    onClearExpressions: (callback: () => void) => () => void;
    onMoodUpdated?: (callback: (payload: { mood: string; faceParams: Record<string, number> | null }) => void) => () => void;
  };
}

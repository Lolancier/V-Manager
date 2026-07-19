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
  appearance: {
    theme: "light" | "dark";
    live2dModel: string;
  };
  voice: {
    enabled: boolean;
    provider: "elevenlabs";
    baseUrl: string;
    apiKey: string;
    model: string;
    voice: string;
    outputFormat: string;
    speed: number;
    stability: number;
    similarityBoost: number;
    asmrEnabled: boolean;
    asmrMode: "sleep" | "casual" | "custom";
    asmrPrompt: string;
    asmrScript: string;
  };
  speechInput: {
    provider: "local_whisper";
    model: "base-q5_1" | "small-q5_1";
    language: string;
    silenceMs: number;
  };
  memory: {
    maxMessages: number;
    knowledgeTopK: number;
  };
}

interface Live2DModelOption {
  id: string;
  label: string;
  detail: string;
  directory?: string;
  fileName?: string;
  builtIn: boolean;
}

interface ElevenLabsVoiceOption {
  voiceId: string;
  name: string;
  category: string;
  previewUrl: string;
}

interface LocalSttStatus {
  installed: boolean;
  runtimeInstalled: boolean;
  modelInstalled: boolean;
  executablePath: string;
  modelPath: string;
  root: string;
  modelId: string;
}

interface AgentBootstrap {
  config: AgentConfig;
  live2dModels?: Live2DModelOption[];
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

interface CodeWorkspaceEntry {
  type: "file" | "directory";
  name: string;
  path: string;
  depth: number;
}

interface CodeWorkspaceSnapshot {
  ok: boolean;
  root: string;
  entries: CodeWorkspaceEntry[];
  truncated: boolean;
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
    getLive2DModels: () => Promise<Live2DModelOption[]>;
    refreshLive2DModels: () => Promise<Live2DModelOption[]>;
    openLive2DModelsFolder: () => Promise<string>;
    selectAsmrTextFile: () => Promise<{ path: string; content: string } | null>;
    generateAsmrScript: (mode: string, prompt: string) => Promise<string>;
    listElevenLabsVoices: (voiceConfig?: AgentConfig["voice"]) => Promise<ElevenLabsVoiceOption[]>;
    synthesizeSpeech: (text: string, asmr: boolean, voiceConfig?: AgentConfig["voice"]) => Promise<{ audioBase64: string; mimeType: string; requestId: string; characterCost: string; cached: boolean }>;
    getLocalSttStatus: (modelId?: string) => Promise<LocalSttStatus>;
    installLocalStt: (modelId: string) => Promise<LocalSttStatus>;
    transcribeLocalSpeech: (audioBytes: Uint8Array) => Promise<{ text: string; modelId: string; language: string }>;
    openLocalSttFolder: () => Promise<string>;
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
    openCodeWindow: () => Promise<boolean>;
    openScaleWindow: () => Promise<boolean>;
    openExpressionWindow: () => Promise<boolean>;
    triggerExpression: (name: string) => Promise<boolean>;
    clearExpressions: () => Promise<boolean>;
    getChatState: () => Promise<ChatWindowState>;
    getCodeWorkspace: () => Promise<CodeWorkspaceSnapshot>;
    selectCodeWorkspace: () => Promise<CodeWorkspaceSnapshot | null>;
    readCodeFile: (path: string) => Promise<{ ok: boolean; path: string; content: string; truncated: boolean }>;
    getPetWindowBounds: () => Promise<{ x: number; y: number; width: number; height: number }>;
    getPetScale: () => Promise<number>;
    getPositionLock: () => Promise<boolean>;
    setPositionLock: (locked: boolean) => Promise<boolean>;
    setPetWindowPosition: (x: number, y: number) => Promise<boolean>;
    setPetMousePassthrough: (ignore: boolean) => void;
    updatePetWindowLayout: (scale: number) => Promise<{ width: number; height: number } | null>;
    updateBubbleWindowSize: (width: number, height: number) => Promise<{ placement: "left" | "right" } | null>;
    getDataPath: () => Promise<{ baseDir: string; dataDir: string; configPath: string; memoryPath: string; knowledgeDir: string; ragDir: string; registryDir: string }>;
    openDataFolder: () => Promise<boolean>;
    onMenuAction: (callback: (action: string) => void) => () => void;
    onConfigUpdated: (callback: (config: AgentConfig) => void) => () => void;
    onLive2DModelsUpdated: (callback: (models: Live2DModelOption[]) => void) => () => void;
    onPetScaleUpdated: (callback: (scale: number) => void) => () => void;
    onChatStateUpdated: (callback: (state: ChatWindowState) => void) => () => void;
    onBubblePlacementUpdated: (callback: (placement: "left" | "right") => void) => () => void;
    onLocalSttProgress: (callback: (progress: { phase: "runtime" | "model"; received: number; total: number; percent: number }) => void) => () => void;
    onPositionLockUpdated: (callback: (locked: boolean) => void) => () => void;
    onTriggerExpression: (callback: (name: string) => void) => () => void;
    onClearExpressions: (callback: () => void) => () => void;
    onExpressionsUpdated: (callback: (expressions: string[]) => void) => () => void;
    onMoodUpdated?: (callback: (payload: { mood: string; faceParams: Record<string, number> | null; reply?: string }) => void) => () => void;
  };
}

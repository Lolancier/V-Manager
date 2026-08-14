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
    chatModel: string;
  };
  embedding: {
    apiKey: string;
    baseUrl: string;
    model: string;
  };
  appearance: {
    theme: "light" | "dark";
    live2dModel: string;
    mouseFollow: boolean;
    hoverAutoHide: boolean;
    renderFps: number;
    powerSaving: boolean;
  };
  voice: {
    enabled: boolean;
    provider: "local" | "gpt_sovits" | "elevenlabs";
    localPackId: string;
    localSpeakerId: number;
    localSpeed: number;
    localSilenceScale: number;
    gptSovitsBaseUrl: string;
    gptSovitsProfileId: string;
    gptSovitsSpeed: number;
    gptSovitsAutoStart: boolean;
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
  astrbot: {
    enabled: boolean;
    baseUrl: string;
    apiKey: string;
    contactMap: Record<string, string>;
  };
  relationship: {
    enabled: boolean;
    showProgress: boolean;
  };
  proactive: {
    enabled: boolean;
    socialCheckins: boolean;
    healthReminders: boolean;
    lateNightCare: boolean;
    systemNotifications: boolean;
    workMinutes: number;
    reminderCooldownMinutes: number;
    minimumIntervalMinutes: number;
    dailyLimit: number;
    idleResetMinutes: number;
    viviRestAfterMinutes: number;
    lateNightHour: number;
    quietStart: string;
    quietEnd: string;
  };
  interests: {
    enabled: boolean;
    permissionLevel: "off" | "diary_only" | "create" | "preview" | "autonomous";
    activities: { diary: boolean; miniGames: boolean; drawing: boolean };
    dailyTaskLimit: number;
    dailyTokenBudget: number;
    maxTaskMinutes: number;
    maxDiskMB: number;
    idleMinutes: number;
    minimumHoursBetweenTasks: number;
    activeStart: string;
    activeEnd: string;
    diaryHour: number;
    diaryTime: string;
    autoOpenPreview: boolean;
    selfPlayGames: boolean;
    selfPlayMaxSeconds: number;
    selfPlayMaxActions: number;
    selfRepairAttempts: number;
    autonomousLifeEnabled: boolean;
    virtualScheduleEnabled: boolean;
    autonomousRoutineLimit: number;
    entertainmentDailyLimit: number;
    autonomousActivities: {
      collectDiaryMaterials: boolean; browseInformation: boolean; organizeMemory: boolean;
      playExistingGame: boolean; improveExistingGame: boolean; reviewDrawing: boolean;
      planCreation: boolean; rest: boolean; prepareChatTopics: boolean;
    };
    networkAccess: "off" | "weather" | "weather_news";
    autoLocation: boolean;
    weatherLocation: string;
    newsTopics: { hot: boolean; gaming: boolean; science: boolean; ai: boolean };
    newsFeeds: string[];
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
  capabilities?: {
    expressionCount: number;
    motionGroupCount: number;
    hasLipSync: boolean;
    hasEyeBlink: boolean;
    hasDisplayInfo: boolean;
  };
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
  modelSize: number;
  executablePath: string;
  modelPath: string;
  root: string;
  modelId: string;
}

interface StartupStatus {
  phase: "booting" | "voice" | "models" | "data" | "renderer" | "ready" | "warning";
  progress: number;
  title: string;
  detail: string;
  warning?: string;
}

interface GptSovitsRuntimeStatus {
  ready: boolean;
  started?: boolean;
  stopped?: boolean;
}

interface LocalTtsPackStatus {
  id: string;
  name: string;
  description: string;
  language: string;
  engine: string;
  modelSizeMB: number;
  downloadSizeMB: number;
  license: string;
  sourceUrl: string;
  speakers: Array<{ id: number; name: string }>;
  installed: boolean;
  modelSize: number;
  root: string;
  packDir: string;
}

interface GptSovitsProfileStatus {
  id: string;
  name: string;
  author: string;
  description: string;
  version: string;
  license: string;
  sourceUrl: string;
  promptText: string;
  promptLang: string;
  textLang: string;
  recommendedSpeed?: number;
  imported?: boolean;
  downloadable?: boolean;
  installed: boolean;
  root: string;
  files: Array<{ role: string; name: string; size: number; sha256: string; path: string; downloaded: boolean; actualSize: number; hashValid: boolean }>;
}

interface RelationshipProfile {
  version: number;
  affection: {
    score: number;
    stage: "new" | "familiar" | "friend" | "close_friend" | "kindred";
    stageLabel: string;
    interactions: number;
    touchInteractions: number;
    positiveInteractions: number;
    negativeInteractions: number;
  };
  emotion: {
    valence: number;
    arousal: number;
    label: string;
    suggestedMood: string;
  };
  daily: {
    date: string;
    positiveGrowth: number;
  };
  createdAt: string;
  lastInteractionAt: string | null;
  updatedAt: string;
}

interface PersonaPayload {
  identityName: string;
  identity: string;
  selfReference: string;
  userAddress: string;
  relationship: string;
  values: string[];
  personalityTraits: string[];
  speechStyle: string;
  habits: string;
  boundaries: string;
  background: string;
  cosplay: string;
  extra: string;
  exampleLines: string[];
  live2dModelId: string;
}

interface PersonaCard {
  id: string;
  name: string;
  status: "active" | "archived";
  version: number;
  isActive?: boolean;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  payload: PersonaPayload;
}

interface PersonaGenerationSource {
  title: string;
  url: string;
  snippet: string;
}

interface PersonaGenerationResult {
  draft: { name: string; payload: PersonaPayload };
  sources: PersonaGenerationSource[];
  searchWarning?: string;
}

interface MemoryDatabaseStats {
  path: string;
  rawMessageCount: number;
  conversationCount: number;
  personaCardCount: number;
  schemaVersion: number;
}

interface AgentBootstrap {
  config: AgentConfig;
  relationshipProfile: RelationshipProfile;
  personaCards?: PersonaCard[];
  activePersonaCard?: PersonaCard | null;
  memoryDatabase?: MemoryDatabaseStats;
  startupDiagnostics?: {
    rag: null | Record<string, unknown>;
    deepseek: "unchecked" | "ready" | "unavailable" | "not_configured";
    historyRestored: number;
  };
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
    responseMode: "deepseek" | "deepseek_chat" | "deepseek_tool" | "fallback_local" | "local_tool";
    usedKnowledge: boolean;
    knowledgeCount: number;
    knowledgeFiles: string[];
    fallbackReason: string;
    localTool?: string;
    model?: string;
    detectedMood?: string;
    faceParams?: Record<string, number>;
    relationship?: RelationshipProfile;
    codeMode?: CodeAgentMode;
    toolUseCount?: number;
  };
}

interface LifeState {
  version: number;
  ownerStatus: "active" | "away";
  viviStatus: "companion" | "resting";
  sessionStartedAt: string | null;
  lastTickAt: string;
  lastActiveAt: string;
  lastInteractionAt?: string | null;
  activeMinutes: number;
  energy: number;
  restUntil: string | null;
  pausedUntil: string | null;
  lastProactiveAt?: string | null;
  daily: { date: string; proactiveCount: number };
  updatedAt: string;
}

interface CompanionMemoryStore {
  version: number;
  facts: Array<{ id: string; content: string; createdAt: string }>;
  episodes: Array<{ id: string; content: string; createdAt: string }>;
  habits: Array<{ id: string; content: string; createdAt: string }>;
  commitments: Array<{ id: string; content: string; createdAt: string; status: "open" | "resolved"; lastFollowUpDate?: string | null }>;
  feedback: { ignored: number; later: number; liked: number; interruptionScore: number; lastFeedbackAt?: string | null };
  updatedAt?: string | null;
}

type InterestActivityType = "diary" | "mini_game" | "drawing" | "collect_diary_materials" | "browse_information" | "organize_memory" | "play_existing_game" | "improve_existing_game" | "review_drawing" | "plan_creation" | "rest" | "prepare_chat_topics";

interface InterestGamePlaytest {
  ok: boolean;
  outcome: "won" | "lost" | "ran" | "failed" | "cancelled";
  cancelled?: boolean;
  highestScore: number | null;
  actions: number;
  durationMs: number;
  screenshotPath: string;
  reflection: string;
  repairAttempts: number;
  state?: { protocolDetected?: boolean; stateChanged?: boolean; status?: string; message?: string; bodyText?: string };
  errors: Array<{ type: string; message: string }>;
  timeline?: Array<{ stage: string; label: string; actions?: number; highestScore?: number | null; at: string; message?: string; key?: string }>;
  playedAt: string;
}

interface InterestSandboxActivity {
  id: string;
  day: string;
  type: InterestActivityType;
  category?: "light" | "creative" | "entertainment" | "companion";
  routineId?: string;
  status: "completed" | "failed" | "cancelled";
  title: string;
  summary: string;
  artifactPath: string;
  sourcePath?: string;
  tokens: number;
  action?: "created" | "updated";
  personaCardId?: string;
  personaVersion?: number;
  personaName?: string;
  relatedActivityIds?: string[];
  playtest?: InterestGamePlaytest;
  createdAt: string;
}

interface InterestSandboxSnapshot {
  root: string;
  activities: InterestSandboxActivity[];
  today: { date: string; taskCount: number; creativeTaskCount: number; lightActivityCount: number; entertainmentCount: number; companionActivityCount: number; diaryWritten: boolean; tokenCount: number; tokenBudget?: number | null };
  diskBytes: number;
  storage: {
    byType: { diary: number; drawing: number; mini_game: number; life: number };
    failedCount: number;
    completedCount: number;
    personaCount: number;
  };
  session: { day: string; launchedAt: string; diaryDueAt: string; diaryScheduleTime?: string; lastTaskCompletedAt?: string | null; pendingActivity?: InterestActivityType | null; budgetRequestNotified?: boolean };
  routine: Array<{ id: string; type: InterestActivityType; plannedType?: InterestActivityType; title?: string; category?: "light" | "creative" | "entertainment" | "companion"; dueAt: string; status: "scheduled" | "due" | "completed" | "missed"; completedAt?: string | null }>;
  location: { latitude: number; longitude: number; accuracy: number; city?: string; region?: string; country?: string; source: string; updatedAt: string } | null;
}

interface InterestRuntimeState {
  status: "idle" | "working";
  type: InterestActivityType | null;
  label: string;
  startedAt: string | null;
  activityId?: string | null;
  title?: string;
  phase?: string;
  progress?: { stage: string; label: string; actions?: number; highestScore?: number | null; at: string; message?: string; key?: string } | null;
  logs?: Array<{ stage: string; label: string; actions?: number; highestScore?: number | null; at: string; message?: string; key?: string }>;
}

interface ScheduleItem {
  id: string;
  type: "reminder" | "power";
  action?: "shutdown" | "restart";
  title: string;
  message: string;
  dueAt: string;
  status: "pending_confirmation" | "scheduled" | "executing" | "completed" | "cancelled" | "missed" | "failed";
  createdAt: string;
  confirmedAt?: string | null;
  integration?: {
    windows?: { status: string; taskName?: string; dueAt?: string; error?: string };
  };
}

type CodeAgentMode = "auto" | "read" | "plan" | "agent" | "review";

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

interface ManagedDirectoryScan {
  root: string;
  scannedAt: string;
  total: number;
  files: Array<{ name: string; path: string; type: string; size: number; modifiedAt: string }>;
}

interface FileOrganizationPreview {
  id: string;
  root: string;
  mode: "type" | "date";
  kind: "organize" | "quarantine";
  status: "pending" | "executed";
  moves: Array<{ source: string; destination: string; name: string; type: string; size: number; modifiedAt: string }>;
}

interface FileOperation {
  id: string;
  kind: string;
  status: string;
  undoable: boolean;
  createdAt: string;
  moves: Array<{ from: string; to: string }>;
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
    getStartupStatus: () => Promise<StartupStatus>;
    notifyRendererReady: (payload: { view: string; modelStatus?: "ready" | "error" }) => void;
    saveConfig: (config: AgentConfig) => Promise<AgentConfig>;
    listPersonaCards: () => Promise<PersonaCard[]>;
    createPersonaCard: (input: { name: string; payload: PersonaPayload }) => Promise<{ card: PersonaCard; cards: PersonaCard[] }>;
    generatePersonaCardDraft: (input: { description: string; useWeb: boolean; requestedName?: string; live2dModelId?: string }) => Promise<PersonaGenerationResult>;
    updatePersonaCard: (cardId: string, input: { name: string; payload: PersonaPayload }) => Promise<{ card: PersonaCard; cards: PersonaCard[]; config?: AgentConfig }>;
    activatePersonaCard: (cardId: string) => Promise<{ card: PersonaCard; cards: PersonaCard[]; config: AgentConfig }>;
    archivePersonaCard: (cardId: string) => Promise<PersonaCard[]>;
    restorePersonaCard: (cardId: string) => Promise<PersonaCard[]>;
    getMemoryDatabaseStats: () => Promise<MemoryDatabaseStats>;
    getLive2DModels: () => Promise<Live2DModelOption[]>;
    refreshLive2DModels: () => Promise<Live2DModelOption[]>;
    openLive2DModelsFolder: () => Promise<string>;
    selectAsmrTextFile: () => Promise<{ path: string; content: string } | null>;
    generateAsmrScript: (mode: string, prompt: string) => Promise<string>;
    listElevenLabsVoices: (voiceConfig?: AgentConfig["voice"]) => Promise<ElevenLabsVoiceOption[]>;
    synthesizeSpeech: (text: string, asmr: boolean, voiceConfig?: AgentConfig["voice"]) => Promise<{ audioBase64: string; mimeType: string; requestId: string; characterCost: string; cached: boolean }>;
    reportSpeechSignal: (signal: { active: boolean; level: number; phase?: "start" | "end" | "fallback"; text?: string; durationMs?: number; finalSegment?: boolean; mood?: string; faceParams?: Record<string, number> | null }) => void;
    listLocalTtsPacks: () => Promise<LocalTtsPackStatus[]>;
    installLocalTtsPack: (packId: string) => Promise<LocalTtsPackStatus>;
    openLocalTtsFolder: () => Promise<string>;
    listGptSovitsProfiles: () => Promise<GptSovitsProfileStatus[]>;
    installGptSovitsProfile: (profileId: string) => Promise<GptSovitsProfileStatus>;
    importGptSovitsProfile: (input: { id?: string; name: string; author?: string; version?: string; sourceUrl: string; license?: string; promptText: string; promptLang: string; textLang: string; description?: string }) => Promise<GptSovitsProfileStatus | null>;
    getGptSovitsRuntimeStatus: (baseUrl?: string) => Promise<GptSovitsRuntimeStatus>;
    startGptSovitsRuntime: (baseUrl?: string) => Promise<GptSovitsRuntimeStatus>;
    stopGptSovitsRuntime: (baseUrl?: string) => Promise<GptSovitsRuntimeStatus>;
    getLocalSttStatus: (modelId?: string) => Promise<LocalSttStatus>;
    installLocalStt: (modelId: string) => Promise<LocalSttStatus>;
    transcribeLocalSpeech: (audioBytes: Uint8Array) => Promise<{ text: string; modelId: string; language: string }>;
    openLocalSttFolder: () => Promise<string>;
    getRelationshipProfile: () => Promise<RelationshipProfile>;
    resetRelationshipProfile: () => Promise<RelationshipProfile>;
    petTouch: () => Promise<{ ok: boolean; busy?: boolean; cooldownMs?: number; reply?: string; mood?: string; faceParams?: Record<string, number>; profile?: RelationshipProfile }>;
    chat: (payload: { message: string; codeContext?: { mode: CodeAgentMode; activeFile?: string } }) => Promise<ChatWindowState>;
    searchFiles: (query: string) => Promise<FileSearchResult[]>;
    getAppRegistry: () => Promise<AppRegistrySnapshot>;
    refreshAppRegistry: () => Promise<AppRegistrySnapshot>;
    getRagStatus: () => Promise<RagStatusSnapshot>;
    rebuildRagIndex: () => Promise<{ version: number; updatedAt: string | null; chunks: unknown[]; files: unknown[]; embeddedCount: number }>;
    testEmbedding: () => Promise<{ ok: boolean; message: string; model: string; baseUrl: string; dimensions?: number }>;
    getSystemResourceSnapshot: () => Promise<SystemResourceSnapshot>;
    getFileManagerSnapshot: () => Promise<FileManagerSnapshot>;
    scanManagedDirectory: (target: string) => Promise<ManagedDirectoryScan>;
    previewFileOrganization: (target: string, mode: "type" | "date", quarantine: boolean) => Promise<FileOrganizationPreview>;
    executeFileOrganization: (previewId: string) => Promise<FileOperation>;
    listFileOperations: () => Promise<FileOperation[]>;
    undoFileOperation: (operationId?: string) => Promise<FileOperation>;
    openExternal: (url: string) => Promise<boolean>;
    testDeepSeek: () => Promise<{ ok: boolean; message: string; config: AgentConfig }>;
    testAstrBot: (config?: AgentConfig["astrbot"]) => Promise<{ ok: boolean; message: string; bots: unknown[] }>;
    clearMemory: () => Promise<boolean>;
    showPetContextMenu: () => void;
    openSettingsWindow: () => Promise<boolean>;
    openComposerWindow: () => Promise<boolean>;
    openChatWindow: () => Promise<boolean>;
    openCodeWindow: () => Promise<boolean>;
    getAutoLaunch: () => Promise<boolean>;
    setAutoLaunch: (enabled: boolean) => Promise<boolean>;
    getLifeState: () => Promise<LifeState>;
    getCompanionMemory: () => Promise<CompanionMemoryStore>;
    getInterestSandbox: () => Promise<InterestSandboxSnapshot>;
    getInterestState: () => Promise<InterestRuntimeState>;
    cleanupInterestSandbox: (mode: "failed_logs" | "all_content") => Promise<{ result: { removedLogs: number; removedFiles: number; reclaimedBytes: number }; snapshot: InterestSandboxSnapshot }>;
    updateInterestLocation: (location: { latitude: number; longitude: number; accuracy: number }) => Promise<InterestSandboxSnapshot>;
    runInterestActivity: (type: InterestActivityType) => Promise<{ activity: InterestSandboxActivity; snapshot: InterestSandboxSnapshot; playtest?: InterestGamePlaytest }>;
    playInterestGame: (activityId: string) => Promise<{ activity: InterestSandboxActivity; playtest: InterestGamePlaytest; snapshot: InterestSandboxSnapshot }>;
    interruptInterestActivity: () => Promise<{ interrupted: boolean; label?: string }>;
    openInterestSandbox: () => Promise<string>;
    openInterestCategory: (category: InterestActivityType) => Promise<string>;
    openInterestArtifact: (artifactPath: string) => Promise<boolean>;
    pauseProactiveToday: () => Promise<LifeState>;
    resetWorkSession: () => Promise<LifeState>;
    listSchedules: () => Promise<ScheduleItem[]>;
    cancelSchedule: (id: string) => Promise<ScheduleItem>;
    openScaleWindow: () => Promise<boolean>;
    openExpressionWindow: () => Promise<boolean>;
    triggerExpression: (name: string) => Promise<boolean>;
    clearExpressions: () => Promise<boolean>;
    getChatState: () => Promise<ChatWindowState>;
    getCodeWorkspace: () => Promise<CodeWorkspaceSnapshot>;
    selectCodeWorkspace: () => Promise<CodeWorkspaceSnapshot | null>;
    readCodeFile: (path: string) => Promise<{ ok: boolean; path: string; content: string; truncated: boolean }>;
    writeCodeFile: (path: string, content: string, expectedContent: string) => Promise<{ ok: boolean; path: string; changed: boolean }>;
    getPetWindowBounds: () => Promise<{ x: number; y: number; width: number; height: number }>;
    getPetScale: () => Promise<number>;
    getPositionLock: () => Promise<boolean>;
    setPositionLock: (locked: boolean) => Promise<boolean>;
    setPetWindowPosition: (x: number, y: number) => Promise<boolean>;
    setPetMousePassthrough: (ignore: boolean) => void;
    updatePetWindowLayout: (scale: number) => Promise<{ width: number; height: number } | null>;
    updateBubbleWindowSize: (width: number, height: number) => Promise<{ placement: "left" | "right" } | null>;
    getDataPath: () => Promise<{ baseDir: string; dataDir: string; configPath: string; memoryPath: string; knowledgeDir: string; personaKnowledgePath: string; personaDatabasePath: string; ragDir: string; registryDir: string }>;
    openDataFolder: () => Promise<boolean>;
    openPersonaFolder: () => Promise<string>;
    onMenuAction: (callback: (action: string) => void) => () => void;
    onStartupProgress: (callback: (status: StartupStatus) => void) => () => void;
    onConfigUpdated: (callback: (config: AgentConfig) => void) => () => void;
    onAutoLaunchUpdated: (callback: (enabled: boolean) => void) => () => void;
    onLifeStateUpdated: (callback: (state: LifeState) => void) => () => void;
    onSchedulesUpdated: (callback: (items: ScheduleItem[]) => void) => () => void;
    onLive2DModelsUpdated: (callback: (models: Live2DModelOption[]) => void) => () => void;
    onPetScaleUpdated: (callback: (scale: number) => void) => () => void;
    onChatStateUpdated: (callback: (state: ChatWindowState) => void) => () => void;
    onBubblePlacementUpdated: (callback: (placement: "left" | "right") => void) => () => void;
    onLocalSttProgress: (callback: (progress: { phase: "runtime" | "model"; received: number; total: number; percent: number }) => void) => () => void;
    onLocalTtsProgress: (callback: (progress: { phase: "voice-pack"; packId: string; received: number; total: number; percent: number }) => void) => () => void;
    onGptSovitsProgress: (callback: (progress: { phase: "gpt-sovits-profile"; profileId: string; file: string; received: number; total: number; percent: number }) => void) => () => void;
    onPositionLockUpdated: (callback: (locked: boolean) => void) => () => void;
    onTriggerExpression: (callback: (name: string) => void) => () => void;
    onClearExpressions: (callback: () => void) => () => void;
    onExpressionsUpdated: (callback: (expressions: string[]) => void) => () => void;
    onInterestStateUpdated: (callback: (state: InterestRuntimeState) => void) => () => void;
    onCursorScreenPosition: (callback: (position: { screenX: number; screenY: number; clientX: number; clientY: number }) => void) => () => void;
    onMoodUpdated?: (callback: (payload: {
      phase?: "anticipation" | "final";
      mood: string;
      faceParams: Record<string, number> | null;
      reply?: string;
      kind?: string;
      confidence?: number;
      intensity?: number;
      durationMs?: number;
    }) => void) => () => void;
    onSpeechSignalUpdated?: (callback: (signal: { active: boolean; level: number; phase?: "start" | "end" | "fallback"; text?: string; durationMs?: number; finalSegment?: boolean; mood?: string; faceParams?: Record<string, number> | null }) => void) => () => void;
    onRelationshipUpdated: (callback: (profile: RelationshipProfile) => void) => () => void;
  };
}

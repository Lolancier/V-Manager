import type {
  Dispatch,
  FormEventHandler,
  KeyboardEventHandler,
  ReactNode,
  RefObject,
  SetStateAction
} from "react";
import { CodeWorkbenchView } from "./window-views";
import {
  AppearanceSettingsSection,
  InterestsSettingsSection,
  IntelligenceSettingsSections,
  PersonaSettingsSection,
  ProactiveSettingsSection,
  VoiceSettingsSection
} from "./settings-sections";
import type {
  AsmrMode,
  AsmrModeOption,
  ChatMessage,
  CodeAgentModeOption,
  DataPathInfo,
  DeepSeekModelPreset,
  GptSovitsImportDraft,
  PersonaDraft,
  RuntimeReplyMeta,
  SettingsSection,
  SetConfigDraft,
  VoiceConnectionState
} from "./runtime-types";

type DesktopBridge = Window["agentDesktop"];
type InterestActivityRecord = NonNullable<InterestSandboxSnapshot["activities"]>[number];
type InterestRoutineItem = NonNullable<InterestSandboxSnapshot["routine"]>[number];

export const settingsSections: Array<{ id: SettingsSection; label: string; description: string }> = [
  { id: "appearance", label: "个性化", description: "主题与窗口外观" },
  { id: "persona", label: "角色与陪伴", description: "称呼、性格和表达方式" },
  { id: "proactive", label: "主动陪伴", description: "工作感知、休息和关怀频率" },
  { id: "interests", label: "Vivi的私密空间", description: "沙盒权限、活动记录与作品查看" },
  { id: "intelligence", label: "模型与记忆", description: "对话模型、知识库和上下文" },
  { id: "voice", label: "语音与 ASMR", description: "语音接口、耳语脚本和音色" },
  { id: "abilities", label: "桌面能力", description: "系统状态、文件和本地工具" },
  { id: "storage", label: "数据与隐私", description: "本地数据位置和管理" }
];

type SettingsWindowRootProps = {
  statusText: string;
  settingsSection: SettingsSection;
  setSettingsSection: Dispatch<SetStateAction<SettingsSection>>;
  handleSave: () => Promise<void>;
  saving: boolean;
  saveMessage: string;
  bridge: DesktopBridge;
  bootstrap: AgentBootstrap;
  configDraft: AgentConfig;
  setConfigDraft: SetConfigDraft;
  autoLaunchEnabled: boolean;
  setAutoLaunchEnabled: Dispatch<SetStateAction<boolean>>;
  live2dModels: Live2DModelOption[];
  dataPathInfo: DataPathInfo | null;
  scanningModels: boolean;
  refreshLive2DModelList: () => Promise<void>;
  personaDraft: PersonaDraft;
  setPersonaDraft: Dispatch<SetStateAction<PersonaDraft>>;
  personaMessage: string;
  setPersonaMessage: Dispatch<SetStateAction<string>>;
  createPersonaDraft: () => PersonaDraft;
  personaAiPrompt: string;
  setPersonaAiPrompt: Dispatch<SetStateAction<string>>;
  personaAiUseWeb: boolean;
  setPersonaAiUseWeb: Dispatch<SetStateAction<boolean>>;
  personaAiGenerating: boolean;
  handleGeneratePersonaCard: (createImmediately?: boolean) => Promise<void>;
  personaAiSources: PersonaGenerationSource[];
  personaSearch: string;
  setPersonaSearch: Dispatch<SetStateAction<string>>;
  personaListFilter: "all" | "active" | "archived";
  setPersonaListFilter: Dispatch<SetStateAction<"all" | "active" | "archived">>;
  visiblePersonaCards: PersonaCard[];
  personaCards: PersonaCard[];
  selectPersonaCard: (card: PersonaCard) => void;
  updatePersonaPayload: <K extends keyof PersonaPayload>(key: K, value: PersonaPayload[K]) => void;
  savingPersona: boolean;
  handleSavePersonaCard: () => Promise<void>;
  handleActivatePersonaCard: () => Promise<void>;
  handleArchivePersonaCard: () => Promise<void>;
  handleRestorePersonaCard: () => Promise<void>;
  relationshipProfile: RelationshipProfile;
  relationshipNextStage: (profile: RelationshipProfile) => string;
  resettingRelationship: boolean;
  handleResetRelationship: () => Promise<void>;
  selectedModelPreset: string;
  handleModelPresetChange: (nextValue: string) => void;
  deepSeekModelPresets: readonly DeepSeekModelPreset[];
  ragStatus: RagStatusSnapshot | null;
  loadingRagStatus: boolean;
  handleRefreshRagStatus: () => Promise<void>;
  rebuildingIndex: boolean;
  handleRebuildRagIndex: () => Promise<void>;
  testingEmbedding: boolean;
  handleTestEmbedding: () => Promise<void>;
  rebuildMessage: string;
  embeddingTestMessage: string;
  lastReplyMeta: RuntimeReplyMeta | null;
  handleTestConnection: () => Promise<void>;
  testingConnection: boolean;
  handleClearMemory: () => Promise<void>;
  clearingMemory: boolean;
  connectionMessage: string;
  knowledge: AgentKnowledge[];
  handleTestAstrBot: () => Promise<void>;
  astrBotConnectionMessage: string;
  managedTarget: string;
  setManagedTarget: Dispatch<SetStateAction<string>>;
  managedMode: "type" | "date";
  setManagedMode: Dispatch<SetStateAction<"type" | "date">>;
  handleManagedScan: () => Promise<void>;
  handleOrganizationPreview: (quarantine: boolean) => Promise<void>;
  handleUndoFileOperation: (operationId?: string) => Promise<void>;
  handleExecuteOrganization: () => Promise<void>;
  fileManagerMessage: string;
  managedScan: ManagedDirectoryScan | null;
  organizationPreview: FileOrganizationPreview | null;
  fileOperations: FileOperation[];
  setFileOperations: Dispatch<SetStateAction<FileOperation[]>>;
  handleRefreshSystemSnapshot: () => Promise<void>;
  loadingSystemSnapshot: boolean;
  systemSnapshot: SystemResourceSnapshot | null;
  handleRefreshFileSnapshot: () => Promise<void>;
  loadingFileSnapshot: boolean;
  fileSnapshot: FileManagerSnapshot | null;
  fileQuery: string;
  setFileQuery: Dispatch<SetStateAction<string>>;
  handleFileSearch: () => Promise<void>;
  fileResults: FileSearchResult[];
  localTtsPacks: LocalTtsPackStatus[];
  installingLocalTts: boolean;
  localTtsProgress: number;
  handleInstallLocalTtsPack: () => Promise<void>;
  localTtsMessage: string;
  gptSovitsRuntimeStatus: GptSovitsRuntimeStatus;
  gptSovitsProfiles: GptSovitsProfileStatus[];
  gptSovitsRuntimeBusy: "start" | "stop" | null;
  handleGptSovitsRuntime: (action: "start" | "stop") => Promise<void>;
  installingGptSovits: boolean;
  gptSovitsProgress: number;
  handleInstallGptSovitsProfile: () => Promise<void>;
  showGptSovitsImport: boolean;
  setShowGptSovitsImport: Dispatch<SetStateAction<boolean>>;
  gptSovitsImportDraft: GptSovitsImportDraft;
  setGptSovitsImportDraft: Dispatch<SetStateAction<GptSovitsImportDraft>>;
  importingGptSovits: boolean;
  handleImportGptSovitsProfile: () => Promise<void>;
  gptSovitsMessage: string;
  elevenLabsModelPresets: readonly DeepSeekModelPreset[];
  availableVoiceOptions: ElevenLabsVoiceOption[];
  setVoiceConnectionState: Dispatch<SetStateAction<VoiceConnectionState>>;
  setVoiceConnectionMessage: Dispatch<SetStateAction<string>>;
  loadingVoices: boolean;
  handleLoadElevenLabsVoices: () => Promise<void>;
  voiceConnectionState: VoiceConnectionState;
  voiceConnectionMessage: string;
  localSttStatus: LocalSttStatus | null;
  installingLocalStt: boolean;
  localSttProgress: { phase: "runtime" | "model"; percent: number } | null;
  handleInstallLocalStt: () => Promise<void>;
  voiceInputMessage: string;
  asmrModes: AsmrModeOption[];
  asmrMode: AsmrMode;
  setAsmrMode: Dispatch<SetStateAction<AsmrMode>>;
  asmrPrompt: string;
  setAsmrPrompt: Dispatch<SetStateAction<string>>;
  asmrScript: string;
  setAsmrScript: Dispatch<SetStateAction<string>>;
  previewingVoice: boolean;
  handlePreviewAsmrVoice: () => Promise<void>;
  generatingAsmr: boolean;
  handleGenerateAsmrScript: () => Promise<void>;
  handleCreateAsmrTemplate: () => void;
  handleImportAsmrText: () => Promise<void>;
  setAsmrMessage: Dispatch<SetStateAction<string>>;
  asmrMessage: string;
  lifeState: LifeState | null;
  setLifeState: Dispatch<SetStateAction<LifeState | null>>;
  companionMemory: CompanionMemoryStore | null;
  setCompanionMemory: Dispatch<SetStateAction<CompanionMemoryStore | null>>;
  schedules: ScheduleItem[];
  setSchedules: Dispatch<SetStateAction<ScheduleItem[]>>;
  interestRuntimeState: InterestRuntimeState;
  interestSnapshot: InterestSandboxSnapshot | null;
  todayDiaryActivity: InterestActivityRecord | undefined;
  formatDiarySchedule: (dueAt: string | undefined, nowMs: number) => string;
  interestScheduleClock: number;
  nextInterestRoutine: InterestRoutineItem | undefined;
  interestActivityLabel: (type: InterestActivityType) => string;
  completedInterestRoutineCount: number;
  interestCategoryLabel: (category?: string) => string;
  handleRefreshInterestLocation: () => Promise<void>;
  formatStorageBytes: (value: number | undefined) => string;
  interestRunning: InterestActivityType | null;
  handleInterestActivity: (type: InterestActivityType) => Promise<void>;
  setInterestSnapshot: Dispatch<SetStateAction<InterestSandboxSnapshot | null>>;
  interestMessage: string;
  handleCleanupInterest: (mode: "failed_logs" | "game_content" | "all_content") => Promise<void>;
  cleaningInterest: boolean;
  filteredInterestActivities: InterestActivityRecord[];
  interestLogStatus: "all" | "completed" | "failed";
  setInterestLogStatus: Dispatch<SetStateAction<"all" | "completed" | "failed">>;
  interestLogPersona: string;
  setInterestLogPersona: Dispatch<SetStateAction<string>>;
  interestPersonaOptions: Array<{ id: string; name: string }>;
  pagedInterestActivities: InterestActivityRecord[];
  handlePlayInterestGame: (activityId: string) => Promise<void>;
  safeInterestLogPage: number;
  interestLogPageCount: number;
  setInterestLogPage: Dispatch<SetStateAction<number>>;
};

type CodeWindowRootProps = {
  codeWorkspaceRoot: string;
  codeAgentModes: CodeAgentModeOption[];
  codeAgentMode: CodeAgentMode;
  changeCodeAgentMode: (mode: CodeAgentMode) => void;
  lastReplyMeta: RuntimeReplyMeta | null;
  sending: boolean;
  refreshCodeWorkspace: () => Promise<void>;
  selectCodeWorkspace: () => Promise<void>;
  openChatWindow: () => Promise<boolean> | undefined;
  codeFilter: string;
  setCodeFilter: Dispatch<SetStateAction<string>>;
  visibleEntries: CodeWorkspaceEntry[];
  collapsedCodeDirs: Set<string>;
  activeCodePath: string;
  toggleCodeDirectory: (path: string) => void;
  openCodeFile: (path: string) => Promise<void>;
  codeSaveMessage: string;
  codeFileLoading: boolean;
  codeEditing: boolean;
  setCodeDraftContent: Dispatch<SetStateAction<string>>;
  setCodeEditing: Dispatch<SetStateAction<boolean>>;
  setCodeSaveMessage: Dispatch<SetStateAction<string>>;
  activeCodeContent: string;
  codeDraftContent: string;
  codeSaving: boolean;
  saveActiveCodeFile: () => Promise<void>;
  codeWorkspaceError: string;
  codeLines: string[];
  personaName: string;
  messages: ChatMessage[];
  historyListRef: RefObject<HTMLDivElement | null>;
  setInput: Dispatch<SetStateAction<string>>;
  input: string;
  handleSend: FormEventHandler<HTMLFormElement>;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  handleComposerKeyDown: KeyboardEventHandler<HTMLTextAreaElement>;
};

export function SettingsWindowRoot(props: SettingsWindowRootProps) {
  const {
    statusText,
    settingsSection,
    setSettingsSection,
    handleSave,
    saving,
    saveMessage,
    bridge,
    bootstrap,
    configDraft,
    setConfigDraft,
    autoLaunchEnabled,
    setAutoLaunchEnabled,
    live2dModels,
    dataPathInfo,
    scanningModels,
    refreshLive2DModelList,
    personaDraft,
    setPersonaDraft,
    personaMessage,
    setPersonaMessage,
    createPersonaDraft,
    personaAiPrompt,
    setPersonaAiPrompt,
    personaAiUseWeb,
    setPersonaAiUseWeb,
    personaAiGenerating,
    handleGeneratePersonaCard,
    personaAiSources,
    personaSearch,
    setPersonaSearch,
    personaListFilter,
    setPersonaListFilter,
    visiblePersonaCards,
    personaCards,
    selectPersonaCard,
    updatePersonaPayload,
    savingPersona,
    handleSavePersonaCard,
    handleActivatePersonaCard,
    handleArchivePersonaCard,
    handleRestorePersonaCard,
    relationshipProfile,
    relationshipNextStage,
    resettingRelationship,
    handleResetRelationship,
    selectedModelPreset,
    handleModelPresetChange,
    deepSeekModelPresets,
    ragStatus,
    loadingRagStatus,
    handleRefreshRagStatus,
    rebuildingIndex,
    handleRebuildRagIndex,
    testingEmbedding,
    handleTestEmbedding,
    rebuildMessage,
    embeddingTestMessage,
    lastReplyMeta,
    handleTestConnection,
    testingConnection,
    handleClearMemory,
    clearingMemory,
    connectionMessage,
    knowledge,
    handleTestAstrBot,
    astrBotConnectionMessage,
    managedTarget,
    setManagedTarget,
    managedMode,
    setManagedMode,
    handleManagedScan,
    handleOrganizationPreview,
    handleUndoFileOperation,
    handleExecuteOrganization,
    fileManagerMessage,
    managedScan,
    organizationPreview,
    fileOperations,
    setFileOperations,
    handleRefreshSystemSnapshot,
    loadingSystemSnapshot,
    systemSnapshot,
    handleRefreshFileSnapshot,
    loadingFileSnapshot,
    fileSnapshot,
    fileQuery,
    setFileQuery,
    handleFileSearch,
    fileResults,
    localTtsPacks,
    installingLocalTts,
    localTtsProgress,
    handleInstallLocalTtsPack,
    localTtsMessage,
    gptSovitsRuntimeStatus,
    gptSovitsProfiles,
    gptSovitsRuntimeBusy,
    handleGptSovitsRuntime,
    installingGptSovits,
    gptSovitsProgress,
    handleInstallGptSovitsProfile,
    showGptSovitsImport,
    setShowGptSovitsImport,
    gptSovitsImportDraft,
    setGptSovitsImportDraft,
    importingGptSovits,
    handleImportGptSovitsProfile,
    gptSovitsMessage,
    elevenLabsModelPresets,
    availableVoiceOptions,
    setVoiceConnectionState,
    setVoiceConnectionMessage,
    loadingVoices,
    handleLoadElevenLabsVoices,
    voiceConnectionState,
    voiceConnectionMessage,
    localSttStatus,
    installingLocalStt,
    localSttProgress,
    handleInstallLocalStt,
    voiceInputMessage,
    asmrModes,
    asmrMode,
    setAsmrMode,
    asmrPrompt,
    setAsmrPrompt,
    asmrScript,
    setAsmrScript,
    previewingVoice,
    handlePreviewAsmrVoice,
    generatingAsmr,
    handleGenerateAsmrScript,
    handleCreateAsmrTemplate,
    handleImportAsmrText,
    setAsmrMessage,
    asmrMessage,
    lifeState,
    setLifeState,
    companionMemory,
    setCompanionMemory,
    schedules,
    setSchedules,
    interestRuntimeState,
    interestSnapshot,
    todayDiaryActivity,
    formatDiarySchedule,
    interestScheduleClock,
    nextInterestRoutine,
    interestActivityLabel,
    completedInterestRoutineCount,
    interestCategoryLabel,
    handleRefreshInterestLocation,
    formatStorageBytes,
    interestRunning,
    handleInterestActivity,
    setInterestSnapshot,
    interestMessage,
    handleCleanupInterest,
    cleaningInterest,
    filteredInterestActivities,
    interestLogStatus,
    setInterestLogStatus,
    interestLogPersona,
    setInterestLogPersona,
    interestPersonaOptions,
    pagedInterestActivities,
    handlePlayInterestGame,
    safeInterestLogPage,
    interestLogPageCount,
    setInterestLogPage
  } = props;

  return (
    <div className="settings-shell">
      <header className="settings-header">
        <div>
          <p className="eyebrow">设置窗口</p>
          <h1>{configDraft.personaName} 配置</h1>
          <p className="settings-subtitle">保存后会同步到桌宠主窗。当前状态：{statusText}</p>
        </div>
      </header>

      <div className="settings-product-layout">
        <nav className="settings-navigation" aria-label="设置分类">
          <div className="settings-nav-title">
            <strong>设置</strong>
            <span>{statusText}</span>
          </div>
          <div className="settings-nav-items">
            {settingsSections.map((section) => (
              <button
                className={settingsSection === section.id ? "is-active" : ""}
                type="button"
                key={section.id}
                onClick={() => setSettingsSection(section.id)}
              >
                <strong>{section.label}</strong>
                <span>{section.description}</span>
              </button>
            ))}
          </div>
          <div className="settings-nav-footer">
            <button className="settings-save-button" type="button" onClick={() => void handleSave()} disabled={saving}>
              {saving ? "正在保存..." : "保存更改"}
            </button>
            {saveMessage ? <p>{saveMessage}</p> : null}
          </div>
        </nav>

        <div className={`settings-grid settings-tab-${settingsSection}`}>
          <AppearanceSettingsSection
            configDraft={configDraft}
            setConfigDraft={setConfigDraft}
            autoLaunchEnabled={autoLaunchEnabled}
            setAutoLaunchEnabled={setAutoLaunchEnabled}
            bridge={bridge}
            live2dModels={live2dModels}
            dataPathInfo={dataPathInfo}
            scanningModels={scanningModels}
            refreshLive2DModelList={refreshLive2DModelList}
          />

          <PersonaSettingsSection
            bridge={bridge}
            dataPathInfo={dataPathInfo}
            personaDraft={personaDraft}
            setPersonaDraft={setPersonaDraft}
            personaMessage={personaMessage}
            setPersonaMessage={setPersonaMessage}
            createPersonaDraft={createPersonaDraft}
            personaAiPrompt={personaAiPrompt}
            setPersonaAiPrompt={setPersonaAiPrompt}
            personaAiUseWeb={personaAiUseWeb}
            setPersonaAiUseWeb={setPersonaAiUseWeb}
            personaAiGenerating={personaAiGenerating}
            handleGeneratePersonaCard={handleGeneratePersonaCard}
            personaAiSources={personaAiSources}
            personaSearch={personaSearch}
            setPersonaSearch={setPersonaSearch}
            personaListFilter={personaListFilter}
            setPersonaListFilter={setPersonaListFilter}
            visiblePersonaCards={visiblePersonaCards}
            personaCards={personaCards}
            selectPersonaCard={selectPersonaCard}
            updatePersonaPayload={updatePersonaPayload}
            live2dModels={live2dModels}
            savingPersona={savingPersona}
            handleSavePersonaCard={handleSavePersonaCard}
            handleActivatePersonaCard={handleActivatePersonaCard}
            handleArchivePersonaCard={handleArchivePersonaCard}
            handleRestorePersonaCard={handleRestorePersonaCard}
            relationshipProfile={relationshipProfile}
            configDraft={configDraft}
            setConfigDraft={setConfigDraft}
            relationshipNextStage={relationshipNextStage}
            resettingRelationship={resettingRelationship}
            handleResetRelationship={handleResetRelationship}
          />

          <IntelligenceSettingsSections
            configDraft={configDraft}
            setConfigDraft={setConfigDraft}
            bootstrap={bootstrap}
            selectedModelPreset={selectedModelPreset}
            handleModelPresetChange={handleModelPresetChange}
            deepSeekModelPresets={deepSeekModelPresets}
            ragStatus={ragStatus}
            loadingRagStatus={loadingRagStatus}
            handleRefreshRagStatus={handleRefreshRagStatus}
            rebuildingIndex={rebuildingIndex}
            handleRebuildRagIndex={handleRebuildRagIndex}
            testingEmbedding={testingEmbedding}
            handleTestEmbedding={handleTestEmbedding}
            rebuildMessage={rebuildMessage}
            embeddingTestMessage={embeddingTestMessage}
            lastReplyMeta={lastReplyMeta}
            handleSave={handleSave}
            saving={saving}
            handleTestConnection={handleTestConnection}
            testingConnection={testingConnection}
            handleClearMemory={handleClearMemory}
            clearingMemory={clearingMemory}
            saveMessage={saveMessage}
            connectionMessage={connectionMessage}
            knowledge={knowledge}
          />

          <section className="panel-block settings-panel-abilities">
            <p className="eyebrow">本地能力</p>
            <div className="ability-list">
              {bootstrap.abilities.map((ability) => (
                <article className="ability-card" key={ability.id}>
                  <div className="ability-row">
                    <strong>{ability.name}</strong>
                    <span className={`status ${ability.status}`}>{ability.status}</span>
                  </div>
                  <p>{ability.detail}</p>
                </article>
              ))}
            </div>
            <div className="relationship-settings">
              <div className="relationship-heading">
                <div>
                  <strong>消息联动 · 实验存档</strong>
                  <span>AstrBot、微信代发与自动回复已暂停开发，配置仅作保留</span>
                </div>
                <span className="relationship-stage">后续</span>
              </div>
              <label className="voice-switch">
                <input
                  type="checkbox"
                  checked={configDraft.astrbot.enabled}
                  disabled
                  onChange={(event) => setConfigDraft({
                    ...configDraft,
                    astrbot: { ...configDraft.astrbot, enabled: event.target.checked }
                  })}
                />
                保留 AstrBot 实验通道（非正式能力）
              </label>
              <label>
                AstrBot 地址
                <input
                  value={configDraft.astrbot.baseUrl}
                  placeholder="http://127.0.0.1:6185"
                  onChange={(event) => setConfigDraft({
                    ...configDraft,
                    astrbot: { ...configDraft.astrbot, baseUrl: event.target.value }
                  })}
                />
              </label>
              <label>
                API Key（只需 im scope）
                <input
                  type="password"
                  value={configDraft.astrbot.apiKey}
                  placeholder="abk_..."
                  onChange={(event) => setConfigDraft({
                    ...configDraft,
                    astrbot: { ...configDraft.astrbot, apiKey: event.target.value }
                  })}
                />
              </label>
              <label>
                联系人映射（每行：联系人=UMO）
                <textarea
                  rows={5}
                  defaultValue={Object.entries(configDraft.astrbot.contactMap).map(([name, umo]) => `${name}=${umo}`).join("\n")}
                  placeholder={"赵刘辛=weixin:FriendMessage:用户标识"}
                  onBlur={(event) => {
                    const contactMap = Object.fromEntries(event.target.value.split(/\r?\n/).map((line) => {
                      const separator = line.indexOf("=");
                      return separator > 0 ? [line.slice(0, separator).trim(), line.slice(separator + 1).trim()] : null;
                    }).filter((entry): entry is [string, string] => Boolean(entry?.[0] && entry?.[1])));
                    setConfigDraft({ ...configDraft, astrbot: { ...configDraft.astrbot, contactMap } });
                  }}
                />
              </label>
              <p className="knowledge-hint">UMO 可从 AstrBot 的消息会话/日志中取得。联系人需先与微信机器人建立过会话。</p>
              <div className="action-row">
                <button className="primary-button" type="button" onClick={() => void handleTestAstrBot()} disabled>
                  联动已暂停
                </button>
                <button className="ghost-button compact" type="button" onClick={() => void bridge?.openExternal("https://docs.astrbot.app/platform/weixin_oc.html")}>
                  打开接入文档
                </button>
              </div>
              {astrBotConnectionMessage ? <p className="feedback-text">{astrBotConnectionMessage}</p> : null}
            </div>
          </section>

          <section className="panel-block settings-panel-intelligence">
            <p className="eyebrow">回复状态</p>
            <div className="runtime-status-card">
              <div className="runtime-status-row">
                <strong>当前链路</strong>
                <span className={`runtime-badge ${lastReplyMeta?.responseMode ?? "fallback_local"}`}>
                  {lastReplyMeta?.sourceLabel ?? "尚未发送对话"}
                </span>
              </div>
              <p>
                本地检索：
                {lastReplyMeta
                  ? lastReplyMeta.usedKnowledge
                    ? `已命中 ${lastReplyMeta.knowledgeCount} 个知识片段`
                    : "本次未命中本地知识"
                  : "暂无记录"}
              </p>
              {lastReplyMeta?.knowledgeFiles.length ? <p>命中文件：{lastReplyMeta.knowledgeFiles.join("、")}</p> : null}
              {lastReplyMeta?.fallbackReason ? <p>补充信息：{lastReplyMeta.fallbackReason}</p> : null}
              <p className="runtime-tip">“测试连通性 OK” 只说明接口可访问，不代表每次回答都没有回退。</p>
            </div>
          </section>

          <section className="panel-block safe-file-manager-panel settings-panel-abilities">
            <div className="section-header-row">
              <div>
                <p className="eyebrow">安全文件管家</p>
                <span>只读扫描 → 整理预览 → 明确执行；禁止永久删除。</span>
              </div>
              <button className="ghost-button compact" type="button" disabled={!bridge} onClick={async () => setFileOperations(await bridge!.listFileOperations())}>
                操作日志
              </button>
            </div>
            <div className="inline-grid proactive-number-grid">
              <label>
                扫描目录
                <input value={managedTarget} onChange={(event) => setManagedTarget(event.target.value)} placeholder="downloads、desktop 或完整路径" />
              </label>
              <label>
                归档方式
                <select value={managedMode} onChange={(event) => setManagedMode(event.target.value as "type" | "date")}>
                  <option value="type">按文件类型</option>
                  <option value="date">按修改年月</option>
                </select>
              </label>
            </div>
            <div className="action-row">
              <button className="ghost-button compact" type="button" onClick={() => void handleManagedScan()} disabled={!bridge}>只读扫描</button>
              <button className="ghost-button compact" type="button" onClick={() => void handleOrganizationPreview(false)} disabled={!bridge}>生成整理预览</button>
              <button className="ghost-button compact" type="button" onClick={() => void handleOrganizationPreview(true)} disabled={!bridge}>生成隔离预览</button>
              <button className="ghost-button compact" type="button" onClick={() => void handleUndoFileOperation()} disabled={!bridge}>撤销最近操作</button>
            </div>
            {fileManagerMessage ? <p className="feedback-text">{fileManagerMessage}</p> : null}
            {managedScan ? <p className="knowledge-hint">{managedScan.root}：发现 {managedScan.total} 个可整理文件。</p> : null}
            {organizationPreview ? (
              <div className="organization-preview">
                <strong>{organizationPreview.kind === "quarantine" ? "隔离" : "整理"}预览 · {organizationPreview.moves.length} 项</strong>
                <div className="file-result-list">
                  {organizationPreview.moves.slice(0, 12).map((move) => (
                    <article className="file-result" key={`${move.source}-${move.destination}`}>
                      <strong>{move.name}</strong>
                      <span>{move.type}</span>
                      <p>{move.source} → {move.destination}</p>
                    </article>
                  ))}
                </div>
                <button className="primary-button" type="button" onClick={() => void handleExecuteOrganization()}>
                  确认并执行这份预览
                </button>
              </div>
            ) : null}
            {fileOperations.length ? (
              <div className="file-result-list operation-log-list">
                {fileOperations.slice(0, 8).map((operation) => (
                  <article className="file-result" key={`${operation.id}-${operation.status}`}>
                    <strong>{operation.kind} · {operation.moves.length} 项</strong>
                    <span>{operation.status}</span>
                    <p>{new Date(operation.createdAt).toLocaleString("zh-CN", { hour12: false })}</p>
                    {operation.undoable && operation.status === "completed" ? (
                      <button className="ghost-button compact" type="button" onClick={() => void handleUndoFileOperation(operation.id)}>撤销</button>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : null}
          </section>

          <section className="panel-block settings-panel-abilities">
            <div className="section-header-row">
              <p className="eyebrow">资源查看</p>
              <button
                className="ghost-button compact"
                type="button"
                onClick={() => void handleRefreshSystemSnapshot()}
                disabled={loadingSystemSnapshot}
              >
                {loadingSystemSnapshot ? "刷新中..." : "刷新"}
              </button>
            </div>
            {systemSnapshot ? (
              <>
                <div className="stats-grid">
                  <article className="stat-card">
                    <span>CPU</span>
                    <strong>{systemSnapshot.cpuUsagePercent}%</strong>
                  </article>
                  <article className="stat-card">
                    <span>内存</span>
                    <strong>
                      {systemSnapshot.usedMemoryGB} / {systemSnapshot.totalMemoryGB} GB
                    </strong>
                    <small>{systemSnapshot.memoryUsagePercent}%</small>
                  </article>
                  <article className="stat-card">
                    <span>运行进程</span>
                    <strong>{systemSnapshot.processCount}</strong>
                  </article>
                  <article className="stat-card">
                    <span>前台应用</span>
                    <strong>{systemSnapshot.visibleAppCount}</strong>
                  </article>
                </div>
                <p className="knowledge-hint">设备：{systemSnapshot.hostname} ｜ {systemSnapshot.cpuModel}</p>
                <div className="file-result-list">
                  {systemSnapshot.topProcesses.map((item) => (
                    <article className="file-result" key={`${item.name}-${item.pid}`}>
                      <strong>{item.name}</strong>
                      <span>PID {item.pid}</span>
                      <p>
                        内存 {item.memoryMB} MB ｜ CPU 时间 {item.cpuSeconds}s
                        {item.windowTitle ? ` ｜ 窗口：${item.windowTitle}` : ""}
                      </p>
                    </article>
                  ))}
                </div>
              </>
            ) : (
              <p className="knowledge-hint">点击刷新后可查看当前 CPU、内存和运行中的应用情况。</p>
            )}
          </section>

          <section className="panel-block settings-panel-abilities">
            <div className="section-header-row">
              <p className="eyebrow">文件管理</p>
              <button
                className="ghost-button compact"
                type="button"
                onClick={() => void handleRefreshFileSnapshot()}
                disabled={loadingFileSnapshot}
              >
                {loadingFileSnapshot ? "刷新中..." : "刷新"}
              </button>
            </div>
            {fileSnapshot ? (
              <>
                <p className="knowledge-hint">桌面路径：{fileSnapshot.desktopPath}</p>
                <div className="file-group">
                  <strong>桌面应用/快捷方式</strong>
                  <div className="file-result-list">
                    {fileSnapshot.desktopApps.map((item) => (
                      <article className="file-result" key={`desktop-app-${item.location}-${item.name}`}>
                        <strong>{item.name}</strong>
                        <span>{item.type === "folder" ? "文件夹" : "文件"}</span>
                        <p>{item.location}</p>
                      </article>
                    ))}
                  </div>
                </div>
                <div className="file-group">
                  <strong>桌面文件夹</strong>
                  <div className="file-result-list">
                    {fileSnapshot.desktopFolders.map((item) => (
                      <article className="file-result" key={`desktop-folder-${item.location}-${item.name}`}>
                        <strong>{item.name}</strong>
                        <span>文件夹</span>
                        <p>{item.location}</p>
                      </article>
                    ))}
                  </div>
                </div>
                <div className="file-group">
                  <strong>D 盘根目录文件夹</strong>
                  <p className="knowledge-hint">{fileSnapshot.driveDPath}</p>
                  <div className="file-result-list">
                    {fileSnapshot.driveDFolders.map((item) => (
                      <article className="file-result" key={`drive-d-${item.location}-${item.name}`}>
                        <strong>{item.name}</strong>
                        <span>文件夹</span>
                        <p>{item.location}</p>
                      </article>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <p className="knowledge-hint">点击刷新后可查看桌面项目和 D 盘根目录概览。</p>
            )}
          </section>

          <section className="panel-block settings-panel-abilities">
            <p className="eyebrow">文件检索</p>
            <div className="search-row">
              <input value={fileQuery} onChange={(event) => setFileQuery(event.target.value)} placeholder="输入文件名关键词" />
              <button className="ghost-button compact" type="button" onClick={() => void handleFileSearch()}>
                搜索
              </button>
            </div>
            <div className="file-result-list">
              {fileResults.map((item) => (
                <article className="file-result" key={`${item.location}-${item.name}`}>
                  <strong>{item.name}</strong>
                  <span>{item.type === "folder" ? "文件夹" : "文件"}</span>
                  <p>{item.location}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="panel-block settings-panel-storage">
            <p className="eyebrow">数据存储</p>
            {dataPathInfo ? (
              <>
                <label>数据目录</label>
                <input value={dataPathInfo.dataDir} readOnly onClick={(e) => (e.target as HTMLInputElement).select()} />
                <p className="knowledge-hint">原始对话、人物卡及其版本保存在 storage/vivi.sqlite；JSONL 仍作为短期上下文，压缩它不会删除 SQLite 原始记录。Vivi 的私密空间位于 vivi-sandbox 子目录。</p>
                {bootstrap.memoryDatabase ? <div className="stats-grid">
                  <article className="stat-card"><span>原始消息</span><strong>{bootstrap.memoryDatabase.rawMessageCount}</strong></article>
                  <article className="stat-card"><span>对话轮次</span><strong>{bootstrap.memoryDatabase.conversationCount}</strong></article>
                  <article className="stat-card"><span>人物卡</span><strong>{bootstrap.memoryDatabase.personaCardCount}</strong></article>
                  <article className="stat-card"><span>数据库版本</span><strong>v{bootstrap.memoryDatabase.schemaVersion}</strong></article>
                </div> : null}
                <div className="action-row">
                  <button className="ghost-button compact" type="button" onClick={async () => {
                    if (bridge) await bridge.openDataFolder();
                  }}>
                    打开数据目录
                  </button>
                  <button className="ghost-button compact" type="button" onClick={() => void bridge?.openInterestSandbox()} disabled={!bridge}>
                    打开 Vivi 的私密空间
                  </button>
                </div>
              </>
            ) : (
              <p className="knowledge-hint">数据存储在系统默认应用数据目录（%APPDATA%/v-manager/agent-data/）。</p>
            )}
          </section>

          <VoiceSettingsSection
            configDraft={configDraft}
            setConfigDraft={setConfigDraft}
            localTtsPacks={localTtsPacks}
            installingLocalTts={installingLocalTts}
            localTtsProgress={localTtsProgress}
            handleInstallLocalTtsPack={handleInstallLocalTtsPack}
            localTtsMessage={localTtsMessage}
            gptSovitsRuntimeStatus={gptSovitsRuntimeStatus}
            gptSovitsProfiles={gptSovitsProfiles}
            gptSovitsRuntimeBusy={gptSovitsRuntimeBusy}
            handleGptSovitsRuntime={handleGptSovitsRuntime}
            installingGptSovits={installingGptSovits}
            gptSovitsProgress={gptSovitsProgress}
            handleInstallGptSovitsProfile={handleInstallGptSovitsProfile}
            showGptSovitsImport={showGptSovitsImport}
            setShowGptSovitsImport={setShowGptSovitsImport}
            gptSovitsImportDraft={gptSovitsImportDraft}
            setGptSovitsImportDraft={setGptSovitsImportDraft}
            importingGptSovits={importingGptSovits}
            handleImportGptSovitsProfile={handleImportGptSovitsProfile}
            gptSovitsMessage={gptSovitsMessage}
            bridge={bridge}
            elevenLabsModelPresets={elevenLabsModelPresets}
            availableVoiceOptions={availableVoiceOptions}
            setVoiceConnectionState={setVoiceConnectionState}
            setVoiceConnectionMessage={setVoiceConnectionMessage}
            loadingVoices={loadingVoices}
            handleLoadElevenLabsVoices={handleLoadElevenLabsVoices}
            voiceConnectionState={voiceConnectionState}
            voiceConnectionMessage={voiceConnectionMessage}
            localSttStatus={localSttStatus}
            installingLocalStt={installingLocalStt}
            localSttProgress={localSttProgress}
            handleInstallLocalStt={handleInstallLocalStt}
            voiceInputMessage={voiceInputMessage}
            asmrModes={asmrModes}
            asmrMode={asmrMode}
            setAsmrMode={setAsmrMode}
            asmrPrompt={asmrPrompt}
            setAsmrPrompt={setAsmrPrompt}
            asmrScript={asmrScript}
            setAsmrScript={setAsmrScript}
            previewingVoice={previewingVoice}
            handlePreviewAsmrVoice={handlePreviewAsmrVoice}
            generatingAsmr={generatingAsmr}
            handleGenerateAsmrScript={handleGenerateAsmrScript}
            handleCreateAsmrTemplate={handleCreateAsmrTemplate}
            handleImportAsmrText={handleImportAsmrText}
            setAsmrMessage={setAsmrMessage}
            asmrMessage={asmrMessage}
          />

          <ProactiveSettingsSection
            configDraft={configDraft}
            setConfigDraft={setConfigDraft}
            lifeState={lifeState}
            bridge={bridge}
            setLifeState={setLifeState}
            companionMemory={companionMemory}
            setCompanionMemory={setCompanionMemory}
            schedules={schedules}
            setSchedules={setSchedules}
          />
          <InterestsSettingsSection
            configDraft={configDraft}
            setConfigDraft={setConfigDraft}
            bridge={bridge}
            interestRuntimeState={interestRuntimeState}
            interestSnapshot={interestSnapshot}
            todayDiaryActivity={todayDiaryActivity}
            formatDiarySchedule={formatDiarySchedule}
            interestScheduleClock={interestScheduleClock}
            nextInterestRoutine={nextInterestRoutine}
            interestActivityLabel={interestActivityLabel}
            completedInterestRoutineCount={completedInterestRoutineCount}
            interestCategoryLabel={interestCategoryLabel}
            handleRefreshInterestLocation={handleRefreshInterestLocation}
            formatStorageBytes={formatStorageBytes}
            interestRunning={interestRunning}
            handleInterestActivity={handleInterestActivity}
            setInterestSnapshot={setInterestSnapshot}
            interestMessage={interestMessage}
            handleCleanupInterest={handleCleanupInterest}
            cleaningInterest={cleaningInterest}
            filteredInterestActivities={filteredInterestActivities}
            interestLogStatus={interestLogStatus}
            setInterestLogStatus={setInterestLogStatus}
            interestLogPersona={interestLogPersona}
            setInterestLogPersona={setInterestLogPersona}
            interestPersonaOptions={interestPersonaOptions}
            pagedInterestActivities={pagedInterestActivities}
            handlePlayInterestGame={handlePlayInterestGame}
            safeInterestLogPage={safeInterestLogPage}
            interestLogPageCount={interestLogPageCount}
            setInterestLogPage={setInterestLogPage}
          />
        </div>
      </div>
    </div>
  );
}

export function CodeWindowRoot(props: CodeWindowRootProps) {
  return <CodeWorkbenchView {...props} />;
}

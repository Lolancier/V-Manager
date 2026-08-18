import type { Dispatch, SetStateAction } from "react";
import { AlertCircle, CheckCircle2, LoaderCircle } from "lucide-react";
import type {
  AsmrMode,
  AsmrModeOption,
  DataPathInfo,
  DeepSeekModelPreset,
  GptSovitsImportDraft,
  PersonaDraft,
  RuntimeReplyMeta,
  SetConfigDraft,
  VoiceConnectionState
} from "./runtime-types";

type DesktopBridge = Window["agentDesktop"];
type InterestActivityRecord = NonNullable<InterestSandboxSnapshot["activities"]>[number];
type InterestRoutineItem = NonNullable<InterestSandboxSnapshot["routine"]>[number];

type AppearanceSettingsSectionProps = {
  configDraft: AgentConfig;
  setConfigDraft: SetConfigDraft;
  autoLaunchEnabled: boolean;
  setAutoLaunchEnabled: Dispatch<SetStateAction<boolean>>;
  bridge: DesktopBridge;
  live2dModels: Live2DModelOption[];
  dataPathInfo: DataPathInfo | null;
  scanningModels: boolean;
  refreshLive2DModelList: () => Promise<void>;
};

type PersonaSettingsSectionProps = {
  bridge: DesktopBridge;
  dataPathInfo: DataPathInfo | null;
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
  live2dModels: Live2DModelOption[];
  savingPersona: boolean;
  handleSavePersonaCard: () => Promise<void>;
  handleActivatePersonaCard: () => Promise<void>;
  handleArchivePersonaCard: () => Promise<void>;
  handleRestorePersonaCard: () => Promise<void>;
  relationshipProfile: RelationshipProfile;
  configDraft: AgentConfig;
  setConfigDraft: SetConfigDraft;
  relationshipNextStage: (profile: RelationshipProfile) => string;
  resettingRelationship: boolean;
  handleResetRelationship: () => Promise<void>;
};

type IntelligenceSettingsSectionsProps = {
  configDraft: AgentConfig;
  setConfigDraft: SetConfigDraft;
  bootstrap: AgentBootstrap;
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
  handleSave: () => Promise<void>;
  saving: boolean;
  handleTestConnection: () => Promise<void>;
  testingConnection: boolean;
  handleClearMemory: () => Promise<void>;
  clearingMemory: boolean;
  saveMessage: string;
  connectionMessage: string;
  knowledge: AgentKnowledge[];
};

type VoiceSettingsSectionProps = {
  configDraft: AgentConfig;
  setConfigDraft: SetConfigDraft;
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
  installingGptSovitsRuntime: boolean;
  gptSovitsInstallProgress: { phase: "scan" | "copy" | "done"; percent: number } | null;
  handleInstallGptSovitsRuntime: () => Promise<void>;
  bridge: DesktopBridge;
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
};

type ProactiveSettingsSectionProps = {
  configDraft: AgentConfig;
  setConfigDraft: SetConfigDraft;
  lifeState: LifeState | null;
  bridge: DesktopBridge;
  setLifeState: Dispatch<SetStateAction<LifeState | null>>;
  companionMemory: CompanionMemoryStore | null;
  setCompanionMemory: Dispatch<SetStateAction<CompanionMemoryStore | null>>;
  schedules: ScheduleItem[];
  setSchedules: Dispatch<SetStateAction<ScheduleItem[]>>;
};

type InterestsSettingsSectionProps = {
  configDraft: AgentConfig;
  setConfigDraft: SetConfigDraft;
  bridge: DesktopBridge;
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

export function AppearanceSettingsSection(props: AppearanceSettingsSectionProps) {
  const {
    configDraft,
    setConfigDraft,
    autoLaunchEnabled,
    setAutoLaunchEnabled,
    bridge,
    live2dModels,
    dataPathInfo,
    scanningModels,
    refreshLive2DModelList
  } = props;

  return (
    <section className="panel-block personalization-panel settings-panel-appearance">
      <p className="eyebrow">个性化</p>
      <p className="settings-section-description">选择更适合当前环境的界面主题。保存后会同步到所有日常窗口。</p>
      <div className="theme-choice-grid" role="radiogroup" aria-label="界面主题">
        <button
          className={`theme-choice ${configDraft.appearance?.theme !== "dark" ? "is-selected" : ""}`}
          type="button"
          role="radio"
          aria-checked={configDraft.appearance?.theme !== "dark"}
          onClick={() => setConfigDraft({ ...configDraft, appearance: { ...configDraft.appearance, theme: "light" } })}
        >
          <span className="theme-preview theme-preview-light"><i /><i /><i /></span>
          <strong>明亮</strong>
          <small>清爽、柔和，适合白天使用</small>
        </button>
        <button
          className={`theme-choice ${configDraft.appearance?.theme === "dark" ? "is-selected" : ""}`}
          type="button"
          role="radio"
          aria-checked={configDraft.appearance?.theme === "dark"}
          onClick={() => setConfigDraft({ ...configDraft, appearance: { ...configDraft.appearance, theme: "dark" } })}
        >
          <span className="theme-preview theme-preview-dark"><i /><i /><i /></span>
          <strong>暗色</strong>
          <small>低亮度、沉浸，适合夜间使用</small>
        </button>
      </div>
      <div className="relationship-switches live2d-behavior-switches">
        <label className="voice-switch">
          <input
            type="checkbox"
            checked={configDraft.appearance?.mouseFollow !== false}
            onChange={(event) => setConfigDraft({
              ...configDraft,
              appearance: { ...configDraft.appearance, mouseFollow: event.target.checked }
            })}
          />
          鼠标注视跟随
        </label>
        <span>鼠标离开模型本体和透明区域后仍会持续跟随，停止时自然保持视线。</span>
      </div>
      <div className="relationship-switches live2d-behavior-switches">
        <label className="voice-switch">
          <input
            type="checkbox"
            checked={configDraft.appearance?.hoverAutoHide === true}
            onChange={(event) => setConfigDraft({
              ...configDraft,
              appearance: { ...configDraft.appearance, hoverAutoHide: event.target.checked }
            })}
          />
          鼠标移入模型时自动隐藏并点击穿透
        </label>
        <span>方便点击模型下方的应用；开启后可从右下角托盘图标的“窗口”菜单关闭。</span>
      </div>
      <div className="inline-grid live2d-performance-settings">
        <label>
          Live2D 目标帧率
          <select
            value={configDraft.appearance?.renderFps ?? 30}
            onChange={(event) => setConfigDraft({
              ...configDraft,
              appearance: { ...configDraft.appearance, renderFps: Number(event.target.value) }
            })}
          >
            <option value={15}>15 FPS · 最省电</option>
            <option value={24}>24 FPS · 轻量</option>
            <option value={30}>30 FPS · 推荐</option>
            <option value={45}>45 FPS · 流畅</option>
            <option value={60}>60 FPS · 高流畅</option>
          </select>
        </label>
        <div className="relationship-switches live2d-behavior-switches">
          <label className="voice-switch">
            <input
              type="checkbox"
              checked={configDraft.appearance?.powerSaving !== false}
              onChange={(event) => setConfigDraft({
                ...configDraft,
                appearance: { ...configDraft.appearance, powerSaving: event.target.checked }
              })}
            />
            自动节能模式
          </label>
          <span>待机时自动降至最高 20 FPS；说话和动作时恢复所选帧率。</span>
        </div>
      </div>
      <div className="relationship-switches live2d-behavior-switches">
        <label className="voice-switch">
          <input
            type="checkbox"
            checked={autoLaunchEnabled}
            onChange={async (event) => {
              const nextValue = event.target.checked;
              setAutoLaunchEnabled(nextValue);
              try {
                setAutoLaunchEnabled(await bridge?.setAutoLaunch(nextValue) ?? nextValue);
              } catch {
                setAutoLaunchEnabled(!nextValue);
              }
            }}
          />
          开机自动启动
        </label>
        <span>登录 Windows 后自动启动 Vivi；关闭窗口后仍可从系统托盘找回，退出请使用托盘菜单。</span>
      </div>
      <div className="model-choice-section">
        <p className="eyebrow">Live2D 模型</p>
        <div className="model-choice-grid" role="radiogroup" aria-label="Live2D 模型">
          {live2dModels.map((model: any) => (
            <button
              className={`model-choice ${configDraft.appearance?.live2dModel === model.id ? "is-selected" : ""}`}
              type="button"
              role="radio"
              aria-checked={configDraft.appearance?.live2dModel === model.id}
              key={model.id}
              onClick={() => setConfigDraft({
                ...configDraft,
                appearance: { ...configDraft.appearance, live2dModel: model.id }
              })}
            >
              <strong>{model.label}</strong>
              <small>{model.detail}</small>
            </button>
          ))}
        </div>
        <div className="model-library-actions">
          <input
            aria-label="用户模型目录"
            value={dataPathInfo ? `${dataPathInfo.dataDir}\\models` : "%APPDATA%\\v-manager\\agent-data\\models"}
            readOnly
            onClick={(event) => event.currentTarget.select()}
          />
          <button className="ghost-button compact" type="button" onClick={() => void bridge?.openLive2DModelsFolder()}>
            打开模型目录
          </button>
          <button className="ghost-button compact" type="button" disabled={scanningModels} onClick={() => void refreshLive2DModelList()}>
            {scanningModels ? "扫描中..." : "重新扫描"}
          </button>
        </div>
      </div>
    </section>
  );
}

export function PersonaSettingsSection(props: PersonaSettingsSectionProps) {
  const {
    bridge,
    dataPathInfo,
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
    live2dModels,
    savingPersona,
    handleSavePersonaCard,
    handleActivatePersonaCard,
    handleArchivePersonaCard,
    handleRestorePersonaCard,
    relationshipProfile,
    configDraft,
    setConfigDraft,
    relationshipNextStage,
    resettingRelationship,
    handleResetRelationship
  } = props;

  return (
    <section className="panel-block settings-panel-persona">
      <div className="persona-card-heading">
        <div>
          <p className="eyebrow">人物卡</p>
          <h2>身份、人设与表达习惯</h2>
          <p>卡面独立保存并保留版本；启用后会稳定注入每一次模型对话。COS 与背景只作为表达层，不会污染现实记忆。</p>
        </div>
        <div className="persona-heading-actions">
          <button className="ghost-button compact" type="button" onClick={() => void bridge?.openPersonaFolder()}>打开保存位置</button>
          <button className="primary-button compact" type="button" onClick={() => {
            setPersonaDraft(createPersonaDraft());
            setPersonaMessage("");
          }}>新建人物卡</button>
        </div>
      </div>
      <div className="persona-storage-info">
        <strong>人物卡数据库</strong>
        <code>{dataPathInfo?.personaDatabasePath ?? "%APPDATA%\\v-manager\\agent-data\\storage\\vivi.sqlite"}</code>
        <span>人物卡保存在 SQLite 中，不是单独的文本文件；“打开保存位置”会在资源管理器中选中该数据库。</span>
      </div>
      <div className="persona-priority-note">
        <strong>与知识库 persona.md 的关系</strong>
        <span>当前启用的人物卡是身份、称呼和表达风格的主设定；知识库中的 persona.md 只在检索命中时补充背景与偏好。两者冲突时人物卡优先，不会反向改写彼此。</span>
        <code>{dataPathInfo?.personaKnowledgePath ?? "%APPDATA%\\v-manager\\agent-data\\knowledge\\persona.md"}</code>
      </div>
      <div className="persona-ai-panel">
        <div>
          <strong>AI 生成人物卡</strong>
          <span>用一句模糊描述即可。联网模式会搜索角色资料并列出来源，内容生成后仍可逐项修改。</span>
        </div>
        <textarea
          rows={3}
          value={personaAiPrompt}
          placeholder="例如：鸣潮守岸人；温柔、克制而神秘，称呼我为漂泊者"
          onChange={(event) => setPersonaAiPrompt(event.target.value)}
        />
        <div className="persona-ai-actions">
          <label className="voice-switch"><input type="checkbox" checked={personaAiUseWeb} onChange={(event) => setPersonaAiUseWeb(event.target.checked)} />联网搜索补充设定</label>
          <button className="ghost-button compact" type="button" disabled={personaAiGenerating} onClick={() => void handleGeneratePersonaCard(false)}>{personaAiGenerating ? "AI 正在整理…" : "AI 生成并填写"}</button>
          <button className="primary-button compact" type="button" disabled={personaAiGenerating} onClick={() => void handleGeneratePersonaCard(true)}>{personaAiGenerating ? "生成中…" : "AI 一键创建"}</button>
        </div>
        {personaAiSources.length ? <div className="persona-ai-sources"><span>本次参考来源：</span>{personaAiSources.map((source: any) => <button className="link-button" type="button" key={source.url} title={source.snippet} onClick={() => void bridge?.openExternal(source.url)}>{source.title}</button>)}</div> : null}
      </div>
      <div className="persona-list-toolbar">
        <input value={personaSearch} placeholder="搜索卡面、身份或性格…" onChange={(event) => setPersonaSearch(event.target.value)} />
        <select value={personaListFilter} onChange={(event) => setPersonaListFilter(event.target.value as "all" | "active" | "archived")}>
          <option value="all">全部人物卡</option>
          <option value="active">可用人物卡</option>
          <option value="archived">已归档</option>
        </select>
        <span>{visiblePersonaCards.length} / {personaCards.length}</span>
      </div>
      <div className="persona-card-picker">
        {visiblePersonaCards.map((card: any) => (
          <button className={`${personaDraft.id === card.id ? "is-selected" : ""} ${card.status === "archived" ? "is-archived" : ""}`} type="button" key={card.id} onClick={() => selectPersonaCard(card)}>
            <span className="persona-list-main">
              <strong>{card.name}</strong>
              <small>{card.payload.identityName} · {card.payload.identity}</small>
            </span>
            <span className={`persona-list-status ${card.isActive ? "is-active" : ""}`}>{card.isActive ? "当前启用" : card.status === "archived" ? "已归档" : `版本 ${card.version}`}</span>
          </button>
        ))}
        {visiblePersonaCards.length === 0 ? <p className="persona-list-empty">没有符合条件的人物卡。</p> : null}
      </div>
      <div className="persona-form-grid">
        <label>卡面名称<input value={personaDraft.name} disabled={personaDraft.status === "archived"} onChange={(event) => setPersonaDraft({ ...personaDraft, name: event.target.value })} /></label>
        <label>身份名称<input value={personaDraft.payload.identityName} disabled={personaDraft.status === "archived"} onChange={(event) => updatePersonaPayload("identityName", event.target.value)} /></label>
        <label className="persona-wide">身份定位<input value={personaDraft.payload.identity} disabled={personaDraft.status === "archived"} onChange={(event) => updatePersonaPayload("identity", event.target.value)} /></label>
        <label>自称<input value={personaDraft.payload.selfReference} disabled={personaDraft.status === "archived"} onChange={(event) => updatePersonaPayload("selfReference", event.target.value)} /></label>
        <label>对你的称呼<input value={personaDraft.payload.userAddress} disabled={personaDraft.status === "archived"} onChange={(event) => updatePersonaPayload("userAddress", event.target.value)} /></label>
        <label className="persona-wide">与你的关系<input value={personaDraft.payload.relationship} disabled={personaDraft.status === "archived"} onChange={(event) => updatePersonaPayload("relationship", event.target.value)} /></label>
        <label>价值观（逗号分隔）<input value={personaDraft.payload.values.join("，")} disabled={personaDraft.status === "archived"} onChange={(event) => updatePersonaPayload("values", event.target.value.split(/[，,]/).map((item) => item.trim()).filter(Boolean))} /></label>
        <label>性格关键词（逗号分隔）<input value={personaDraft.payload.personalityTraits.join("，")} disabled={personaDraft.status === "archived"} onChange={(event) => updatePersonaPayload("personalityTraits", event.target.value.split(/[，,]/).map((item) => item.trim()).filter(Boolean))} /></label>
        <label className="persona-wide">说话习惯<textarea rows={3} value={personaDraft.payload.speechStyle} disabled={personaDraft.status === "archived"} onChange={(event) => updatePersonaPayload("speechStyle", event.target.value)} /></label>
        <label className="persona-wide">行为习惯<textarea rows={2} value={personaDraft.payload.habits} disabled={personaDraft.status === "archived"} onChange={(event) => updatePersonaPayload("habits", event.target.value)} /></label>
        <label className="persona-wide">边界与禁忌<textarea rows={2} value={personaDraft.payload.boundaries} disabled={personaDraft.status === "archived"} onChange={(event) => updatePersonaPayload("boundaries", event.target.value)} /></label>
        <label className="persona-wide">背景设定<textarea rows={3} value={personaDraft.payload.background} disabled={personaDraft.status === "archived"} onChange={(event) => updatePersonaPayload("background", event.target.value)} /></label>
        <label className="persona-wide">角色 / COS 设定<textarea rows={3} value={personaDraft.payload.cosplay} disabled={personaDraft.status === "archived"} onChange={(event) => updatePersonaPayload("cosplay", event.target.value)} /></label>
        <label className="persona-wide">额外自定义信息<textarea rows={3} value={personaDraft.payload.extra} disabled={personaDraft.status === "archived"} onChange={(event) => updatePersonaPayload("extra", event.target.value)} /></label>
        <label className="persona-wide">示例台词（每行一条）<textarea rows={3} value={personaDraft.payload.exampleLines.join("\n")} disabled={personaDraft.status === "archived"} onChange={(event) => updatePersonaPayload("exampleLines", event.target.value.split("\n").map((item) => item.trim()).filter(Boolean))} /></label>
        <label>绑定 Live2D 模型<select value={personaDraft.payload.live2dModelId} disabled={personaDraft.status === "archived"} onChange={(event) => updatePersonaPayload("live2dModelId", event.target.value)}><option value="">跟随全局设置</option>{live2dModels.map((model: any) => <option value={model.id} key={model.id}>{model.label}</option>)}</select></label>
      </div>
      <div className="persona-card-actions">
        {personaDraft.status === "archived" ? <button className="ghost-button" type="button" onClick={() => void handleRestorePersonaCard()}>恢复人物卡</button> : <>
          <button className="primary-button" type="button" disabled={savingPersona} onClick={() => void handleSavePersonaCard()}>{savingPersona ? "保存中..." : personaDraft.id ? "保存新版本" : "创建人物卡"}</button>
          <button className="ghost-button" type="button" disabled={!personaDraft.id || personaCards.some((card: any) => card.id === personaDraft.id && card.isActive)} onClick={() => void handleActivatePersonaCard()}>启用这张卡</button>
          <button className="ghost-button danger" type="button" disabled={!personaDraft.id || personaCards.some((card: any) => card.id === personaDraft.id && card.isActive)} onClick={() => void handleArchivePersonaCard()}>归档</button>
        </>}
        {personaMessage ? <span>{personaMessage}</span> : null}
      </div>
      <div className="relationship-settings">
        <div className="relationship-heading">
          <div>
            <strong>情绪与好感</strong>
            <span>{relationshipProfile.emotion.label} · {relationshipProfile.affection.stageLabel}</span>
          </div>
          <span className="relationship-stage">{relationshipProfile.affection.stageLabel}</span>
        </div>
        <div className="relationship-switches">
          <label className="voice-switch">
            <input type="checkbox" checked={configDraft.relationship.enabled} onChange={(event) => setConfigDraft({ ...configDraft, relationship: { ...configDraft.relationship, enabled: event.target.checked } })} />
            启用关系成长
          </label>
          <label className="voice-switch">
            <input type="checkbox" checked={configDraft.relationship.showProgress} onChange={(event) => setConfigDraft({ ...configDraft, relationship: { ...configDraft.relationship, showProgress: event.target.checked } })} />
            显示成长进度
          </label>
        </div>
        {configDraft.relationship.showProgress ? (
          <>
            <div className="relationship-progress-copy">
              <span>好感度 {relationshipProfile.affection.score.toFixed(1)}</span>
              <span>{relationshipNextStage(relationshipProfile)}</span>
            </div>
            <div className="relationship-progress" role="progressbar" aria-label="好感度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={relationshipProfile.affection.score}>
              <span style={{ width: `${relationshipProfile.affection.score}%` }} />
            </div>
            <div className="relationship-metrics">
              <div><span>互动</span><strong>{relationshipProfile.affection.interactions}</strong></div>
              <div><span>愉悦</span><strong>{Math.round((relationshipProfile.emotion.valence + 1) * 50)}%</strong></div>
              <div><span>活跃</span><strong>{Math.round(relationshipProfile.emotion.arousal * 100)}%</strong></div>
            </div>
          </>
        ) : null}
        <div className="relationship-actions">
          <span>数据保存在本地 profile.json</span>
          <button className="ghost-button compact" type="button" disabled={resettingRelationship} onClick={() => void handleResetRelationship()}>
            {resettingRelationship ? "重置中..." : "重置关系状态"}
          </button>
        </div>
      </div>
    </section>
  );
}

export function IntelligenceSettingsSections(props: IntelligenceSettingsSectionsProps) {
  const {
    configDraft,
    setConfigDraft,
    bootstrap,
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
    handleSave,
    saving,
    handleTestConnection,
    testingConnection,
    handleClearMemory,
    clearingMemory,
    saveMessage,
    connectionMessage,
    knowledge
  } = props;

  return (
    <>
      <section className="panel-block settings-panel-intelligence intelligence-model-panel">
        <p className="eyebrow">模型与记忆</p>
        <div className="startup-diagnostics">
          <span>启动自检</span>
          <strong>{bootstrap.startupDiagnostics?.deepseek === "ready" ? "对话 API 正常" : bootstrap.startupDiagnostics?.deepseek === "not_configured" ? "对话 API 未配置" : bootstrap.startupDiagnostics?.deepseek === "unavailable" ? "对话 API 暂不可用" : "等待检测"}</strong>
          <small>
            已恢复 {bootstrap.startupDiagnostics?.historyRestored ?? 0} 条当前人物卡对话 ·
            {bootstrap.startupDiagnostics?.rag && "error" in bootstrap.startupDiagnostics.rag
              ? " RAG 自检失败"
              : bootstrap.startupDiagnostics?.rag?.rebuilt ? " RAG 已自动更新" : " RAG 索引已是最新"}
          </small>
        </div>
        <label>
          DeepSeek API Key
          <input type="password" value={configDraft.deepseek.apiKey} onChange={(event) => setConfigDraft({ ...configDraft, deepseek: { ...configDraft.deepseek, apiKey: event.target.value } })} />
        </label>
        <label>
          Base URL
          <input value={configDraft.deepseek.baseUrl} onChange={(event) => setConfigDraft({ ...configDraft, deepseek: { ...configDraft.deepseek, baseUrl: event.target.value } })} />
        </label>
        <label>
          复杂任务模型预设
          <select value={selectedModelPreset} onChange={(event) => handleModelPresetChange(event.target.value)}>
            {deepSeekModelPresets.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            <option value="custom">自定义模型 ID</option>
          </select>
        </label>
        <p className="knowledge-hint">{selectedModelPreset === "custom" ? "当前使用自定义模型 ID。" : deepSeekModelPresets.find((item) => item.value === selectedModelPreset)?.hint}</p>
        <label>
          复杂任务模型名
          <input value={configDraft.deepseek.model} onChange={(event) => setConfigDraft({ ...configDraft, deepseek: { ...configDraft.deepseek, model: event.target.value } })} />
        </label>
        <label>
          日常对话模型
          <input value={configDraft.deepseek.chatModel} placeholder="deepseek-v4-flash" onChange={(event) => setConfigDraft({ ...configDraft, deepseek: { ...configDraft.deepseek, chatModel: event.target.value } })} />
        </label>
        <p className="knowledge-hint">日常对话使用独立快速模型单次流式返回；电脑操作与代码任务使用复杂任务模型和对应工具。</p>
        <section className="panel-block" style={{ borderTop: "1px solid var(--border-color, #e0e0e0)", paddingTop: "0.75rem", marginTop: "0.5rem" }}>
          <p className="eyebrow">Embedding 配置（RAG 向量检索）</p>
          {!configDraft.embedding?.apiKey ? <p className="knowledge-hint">配置后可启用向量相似度检索，替代关键词匹配。推荐使用硅基流动（SiliconFlow）免费 Embedding API。</p> : null}
          <label>
            API Key
            <input type="password" value={configDraft.embedding?.apiKey ?? ""} placeholder="sk-..." onChange={(event) => setConfigDraft({ ...configDraft, embedding: { ...configDraft.embedding, apiKey: event.target.value } })} />
          </label>
          <label>
            Base URL
            <input value={configDraft.embedding?.baseUrl ?? "https://api.siliconflow.cn/v1"} onChange={(event) => setConfigDraft({ ...configDraft, embedding: { ...configDraft.embedding, baseUrl: event.target.value } })} />
          </label>
          <label>
            模型名
            <input value={configDraft.embedding?.model ?? "BAAI/bge-m3"} onChange={(event) => setConfigDraft({ ...configDraft, embedding: { ...configDraft.embedding, model: event.target.value } })} />
          </label>
          <p className="knowledge-hint">向量检索会优先使用 embedding 相似度匹配，失败时自动降级到关键词检索。重建 RAG 索引时自动生成向量。</p>
        </section>
        <section className="panel-block" style={{ borderTop: "1px solid var(--border-color, #e0e0e0)", paddingTop: "0.75rem", marginTop: "0.5rem" }}>
          <div className="section-header-row">
            <p className="eyebrow">RAG 知识库索引</p>
            <button className="ghost-button compact" type="button" onClick={handleRefreshRagStatus} disabled={loadingRagStatus}>{loadingRagStatus ? "刷新中..." : "刷新"}</button>
          </div>
          {ragStatus ? (
            <>
              <div className="stats-grid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                <article className="stat-card"><span>索引文件</span><strong>{ragStatus.status.indexedFileCount}</strong></article>
                <article className="stat-card"><span>文本片段</span><strong>{ragStatus.status.indexedChunkCount}</strong></article>
                <article className="stat-card"><span>已向量化</span><strong>{ragStatus.status.embeddedChunkCount}</strong></article>
              </div>
              <p className="knowledge-hint">
                检索模式：{ragStatus.config.mode === "keyword_only" ? "仅关键词" : "自动（优先向量）"}
                {" · "}Embedding：{ragStatus.config.embeddingProvider} / {ragStatus.config.embeddingModel}
                {ragStatus.status.updatedAt ? ` · 更新于 ${new Date(ragStatus.status.updatedAt).toLocaleString("zh-CN")}` : " · 尚未构建索引"}
              </p>
            </>
          ) : <p className="knowledge-hint">点击刷新查看 RAG 索引状态。</p>}
          <div className="action-row" style={{ marginTop: "0.5rem" }}>
            <button className="primary-button" type="button" onClick={handleRebuildRagIndex} disabled={rebuildingIndex}>{rebuildingIndex ? "重建中..." : "重建 RAG 索引"}</button>
            <button className="ghost-button compact" type="button" onClick={handleTestEmbedding} disabled={testingEmbedding}>{testingEmbedding ? "测试中..." : "测试 Embedding"}</button>
          </div>
          {rebuildMessage ? <p className="feedback-text">{rebuildMessage}</p> : null}
          {embeddingTestMessage ? <p className="feedback-text">{embeddingTestMessage}</p> : null}
        </section>
        <div className="inline-grid">
          <label>单轮输入上限（估算 Token）<input type="number" min={6000} max={100000} step={1000} value={configDraft.memory.maxInputTokens} onChange={(event) => setConfigDraft({ ...configDraft, memory: { ...configDraft.memory, maxInputTokens: Number(event.target.value) } })} /></label>
          <label>最大消息数<input type="number" min={10} max={100} value={configDraft.memory.maxMessages} onChange={(event) => setConfigDraft({ ...configDraft, memory: { ...configDraft.memory, maxMessages: Number(event.target.value) } })} /></label>
          <label>检索条数<input type="number" min={1} max={10} value={configDraft.memory.knowledgeTopK} onChange={(event) => setConfigDraft({ ...configDraft, memory: { ...configDraft.memory, knowledgeTopK: Number(event.target.value) } })} /></label>
          <label>近期对话预算<input type="number" min={1000} max={50000} step={500} value={configDraft.memory.historyTokenBudget} onChange={(event) => setConfigDraft({ ...configDraft, memory: { ...configDraft.memory, historyTokenBudget: Number(event.target.value) } })} /></label>
          <label>陪伴记忆预算<input type="number" min={200} max={8000} step={100} value={configDraft.memory.companionTokenBudget} onChange={(event) => setConfigDraft({ ...configDraft, memory: { ...configDraft.memory, companionTokenBudget: Number(event.target.value) } })} /></label>
          <label>RAG 知识预算<input type="number" min={300} max={16000} step={100} value={configDraft.memory.knowledgeTokenBudget} onChange={(event) => setConfigDraft({ ...configDraft, memory: { ...configDraft.memory, knowledgeTokenBudget: Number(event.target.value) } })} /></label>
        </div>
        <p className="knowledge-hint">人物卡、关系状态、最近连续对话和未完成承诺优先保留；超出预算时先移除最旧历史与低相关知识，不会让输入随使用时间无限增长。</p>
        {lastReplyMeta?.inputBudget ? <div className="stats-grid">
          <article className="stat-card"><span>上轮估算输入</span><strong>{lastReplyMeta.inputBudget.estimatedInputTokens}</strong></article>
          <article className="stat-card"><span>近期对话</span><strong>{lastReplyMeta.inputBudget.historyTokens}</strong></article>
          <article className="stat-card"><span>陪伴记忆</span><strong>{lastReplyMeta.inputBudget.companionTokens}</strong></article>
          <article className="stat-card"><span>RAG 知识</span><strong>{lastReplyMeta.inputBudget.knowledgeTokens}</strong></article>
        </div> : null}
        {lastReplyMeta?.usage?.promptTokens ? <p className="knowledge-hint">DeepSeek 上轮实际输入 {lastReplyMeta.usage.promptTokens} Token · 缓存命中 {lastReplyMeta.usage.cacheHitTokens} · 命中率 {Math.round(lastReplyMeta.usage.cacheHitRate * 100)}%</p> : <p className="knowledge-hint">缓存命中率会在 DeepSeek 响应返回 usage 统计后显示；本地语音缓存不计入这里。</p>}
        <div className="action-row">
          <button className="primary-button" type="button" onClick={handleSave} disabled={saving}>{saving ? "保存中..." : "保存设置"}</button>
          <button className="ghost-button compact" type="button" onClick={handleTestConnection} disabled={testingConnection}>{testingConnection ? "测试中..." : "测试连通性"}</button>
        </div>
        <button className="ghost-button compact full-width" type="button" onClick={handleClearMemory} disabled={clearingMemory}>{clearingMemory ? "清空中..." : "清空历史记忆"}</button>
        {saveMessage ? <p className="feedback-text">{saveMessage}</p> : null}
        {connectionMessage ? <p className="feedback-text">{connectionMessage}</p> : null}
      </section>

      <section className="panel-block settings-panel-intelligence">
        <p className="eyebrow">回复状态</p>
        <div className="runtime-status-card">
          <div className="runtime-status-row">
            <strong>当前链路</strong>
            <span className={`runtime-badge ${lastReplyMeta?.responseMode ?? "fallback_local"}`}>{lastReplyMeta?.sourceLabel ?? "尚未发送对话"}</span>
          </div>
          <p>本地检索：{lastReplyMeta ? lastReplyMeta.usedKnowledge ? `已命中 ${lastReplyMeta.knowledgeCount} 个知识片段` : "本次未命中本地知识" : "暂无记录"}</p>
          {lastReplyMeta?.knowledgeFiles.length ? <p>命中文件：{lastReplyMeta.knowledgeFiles.join("、")}</p> : null}
          {lastReplyMeta?.fallbackReason ? <p>补充信息：{lastReplyMeta.fallbackReason}</p> : null}
          <p className="runtime-tip">“测试连通性 OK” 只说明接口可访问，不代表每次回答都没有回退。</p>
        </div>
      </section>

      <section className="panel-block settings-panel-intelligence">
        <p className="eyebrow">知识命中</p>
        <p className="knowledge-hint">当前本地知识文件：{bootstrap.knowledgeFiles.join("、") || "暂无"}</p>
        <div className="knowledge-list">
          {knowledge.map((item: any) => (
            <article className="knowledge-card" key={`${item.file}-${item.score}`}>
              <strong>{item.file}</strong>
              <p>{item.content}</p>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

export function VoiceSettingsSection(props: VoiceSettingsSectionProps) {
  const {
    configDraft,
    setConfigDraft,
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
    installingGptSovitsRuntime,
    gptSovitsInstallProgress,
    handleInstallGptSovitsRuntime,
    bridge,
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
    asmrMessage
  } = props;
  const automaticVoiceAvailable = configDraft.voice.provider !== "gpt_sovits" || gptSovitsRuntimeStatus.ready;

  return (
    <section className="panel-block voice-settings-panel settings-panel-voice">
      <div className="section-header-row voice-section-header">
        <div>
          <p className="eyebrow">语音与 ASMR</p>
          <p className="settings-section-description">默认使用免费的本地离线语音，也可切换 ElevenLabs。回复气泡会等待当前语音播放结束，再继续下一段。</p>
        </div>
        <label className="voice-switch">
          <input
            type="checkbox"
            checked={configDraft.voice.enabled && automaticVoiceAvailable}
            disabled={!automaticVoiceAvailable}
            onChange={(event) => setConfigDraft({
              ...configDraft,
              voice: { ...configDraft.voice, enabled: event.target.checked }
            })}
          />
          {automaticVoiceAvailable ? "自动朗读回复" : "启动语音服务后可开启自动朗读"}
        </label>
      </div>

      <div className="voice-provider-selector" role="radiogroup" aria-label="语音提供方式">
        <button className={configDraft.voice.provider === "local" ? "is-active" : ""} type="button" onClick={() => setConfigDraft({ ...configDraft, voice: { ...configDraft.voice, provider: "local" } })}>
          <strong>本地离线语音</strong><span>免费 · 安装后无需联网 · 推荐日常使用</span>
        </button>
        <button className={configDraft.voice.provider === "gpt_sovits" ? "is-active" : ""} type="button" onClick={() => setConfigDraft({ ...configDraft, voice: { ...configDraft.voice, provider: "gpt_sovits", enabled: gptSovitsRuntimeStatus.ready && configDraft.voice.enabled } })}>
          <strong>GPT-SoVITS 角色声线</strong><span>本机高质量推理 · 支持达妮娅模型 · 需要独立运行时</span>
        </button>
        <button className={configDraft.voice.provider === "elevenlabs" ? "is-active" : ""} type="button" onClick={() => setConfigDraft({ ...configDraft, voice: { ...configDraft.voice, provider: "elevenlabs" } })}>
          <strong>ElevenLabs API</strong><span>情感表现更强 · 消耗 API 额度</span>
        </button>
      </div>

      {configDraft.voice.provider === "local" ? <div className="local-tts-settings">
        <div className="asmr-workspace-heading">
          <div><strong>本地语音包</strong><span>Sherpa-ONNX 在本机 CPU 推理；语音文本不会发送到外部服务。</span></div>
          <span className={`local-stt-status ${localTtsPacks.find((pack: any) => pack.id === configDraft.voice.localPackId)?.installed ? "is-ready" : ""}`}>
            {localTtsPacks.find((pack: any) => pack.id === configDraft.voice.localPackId)?.installed ? "已安装" : "未安装"}
          </span>
        </div>
        <div className="voice-config-grid">
          <label>语音包<select value={configDraft.voice.localPackId} onChange={(event) => setConfigDraft({ ...configDraft, voice: { ...configDraft.voice, localPackId: event.target.value, localSpeakerId: 0 } })}>
            {localTtsPacks.length ? localTtsPacks.map((pack: any) => <option value={pack.id} key={pack.id}>{pack.name} · 约 {pack.modelSizeMB} MB</option>) : <><option value="sherpa-zh-ll">中文多音色 · Zh-LL</option><option value="sherpa-melo-zh-en">中英双语 · MeloTTS</option></>}
          </select></label>
          <label>人物音色<select value={configDraft.voice.localSpeakerId} onChange={(event) => setConfigDraft({ ...configDraft, voice: { ...configDraft.voice, localSpeakerId: Number(event.target.value) } })}>
            {(localTtsPacks.find((pack: any) => pack.id === configDraft.voice.localPackId)?.speakers ?? [{ id: 0, name: "默认音色" }]).map((speaker: any) => <option value={speaker.id} key={speaker.id}>{speaker.name}</option>)}
          </select></label>
          <label className="voice-speed-control"><span>本地语速 <strong>{configDraft.voice.localSpeed.toFixed(2)}x</strong></span><input type="range" min="0.7" max="1.3" step="0.05" value={configDraft.voice.localSpeed} onChange={(event) => setConfigDraft({ ...configDraft, voice: { ...configDraft.voice, localSpeed: Number(event.target.value) } })} /></label>
          <label className="voice-speed-control"><span>句间停顿 <strong>{Math.round(configDraft.voice.localSilenceScale * 100)}%</strong></span><input type="range" min="0" max="1" step="0.05" value={configDraft.voice.localSilenceScale} onChange={(event) => setConfigDraft({ ...configDraft, voice: { ...configDraft.voice, localSilenceScale: Number(event.target.value) } })} /></label>
        </div>
        <div className="asmr-actions">
          <button className="primary-button" type="button" disabled={installingLocalTts || localTtsPacks.find((pack: any) => pack.id === configDraft.voice.localPackId)?.installed} onClick={() => void handleInstallLocalTtsPack()}>
            {installingLocalTts ? `下载语音包 ${localTtsProgress}%` : localTtsPacks.find((pack: any) => pack.id === configDraft.voice.localPackId)?.installed ? "语音包已安装" : "下载安装语音包"}
          </button>
          <button className="ghost-button compact" type="button" onClick={() => void bridge?.openLocalTtsFolder()}>打开语音包目录</button>
        </div>
        {localTtsMessage ? <p className="feedback-text">{localTtsMessage}</p> : null}
        <p className="knowledge-hint">可在人物卡的“语音包 ID”中填写 <code>{configDraft.voice.localPackId}:{configDraft.voice.localSpeakerId}</code>，让不同人物卡自动使用不同音色。</p>
      </div> : null}

      {configDraft.voice.provider === "gpt_sovits" ? <div className="local-tts-settings">
        <div className="asmr-workspace-heading">
          <div><strong>GPT-SoVITS 高质量角色声线</strong><span>V-Manager 管理角色权重；GPT-SoVITS 的 api_v2.py 作为本机推理服务。</span></div>
          <span className={`local-stt-status ${gptSovitsRuntimeStatus.ready ? "is-ready" : ""}`}>
            {gptSovitsRuntimeStatus.ready ? "服务运行中" : "服务未启动"}
          </span>
        </div>
        <div className="voice-config-grid">
          <label>角色声线<select value={configDraft.voice.gptSovitsProfileId} onChange={(event) => {
            const profile = gptSovitsProfiles.find((item: any) => item.id === event.target.value);
            setConfigDraft({ ...configDraft, voice: { ...configDraft.voice, gptSovitsProfileId: event.target.value, gptSovitsSpeed: profile?.recommendedSpeed ?? configDraft.voice.gptSovitsSpeed } });
          }}>
            {gptSovitsProfiles.length ? gptSovitsProfiles.map((profile: any) => <option value={profile.id} key={profile.id}>{profile.name} · {profile.version}</option>) : <option value="dania-v2-pro-plus">达妮娅 · v2ProPlus</option>}
          </select></label>
          <label>本机 API 地址<input value={configDraft.voice.gptSovitsBaseUrl} onChange={(event) => setConfigDraft({ ...configDraft, voice: { ...configDraft.voice, gptSovitsBaseUrl: event.target.value } })} placeholder="http://127.0.0.1:9880" /></label>
          <label className="voice-config-wide">GPT-SoVITS 运行目录<input value={configDraft.voice.gptSovitsRuntimeRoot ?? ""} onChange={(event) => setConfigDraft({ ...configDraft, voice: { ...configDraft.voice, gptSovitsRuntimeRoot: event.target.value } })} placeholder="可选：留空会自动查找本机已装的 GPT-SoVITS" /></label>
          <label className="voice-speed-control"><span>语速 <strong>{configDraft.voice.gptSovitsSpeed.toFixed(2)}x</strong></span><input type="range" min="0.7" max="1.3" step="0.05" value={configDraft.voice.gptSovitsSpeed} onChange={(event) => setConfigDraft({ ...configDraft, voice: { ...configDraft.voice, gptSovitsSpeed: Number(event.target.value) } })} /></label>
        </div>
        <label className="voice-switch gpt-runtime-autostart">
          <input type="checkbox" checked={configDraft.voice.gptSovitsAutoStart !== false} onChange={(event) => setConfigDraft({ ...configDraft, voice: { ...configDraft.voice, gptSovitsAutoStart: event.target.checked } })} />
          随 V-Manager 启动本地语音服务
        </label>
        <div className="gpt-runtime-controls">
          <div>
            <strong>{gptSovitsRuntimeStatus.ready ? "模型已载入内存" : "模型当前未占用内存"}</strong>
            <span>完全退出 V-Manager 时总会关闭服务；关闭自动启动后，可只在需要时手动开启。</span>
          </div>
          <div className="asmr-actions">
            <button className="primary-button" type="button" disabled={gptSovitsRuntimeStatus.ready || Boolean(gptSovitsRuntimeBusy)} onClick={() => void handleGptSovitsRuntime("start")}>{gptSovitsRuntimeBusy === "start" ? "启动中…" : "启动语音服务"}</button>
            <button className="ghost-button compact" type="button" disabled={!gptSovitsRuntimeStatus.ready || Boolean(gptSovitsRuntimeBusy)} onClick={() => void handleGptSovitsRuntime("stop")}>{gptSovitsRuntimeBusy === "stop" ? "关闭中…" : "关闭并释放内存"}</button>
          </div>
        </div>
        <div className="power-safety-note">
          <div className="asmr-workspace-heading">
            <div><strong>安装独立运行环境</strong><span>把整套 GPT-SoVITS（含本地依赖与模型）复制到自选目录，适合脱离开发项目独立使用。</span></div>
            {gptSovitsInstallProgress?.phase === "copy" ? <span className="local-stt-status">{gptSovitsInstallProgress.percent}%</span> : null}
          </div>
          <div className="asmr-actions">
            <button className="ghost-button compact" type="button" disabled={installingGptSovitsRuntime} onClick={() => void handleInstallGptSovitsRuntime()}>
              {installingGptSovitsRuntime
                ? (gptSovitsInstallProgress?.phase === "copy" ? `正在复制运行环境 ${gptSovitsInstallProgress.percent}%` : gptSovitsInstallProgress?.phase === "scan" ? "正在扫描环境…" : "正在准备…")
                : "选择目录并安装到独立位置"}
            </button>
          </div>
        </div>
        <div className="asmr-actions">
          <button className="primary-button" type="button" disabled={installingGptSovits || gptSovitsProfiles.find((profile: any) => profile.id === configDraft.voice.gptSovitsProfileId)?.installed || gptSovitsProfiles.find((profile: any) => profile.id === configDraft.voice.gptSovitsProfileId)?.downloadable === false} onClick={() => void handleInstallGptSovitsProfile()}>
            {installingGptSovits ? `下载角色声线 ${gptSovitsProgress}%` : gptSovitsProfiles.find((profile: any) => profile.id === configDraft.voice.gptSovitsProfileId)?.installed ? "角色声线已安装" : `下载${gptSovitsProfiles.find((profile: any) => profile.id === configDraft.voice.gptSovitsProfileId)?.name || "角色声线"}`}
          </button>
          <button className="ghost-button compact" type="button" onClick={() => void bridge?.openLocalTtsFolder()}>打开声线目录</button>
          <button className="ghost-button compact" type="button" disabled={!gptSovitsProfiles.find((profile: any) => profile.id === configDraft.voice.gptSovitsProfileId)?.sourceUrl} onClick={() => {
            const sourceUrl = gptSovitsProfiles.find((profile: any) => profile.id === configDraft.voice.gptSovitsProfileId)?.sourceUrl;
            if (sourceUrl) void bridge?.openExternal(sourceUrl);
          }}>打开模型网页</button>
          <button className="ghost-button compact" type="button" onClick={() => setShowGptSovitsImport((value: boolean) => !value)}>{showGptSovitsImport ? "收起导入" : "导入本地声线"}</button>
        </div>
        {gptSovitsProfiles.find((profile: any) => profile.id === configDraft.voice.gptSovitsProfileId) ? <div className="power-safety-note">
          <strong>{gptSovitsProfiles.find((profile: any) => profile.id === configDraft.voice.gptSovitsProfileId)!.author}</strong>
          <span>{gptSovitsProfiles.find((profile: any) => profile.id === configDraft.voice.gptSovitsProfileId)!.description}</span>
          <small>{gptSovitsProfiles.find((profile: any) => profile.id === configDraft.voice.gptSovitsProfileId)!.license}</small>
        </div> : null}
        {showGptSovitsImport ? <div className="gpt-sovits-import-panel">
          <div className="voice-config-grid">
            <label>声线名称<input value={gptSovitsImportDraft.name} onChange={(event) => setGptSovitsImportDraft({ ...gptSovitsImportDraft, name: event.target.value })} placeholder="例如：我的角色声线" /></label>
            <label>作者/来源<input value={gptSovitsImportDraft.author} onChange={(event) => setGptSovitsImportDraft({ ...gptSovitsImportDraft, author: event.target.value })} placeholder="模型作者" /></label>
            <label>模型版本<input value={gptSovitsImportDraft.version} onChange={(event) => setGptSovitsImportDraft({ ...gptSovitsImportDraft, version: event.target.value })} placeholder="v2ProPlus" /></label>
            <label>模型网页<input value={gptSovitsImportDraft.sourceUrl} onChange={(event) => setGptSovitsImportDraft({ ...gptSovitsImportDraft, sourceUrl: event.target.value })} placeholder="https://www.modelscope.cn/models/..." /></label>
            <label className="voice-config-wide">参考音频原文<input value={gptSovitsImportDraft.promptText} onChange={(event) => setGptSovitsImportDraft({ ...gptSovitsImportDraft, promptText: event.target.value })} placeholder="必须与参考音频逐字一致" /></label>
            <label>参考语言<select value={gptSovitsImportDraft.promptLang} onChange={(event) => setGptSovitsImportDraft({ ...gptSovitsImportDraft, promptLang: event.target.value })}><option value="zh">中文</option><option value="ja">日语</option><option value="en">英语</option><option value="ko">韩语</option><option value="yue">粤语</option></select></label>
            <label>输出语言<select value={gptSovitsImportDraft.textLang} onChange={(event) => setGptSovitsImportDraft({ ...gptSovitsImportDraft, textLang: event.target.value })}><option value="zh">中文</option><option value="ja">日语</option><option value="en">英语</option><option value="ko">韩语</option><option value="yue">粤语</option><option value="auto">自动</option></select></label>
            <label className="voice-config-wide">许可说明<input value={gptSovitsImportDraft.license} onChange={(event) => setGptSovitsImportDraft({ ...gptSovitsImportDraft, license: event.target.value })} /></label>
          </div>
          <div className="asmr-actions">
            <button className="primary-button" type="button" disabled={importingGptSovits || !gptSovitsImportDraft.name.trim() || !gptSovitsImportDraft.sourceUrl.trim() || !gptSovitsImportDraft.promptText.trim()} onClick={() => void handleImportGptSovitsProfile()}>{importingGptSovits ? "校验并导入中…" : "选择 3 个文件并导入"}</button>
            <button className="ghost-button compact" type="button" disabled={!gptSovitsImportDraft.sourceUrl.trim()} onClick={() => void bridge?.openExternal(gptSovitsImportDraft.sourceUrl)}>打开来源网页</button>
          </div>
          <p className="knowledge-hint">一次选择同一声线的 GPT .ckpt、SoVITS .pth 和参考音频。文件会复制进独立语音库并记录 SHA-256，不会从原位置直接加载。</p>
        </div> : null}
        <p className="knowledge-hint">连接仅允许 127.0.0.1 / localhost。手动模式下，服务未启动时不会因为自动朗读而自行常驻。</p>
        <p className="knowledge-hint">会优先自动查找本机已安装的 GPT-SoVITS（含开发项目内的 third_party/GPT-SoVITS）。找不到时才需要你在“GPT-SoVITS 运行目录”里指向它，或先手动运行 npm run tts:gpt-sovits:start。</p>
        <p className="knowledge-hint">模型页标注 Apache-2.0；角色声音仍建议仅限个人使用，不用于冒充、欺骗或未经授权的公开发布。</p>
        {gptSovitsMessage ? <p className="feedback-text">{gptSovitsMessage}</p> : null}
      </div> : null}

      <div className={`voice-config-grid elevenlabs-config ${configDraft.voice.provider !== "elevenlabs" ? "is-hidden" : ""}`}>
        <label className="voice-config-wide">
          ElevenLabs Base URL
          <input
            value={configDraft.voice.baseUrl}
            placeholder="https://api.elevenlabs.io/v1"
            onChange={(event) => {
              setVoiceConnectionState("idle");
              setVoiceConnectionMessage("");
              setConfigDraft({
                ...configDraft,
                voice: { ...configDraft.voice, baseUrl: event.target.value }
              });
            }}
          />
        </label>
        <label>
          API Key
          <input
            type="password"
            value={configDraft.voice.apiKey}
            placeholder="sk-..."
            onChange={(event) => {
              setVoiceConnectionState("idle");
              setVoiceConnectionMessage("");
              setConfigDraft({
                ...configDraft,
                voice: { ...configDraft.voice, apiKey: event.target.value }
              });
            }}
          />
        </label>
        <label>
          语音模型
          <select value={configDraft.voice.model} onChange={(event) => setConfigDraft({ ...configDraft, voice: { ...configDraft.voice, model: event.target.value } })}>
            {elevenLabsModelPresets.map((model) => <option value={model.value} key={model.value}>{model.label}</option>)}
          </select>
        </label>
        <label>
          官方与账号音色
          <select value={configDraft.voice.voice} onChange={(event) => setConfigDraft({ ...configDraft, voice: { ...configDraft.voice, voice: event.target.value } })}>
            {!availableVoiceOptions.some((voice: any) => voice.voiceId === configDraft.voice.voice) && configDraft.voice.voice ? <option value={configDraft.voice.voice}>自定义 · {configDraft.voice.voice}</option> : null}
            {availableVoiceOptions.map((voice: any) => <option value={voice.voiceId} key={voice.voiceId}>{voice.name} · {voice.category}</option>)}
          </select>
        </label>
        <label>
          自定义 Voice ID
          <input value={configDraft.voice.voice} placeholder="voice_id" onChange={(event) => setConfigDraft({ ...configDraft, voice: { ...configDraft.voice, voice: event.target.value.trim() } })} />
        </label>
        <label>
          输出格式
          <select value={configDraft.voice.outputFormat} onChange={(event) => setConfigDraft({ ...configDraft, voice: { ...configDraft.voice, outputFormat: event.target.value } })}>
            <option value="mp3_44100_128">MP3 · 44.1kHz · 128kbps</option>
            <option value="mp3_22050_32">MP3 · 22.05kHz · 32kbps</option>
          </select>
        </label>
        <label className="voice-speed-control">
          <span>稳定度 <strong>{configDraft.voice.stability === 0 ? "Creative" : configDraft.voice.stability === 1 ? "Robust" : "Natural"}</strong></span>
          <input type="range" min="0" max="1" step="0.5" value={configDraft.voice.stability} onChange={(event) => setConfigDraft({ ...configDraft, voice: { ...configDraft.voice, stability: Number(event.target.value) } })} />
        </label>
        <label className="voice-speed-control">
          <span>相似度 <strong>{Math.round(configDraft.voice.similarityBoost * 100)}%</strong></span>
          <input type="range" min="0" max="1" step="0.05" value={configDraft.voice.similarityBoost} onChange={(event) => setConfigDraft({ ...configDraft, voice: { ...configDraft.voice, similarityBoost: Number(event.target.value) } })} />
        </label>
        <label className="voice-speed-control">
          <span>语速 <strong>{configDraft.voice.model === "eleven_v3" ? "V3 使用标签控制" : `${configDraft.voice.speed.toFixed(2)}x`}</strong></span>
          <input type="range" min="0.7" max="1.2" step="0.05" value={configDraft.voice.speed} disabled={configDraft.voice.model === "eleven_v3"} onChange={(event) => setConfigDraft({ ...configDraft, voice: { ...configDraft.voice, speed: Number(event.target.value) } })} />
        </label>
        <div className="voice-connect-row voice-config-wide">
          <button className="ghost-button compact" type="button" onClick={() => void handleLoadElevenLabsVoices()} disabled={loadingVoices || !configDraft.voice.apiKey}>
            {loadingVoices ? "正在测试连接..." : "测试连接并刷新音色"}
          </button>
          <span>{elevenLabsModelPresets.find((model) => model.value === configDraft.voice.model)?.hint}</span>
        </div>
        {voiceConnectionState !== "idle" ? (
          <div className={`voice-connection-feedback is-${voiceConnectionState}`} role="status" aria-live="polite">
            {voiceConnectionState === "testing" ? <LoaderCircle className="is-spinning" size={17} /> : null}
            {voiceConnectionState === "success" ? <CheckCircle2 size={17} /> : null}
            {voiceConnectionState === "error" ? <AlertCircle size={17} /> : null}
            <div>
              <strong>{voiceConnectionState === "testing" ? "正在检测" : voiceConnectionState === "success" ? "ElevenLabs 可用" : "ElevenLabs 不可用"}</strong>
              <span>{voiceConnectionMessage}</span>
            </div>
          </div>
        ) : null}
      </div>

      <div className="local-stt-settings">
        <div className="asmr-workspace-heading">
          <div>
            <strong>本地语音输入</strong>
            <span>whisper.cpp 在本机转写，识别结果只填入输入框</span>
          </div>
          <span className={`local-stt-status ${localSttStatus?.installed ? "is-ready" : ""}`}>
            {localSttStatus?.installed ? "已就绪" : "未安装"}
          </span>
        </div>
        <div className="voice-config-grid">
          <label>
            本地模型
            <select value={configDraft.speechInput.model} onChange={(event) => setConfigDraft({ ...configDraft, speechInput: { ...configDraft.speechInput, model: event.target.value as AgentConfig["speechInput"]["model"] } })}>
              <option value="small-q5_1">Small Q5 · 推荐中文准确率 · 约 190 MB</option>
              <option value="base-q5_1">Base Q5 · 速度优先 · 约 60 MB</option>
            </select>
          </label>
          <label className="voice-speed-control">
            <span>自动结束静音 <strong>{(configDraft.speechInput.silenceMs / 1000).toFixed(1)} 秒</strong></span>
            <input type="range" min="700" max="2000" step="100" value={configDraft.speechInput.silenceMs} onChange={(event) => setConfigDraft({ ...configDraft, speechInput: { ...configDraft.speechInput, silenceMs: Number(event.target.value) } })} />
          </label>
        </div>
        <div className="asmr-actions">
          <button className="primary-button" type="button" onClick={() => void handleInstallLocalStt()} disabled={installingLocalStt || localSttStatus?.installed}>
            {installingLocalStt ? `${localSttProgress?.phase === "model" ? "下载模型" : "安装运行时"} ${localSttProgress?.percent || 0}%` : localSttStatus?.installed ? "本地识别已安装" : "安装本地语音识别"}
          </button>
          <button className="ghost-button compact" type="button" onClick={() => void bridge?.openLocalSttFolder()}>
            打开模型目录
          </button>
        </div>
        {voiceInputMessage ? <p className="feedback-text">{voiceInputMessage}</p> : null}
      </div>

      <div className="asmr-workspace">
        <div className="asmr-workspace-heading">
          <div>
            <strong>耳语脚本</strong>
            <span>支持本地草稿、文本导入和模型生成</span>
          </div>
          <label className="voice-switch">
            <input type="checkbox" checked={configDraft.voice.asmrEnabled} onChange={(event) => setConfigDraft({ ...configDraft, voice: { ...configDraft.voice, asmrEnabled: event.target.checked } })} />
            ASMR 模式
          </label>
        </div>

        <div className="asmr-mode-selector" role="radiogroup" aria-label="ASMR 内容类型">
          {asmrModes.map((mode: any) => (
            <button className={asmrMode === mode.id ? "is-active" : ""} type="button" role="radio" aria-checked={asmrMode === mode.id} key={mode.id} onClick={() => setAsmrMode(mode.id)}>
              <strong>{mode.label}</strong>
              <span>{mode.description}</span>
            </button>
          ))}
        </div>

        <label>
          生成要求
          <input value={asmrPrompt} placeholder="例如：雨夜、语气很轻、约 5 分钟，不要重复句子" onChange={(event) => setAsmrPrompt(event.target.value)} />
        </label>
        <label>
          脚本文本
          <textarea className="asmr-script-editor" rows={10} value={asmrScript} placeholder="在这里编辑耳语内容，或使用下方操作生成、导入。" onChange={(event) => setAsmrScript(event.target.value)} />
        </label>

        <div className="asmr-actions">
          <button className="primary-button" type="button" onClick={() => void handlePreviewAsmrVoice()} disabled={configDraft.voice.provider === "elevenlabs" && (!configDraft.voice.apiKey || !configDraft.voice.voice)}>
            {previewingVoice ? "停止试听" : "试听当前脚本"}
          </button>
          <button className="primary-button" type="button" onClick={() => void handleGenerateAsmrScript()} disabled={generatingAsmr}>
            {generatingAsmr ? "生成中..." : "AI 生成脚本"}
          </button>
          <button className="ghost-button compact" type="button" onClick={handleCreateAsmrTemplate} disabled={asmrMode === "custom"}>
            使用本地草稿
          </button>
          <button className="ghost-button compact" type="button" onClick={() => void handleImportAsmrText()}>
            导入文本
          </button>
          <button className="ghost-button compact" type="button" onClick={() => { setAsmrScript(""); setAsmrMessage(""); }} disabled={!asmrScript}>
            清空
          </button>
        </div>
        {asmrMessage ? <p className="feedback-text">{asmrMessage}</p> : null}
      </div>
    </section>
  );
}

export function ProactiveSettingsSection(props: ProactiveSettingsSectionProps) {
  const {
    configDraft,
    setConfigDraft,
    lifeState,
    bridge,
    setLifeState,
    companionMemory,
    setCompanionMemory,
    schedules,
    setSchedules
  } = props;

  return (
    <section className="panel-block proactive-settings-panel settings-panel-proactive">
      <p className="eyebrow">主动陪伴</p>
      <p className="settings-section-description">Vivi 只依据本地时间和你最近一次与模型互动的时间判断状态；不会读取其他软件的键入内容或后台截图。</p>

      <div className="proactive-status-card">
        <div><span>主人状态</span><strong>{lifeState?.ownerStatus === "away" ? "暂时未互动" : "近期有互动"}</strong><small>{lifeState?.lastInteractionAt ? `上次互动 ${new Date(lifeState.lastInteractionAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}` : "等待首次互动"}</small></div>
        <div><span>连续工作</span><strong>{Math.round(lifeState?.activeMinutes ?? 0)} 分钟</strong></div>
        <div><span>Vivi 精力</span><strong>{Math.round(lifeState?.energy ?? 100)}%</strong></div>
        <div><span>上次主动问候</span><strong>{lifeState?.lastProactiveAt ? new Date(lifeState.lastProactiveAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }) : "今天还没有"}</strong></div>
      </div>

      <details className="settings-fold companion-memory-summary">
        <summary><span>长期陪伴记忆</span><small>事实 {companionMemory?.facts.length ?? 0} · 经历 {companionMemory?.episodes.length ?? 0} · 习惯 {companionMemory?.habits.length ?? 0} · 待跟进 {companionMemory?.commitments.filter((item: any) => item.status === "open").length ?? 0}</small></summary>
        <div className="section-header-row">
          <div><strong>深层陪伴记忆</strong><span>事实、经历、习惯与承诺均保存在本机；未完成承诺可触发自然回访。</span></div>
          <button className="ghost-button compact" type="button" disabled={!bridge} onClick={async () => setCompanionMemory(await bridge!.getCompanionMemory())}>刷新</button>
        </div>
        <div className="stats-grid">
          <article className="stat-card"><span>事实</span><strong>{companionMemory?.facts.length ?? 0}</strong></article>
          <article className="stat-card"><span>近期经历</span><strong>{companionMemory?.episodes.length ?? 0}</strong></article>
          <article className="stat-card"><span>习惯</span><strong>{companionMemory?.habits.length ?? 0}</strong></article>
          <article className="stat-card"><span>未完成承诺</span><strong>{companionMemory?.commitments.filter((item: any) => item.status === "open").length ?? 0}</strong></article>
        </div>
        <div className="memory-category-list">
          {([
            ["事实", companionMemory?.facts],
            ["近期经历", companionMemory?.episodes],
            ["习惯", companionMemory?.habits],
            ["未完成承诺", companionMemory?.commitments.filter((item: any) => item.status === "open")]
          ] as const).map(([label, items]) => (
            <details key={label}>
              <summary>{label}<span>{items?.length ?? 0}</span></summary>
              {items?.length ? <ul>{items.slice(-8).reverse().map((item: any) => <li key={item.id}>{item.content}</li>)}</ul> : <p>暂无记录</p>}
            </details>
          ))}
        </div>
        <p className="knowledge-hint">当前打扰评分：{Math.round((companionMemory?.feedback.interruptionScore ?? 0.1) * 100)}% · 忽略 {companionMemory?.feedback.ignored ?? 0} / 稍后 {companionMemory?.feedback.later ?? 0} / 喜欢 {companionMemory?.feedback.liked ?? 0}</p>
      </details>

      <div className="relationship-switches proactive-switches">
        <label className="voice-switch"><input type="checkbox" checked={configDraft.proactive.enabled} onChange={(event) => setConfigDraft({ ...configDraft, proactive: { ...configDraft.proactive, enabled: event.target.checked } })} />启用主动陪伴</label>
        <label className="voice-switch"><input type="checkbox" checked={configDraft.proactive.healthReminders} onChange={(event) => setConfigDraft({ ...configDraft, proactive: { ...configDraft.proactive, healthReminders: event.target.checked } })} />工作与健康提醒</label>
        <label className="voice-switch"><input type="checkbox" checked={configDraft.proactive.socialCheckins} onChange={(event) => setConfigDraft({ ...configDraft, proactive: { ...configDraft.proactive, socialCheckins: event.target.checked } })} />拟人化主动问候</label>
        <label className="voice-switch"><input type="checkbox" checked={configDraft.proactive.lateNightCare} onChange={(event) => setConfigDraft({ ...configDraft, proactive: { ...configDraft.proactive, lateNightCare: event.target.checked } })} />深夜收尾关怀</label>
        <label className="voice-switch"><input type="checkbox" checked={configDraft.proactive.systemNotifications} onChange={(event) => setConfigDraft({ ...configDraft, proactive: { ...configDraft.proactive, systemNotifications: event.target.checked } })} />同时显示 Windows 通知</label>
      </div>

      <details className="settings-fold">
        <summary><span>频率与时间设置</span><small>提醒间隔、休息时间和安静时段</small></summary>
        <div className="inline-grid proactive-number-grid">
          <label>连续工作多久后提醒<select value={configDraft.proactive.workMinutes} onChange={(event) => setConfigDraft({ ...configDraft, proactive: { ...configDraft.proactive, workMinutes: Number(event.target.value) } })}><option value={30}>30 分钟</option><option value={45}>45 分钟</option><option value={60}>60 分钟</option><option value={90}>90 分钟</option><option value={120}>120 分钟</option></select></label>
          <label>两次提醒至少间隔<select value={configDraft.proactive.reminderCooldownMinutes} onChange={(event) => setConfigDraft({ ...configDraft, proactive: { ...configDraft.proactive, reminderCooldownMinutes: Number(event.target.value) } })}><option value={30}>30 分钟</option><option value={60}>60 分钟</option><option value={90}>90 分钟</option><option value={120}>120 分钟</option><option value={180}>180 分钟</option></select></label>
          <label>主动问候最短间隔<input type="number" min={5} max={720} step={1} value={configDraft.proactive.minimumIntervalMinutes} onChange={(event) => setConfigDraft({ ...configDraft, proactive: { ...configDraft.proactive, minimumIntervalMinutes: Number(event.target.value) } })} /><small>可自定义 5–720 分钟；从你最后一次聊天或触碰模型开始计时。</small></label>
          <label>多久未互动后重置工作时长<select value={configDraft.proactive.idleResetMinutes} onChange={(event) => setConfigDraft({ ...configDraft, proactive: { ...configDraft.proactive, idleResetMinutes: Number(event.target.value) } })}><option value={5}>5 分钟</option><option value={10}>10 分钟</option><option value={15}>15 分钟</option><option value={30}>30 分钟</option></select></label>
          <label>Vivi 工作多久后休息<select value={configDraft.proactive.viviRestAfterMinutes} onChange={(event) => setConfigDraft({ ...configDraft, proactive: { ...configDraft.proactive, viviRestAfterMinutes: Number(event.target.value) } })}><option value={60}>60 分钟</option><option value={90}>90 分钟</option><option value={120}>120 分钟</option><option value={180}>180 分钟</option></select></label>
          <label>深夜关怀开始时间<select value={configDraft.proactive.lateNightHour} onChange={(event) => setConfigDraft({ ...configDraft, proactive: { ...configDraft.proactive, lateNightHour: Number(event.target.value) } })}><option value={22}>22:00</option><option value={23}>23:00</option></select></label>
          <label>安静时段开始<input type="time" value={configDraft.proactive.quietStart} onChange={(event) => setConfigDraft({ ...configDraft, proactive: { ...configDraft.proactive, quietStart: event.target.value } })} /></label>
          <label>安静时段结束<input type="time" value={configDraft.proactive.quietEnd} onChange={(event) => setConfigDraft({ ...configDraft, proactive: { ...configDraft.proactive, quietEnd: event.target.value } })} /></label>
        </div>
      </details>

      <div className="relationship-actions proactive-actions">
        <span>{lifeState?.pausedUntil && new Date(lifeState.pausedUntil) > new Date() ? "今天已暂停主动提醒" : "状态每 30 秒在本地更新"}</span>
        <div>
          <button className="ghost-button compact" type="button" onClick={async () => setLifeState(await bridge!.pauseProactiveToday())} disabled={!bridge}>今天不要再提醒</button>
          <button className="ghost-button compact" type="button" onClick={async () => setLifeState(await bridge!.resetWorkSession())} disabled={!bridge}>我已经休息过了</button>
        </div>
      </div>

      <details className="settings-fold schedule-manager">
        <summary><span>本地日程与电源计划</span><small>{schedules.length} 项计划</small></summary>
        <div className="section-header-row">
          <div><p className="eyebrow">本地日程与电源计划</p><span>可以说：“8 月 20 日下午 3 点提醒我复诊”或“今晚 12 点关机”。</span></div>
          <button className="ghost-button compact" type="button" onClick={async () => setSchedules(await bridge!.listSchedules())} disabled={!bridge}>刷新</button>
        </div>
        <div className="power-safety-note">定时关机和重启创建后不会立即生效，必须再单独发送“确认定时关机”或“确认定时重启”。执行前还有约 60 秒取消时间，请先保存文档。</div>
        <div className="schedule-integration-summary">
          <div><span>Windows 后台托管</span><strong>已启用</strong><small>完全退出后由任务计划程序唤醒提醒</small></div>
          <div><span>本地日程表</span><strong>长期保存</strong><small>启动时自动检查今日事项，退出和重启不会丢失</small></div>
        </div>
        <div className="schedule-list">
          {schedules.length ? schedules.map((item: any) => (
            <div className={`schedule-card is-${item.type}`} key={item.id}>
              <div>
                <strong>{item.title}</strong>
                <span>{new Date(item.dueAt).toLocaleString("zh-CN", { hour12: false })}</span>
                {item.message ? <small>{item.message}</small> : null}
                <small>Windows：{item.integration?.windows?.status === "registered" ? "已托管" : item.status === "pending_confirmation" ? "确认后注册" : item.integration?.windows?.status || "等待同步"}</small>
              </div>
              <div className="schedule-card-actions">
                <span>{item.status === "pending_confirmation" ? "等待确认" : item.status === "executing" ? "60 秒倒计时" : "已计划"}</span>
                <button className="ghost-button compact" type="button" onClick={async () => { await bridge!.cancelSchedule(item.id); setSchedules(await bridge!.listSchedules()); }} disabled={!bridge}>取消</button>
              </div>
            </div>
          )) : <p className="schedule-empty">本地日程表中目前没有等待执行的事项。</p>}
        </div>
      </details>
    </section>
  );
}

export function InterestsSettingsSection(props: InterestsSettingsSectionProps) {
  const {
    configDraft,
    setConfigDraft,
    bridge,
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
    <section className="panel-block interest-sandbox-panel settings-panel-interests">
      <div className="section-header-row">
        <div><p className="eyebrow">Vivi的私密空间</p><span>日记、绘画和小游戏只会写入独立目录；默认关闭，不接触你的普通文件。</span></div>
        <button className="ghost-button compact" type="button" disabled={!bridge} onClick={() => void bridge?.openInterestSandbox()}>打开私密空间</button>
      </div>

      <div className="power-safety-note">
        {configDraft.interests.permissionLevel === "autonomous"
          ? "自主生活模式会按下方时间窗生成每日虚拟生活日程；到达日程且主人一段时间没有与模型互动后开始活动，不受电脑上其他操作影响。仍只写入 vivi-sandbox，其他本地文件、外链和系统操作继续受限。"
          : "普通创作只会在主人交代的任务完成、没有其他任务运行且一段时间没有与模型互动后开始。每日日记会在设定时间之后等待互动空闲时写入。"}
      </div>

      <div className="schedule-integration-summary">
        <div><span>当前创作状态</span><strong>{interestRuntimeState.status === "working" ? "创作中" : "空闲"}</strong><small>{interestRuntimeState.status === "working" ? interestRuntimeState.label : interestSnapshot?.session.pendingActivity ? `待续作：${interestSnapshot.session.pendingActivity === "diary" ? "今日日记" : interestSnapshot.session.pendingActivity === "drawing" ? "绘画" : "离线小游戏"}` : interestRuntimeState.label}</small></div>
        <div><span>今日单篇日记</span><strong>{interestSnapshot?.today.diaryWritten ? "已写入" : "等待写入"}</strong><small>{todayDiaryActivity ? `完成于 ${new Date(todayDiaryActivity.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}` : formatDiarySchedule(interestSnapshot?.session.diaryDueAt, interestScheduleClock)}</small></div>
        <div><span>下一项生活日程</span><strong>{nextInterestRoutine ? interestActivityLabel(nextInterestRoutine.type) : interestSnapshot?.routine?.length ? "今日计划已完成" : configDraft.interests.virtualScheduleEnabled ? "暂无可排活动" : "虚拟日程未启用"}</strong><small>{nextInterestRoutine ? `${new Date(nextInterestRoutine.dueAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })} · ${nextInterestRoutine.status === "due" ? "等待互动空闲" : "尚未到时间"}` : interestSnapshot?.routine?.length ? `已完成 ${completedInterestRoutineCount} / ${interestSnapshot.routine.length} 项` : "开启自主生活和虚拟日程后生成"}</small></div>
      </div>

      {interestRuntimeState.status === "working" && interestRuntimeState.logs?.length ? (
        <div className="interest-live-log">
          <div><strong>实时活动日志</strong><span>{interestRuntimeState.progress?.actions != null ? `${interestRuntimeState.progress.actions} 次操作` : interestRuntimeState.phase}</span></div>
          {interestRuntimeState.logs.slice(-6).map((entry: any, index: number) => (
            <p key={`${entry.at}-${index}`}><time>{new Date(entry.at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}</time><span>{entry.label}</span>{entry.highestScore != null ? <em>{entry.highestScore} 分</em> : null}</p>
          ))}
        </div>
      ) : null}

      {interestSnapshot?.routine?.length ? (
        <div className="interest-routine-panel">
          <div className="interest-routine-heading"><strong>今日虚拟生活日程</strong><small>每 5 分钟检查一次；需到达计划时间、主人一段时间未与模型互动、未超出 Token/任务/磁盘上限，且没有其他任务运行。</small></div>
          <div className="interest-routine-list">
            {interestSnapshot.routine.map((item: any) => (
              <div className={`interest-routine-item is-${item.status}`} key={item.id}>
                <time>{new Date(item.dueAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}</time>
                <div><strong>{item.title || interestActivityLabel(item.type)}</strong><small>{item.title ? interestActivityLabel(item.type) : `${interestCategoryLabel(item.category)} · ${item.status === "due" ? "已到时间，等待触发" : item.status === "missed" ? "时间已过，本次跳过" : "计划活动"}`}</small></div>
                <span>{item.status === "completed" ? "已完成" : item.status === "due" ? "等待互动空闲" : item.status === "missed" ? "已错过" : "未到时间"}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="relationship-switches proactive-switches">
        <label className="voice-switch"><input type="checkbox" checked={configDraft.interests.enabled} onChange={(event) => setConfigDraft({ ...configDraft, interests: { ...configDraft.interests, enabled: event.target.checked } })} />启用私密空间（允许手动创作）</label>
        <label className="voice-switch"><input type="checkbox" checked={configDraft.interests.autonomousLifeEnabled} onChange={(event) => setConfigDraft({ ...configDraft, interests: { ...configDraft.interests, autonomousLifeEnabled: event.target.checked } })} />启用完整自主生活模块</label>
        <span className="switch-group-divider">创作与试玩</span>
        <label className="voice-switch"><input type="checkbox" checked={configDraft.interests.activities.diary} onChange={(event) => setConfigDraft({ ...configDraft, interests: { ...configDraft.interests, activities: { ...configDraft.interests.activities, diary: event.target.checked } } })} />写每日日记</label>
        <label className="voice-switch"><input type="checkbox" disabled={configDraft.interests.permissionLevel === "diary_only" || configDraft.interests.permissionLevel === "off"} checked={configDraft.interests.activities.drawing} onChange={(event) => setConfigDraft({ ...configDraft, interests: { ...configDraft.interests, activities: { ...configDraft.interests.activities, drawing: event.target.checked } } })} />创作 SVG 绘画</label>
        <label className="voice-switch"><input type="checkbox" disabled={configDraft.interests.permissionLevel === "diary_only" || configDraft.interests.permissionLevel === "off"} checked={configDraft.interests.activities.miniGames} onChange={(event) => setConfigDraft({ ...configDraft, interests: { ...configDraft.interests, activities: { ...configDraft.interests.activities, miniGames: event.target.checked } } })} />创建离线小游戏</label>
        <label className="voice-switch"><input type="checkbox" disabled={!configDraft.interests.activities.miniGames} checked={configDraft.interests.selfPlayGames} onChange={(event) => setConfigDraft({ ...configDraft, interests: { ...configDraft.interests, selfPlayGames: event.target.checked } })} />游戏完成后自主试玩并记录</label>
        <label className="voice-switch"><input type="checkbox" disabled={configDraft.interests.permissionLevel !== "autonomous"} checked={configDraft.interests.virtualScheduleEnabled} onChange={(event) => setConfigDraft({ ...configDraft, interests: { ...configDraft.interests, virtualScheduleEnabled: event.target.checked } })} />启用人物虚拟生活日程</label>
      </div>

      <details className="settings-fold">
        <summary><span>权限、预算与时间</span><small>高级设置，通常无需频繁调整</small></summary>
        <div className="inline-grid proactive-number-grid">
          <label>权限等级<select value={configDraft.interests.permissionLevel} onChange={(event) => {
            const permissionLevel = event.target.value as AgentConfig["interests"]["permissionLevel"];
            setConfigDraft({ ...configDraft, interests: { ...configDraft.interests, permissionLevel, dailyTokenBudget: permissionLevel === "autonomous" ? 2_000_000 : configDraft.interests.dailyTokenBudget, minimumHoursBetweenTasks: permissionLevel === "autonomous" ? Math.min(1, configDraft.interests.minimumHoursBetweenTasks) : configDraft.interests.minimumHoursBetweenTasks } });
          }}><option value="off">关闭：不允许任何活动</option><option value="diary_only">日记：仅写本地日记</option><option value="create">创作：允许生成作品但不自动打开</option><option value="preview">预览：创作后可自动打开作品</option><option value="autonomous">自主生活：按日程在沙盒内自由运转</option></select></label>
          <label>外部信息权限<select value={configDraft.interests.networkAccess} onChange={(event) => setConfigDraft({ ...configDraft, interests: { ...configDraft.interests, networkAccess: event.target.value as AgentConfig["interests"]["networkAccess"] } })}><option value="off">关闭：仅使用本地记录</option><option value="weather">只读天气</option><option value="weather_news">只读天气 + 内置领域资讯</option></select></label>
          <label>每日创作任务上限<input type="number" min={1} max={48} value={configDraft.interests.dailyTaskLimit} onChange={(event) => setConfigDraft({ ...configDraft, interests: { ...configDraft.interests, dailyTaskLimit: Number(event.target.value) } })} /></label>
          <label>自主生活每日 Token 总预算<input type="number" min={500} max={2000000} step={500} value={configDraft.interests.dailyTokenBudget} onChange={(event) => setConfigDraft({ ...configDraft, interests: { ...configDraft.interests, dailyTokenBudget: Number(event.target.value) } })} /></label>
          <label>每日生活日程项数<input type="number" min={3} max={24} value={configDraft.interests.autonomousRoutineLimit} onChange={(event) => setConfigDraft({ ...configDraft, interests: { ...configDraft.interests, autonomousRoutineLimit: Number(event.target.value) } })} /></label>
          <label>每日娱乐上限<input type="number" min={0} max={12} value={configDraft.interests.entertainmentDailyLimit} onChange={(event) => setConfigDraft({ ...configDraft, interests: { ...configDraft.interests, entertainmentDailyLimit: Number(event.target.value) } })} /></label>
          <label>单次最长时间（分钟）<input type="number" min={1} max={60} value={configDraft.interests.maxTaskMinutes} onChange={(event) => setConfigDraft({ ...configDraft, interests: { ...configDraft.interests, maxTaskMinutes: Number(event.target.value) } })} /></label>
          <label>磁盘上限（MB）<input type="number" min={10} max={2048} value={configDraft.interests.maxDiskMB} onChange={(event) => setConfigDraft({ ...configDraft, interests: { ...configDraft.interests, maxDiskMB: Number(event.target.value) } })} /></label>
          <label>多久未与模型互动后可活动（分钟）<input type="number" min={5} max={240} value={configDraft.interests.idleMinutes} onChange={(event) => setConfigDraft({ ...configDraft, interests: { ...configDraft.interests, idleMinutes: Number(event.target.value) } })} /></label>
          <label>两次活动最小间隔（小时）<input type="number" min={0} max={24} value={configDraft.interests.minimumHoursBetweenTasks} onChange={(event) => setConfigDraft({ ...configDraft, interests: { ...configDraft.interests, minimumHoursBetweenTasks: Number(event.target.value) } })} /></label>
          <label>单次试玩上限（秒）<input type="number" min={5} max={60} value={configDraft.interests.selfPlayMaxSeconds} onChange={(event) => setConfigDraft({ ...configDraft, interests: { ...configDraft.interests, selfPlayMaxSeconds: Number(event.target.value) } })} /></label>
          <label>单次试玩操作上限<input type="number" min={8} max={120} value={configDraft.interests.selfPlayMaxActions} onChange={(event) => setConfigDraft({ ...configDraft, interests: { ...configDraft.interests, selfPlayMaxActions: Number(event.target.value) } })} /></label>
          <label>失败自动修复次数<input type="number" min={0} max={2} value={configDraft.interests.selfRepairAttempts} onChange={(event) => setConfigDraft({ ...configDraft, interests: { ...configDraft.interests, selfRepairAttempts: Number(event.target.value) } })} /></label>
          <label>每日日记计划时间<input type="time" value={configDraft.interests.diaryTime} onChange={(event) => setConfigDraft({ ...configDraft, interests: { ...configDraft.interests, diaryTime: event.target.value } })} /></label>
          <label>允许开始时间<input type="time" value={configDraft.interests.activeStart} onChange={(event) => setConfigDraft({ ...configDraft, interests: { ...configDraft.interests, activeStart: event.target.value } })} /></label>
          <label>允许结束时间<input type="time" value={configDraft.interests.activeEnd} onChange={(event) => setConfigDraft({ ...configDraft, interests: { ...configDraft.interests, activeEnd: event.target.value } })} /></label>
          <label>天气定位<input value={interestSnapshot?.location ? `${interestSnapshot.location.city || interestSnapshot.location.region || "Windows 已定位"} · 精度约 ${Math.round(interestSnapshot.location.accuracy)} 米` : "等待 Windows 定位授权"} readOnly /></label>
        </div>

        {configDraft.interests.networkAccess === "weather_news" ? (
          <div className="relationship-switches proactive-switches">
            <label className="voice-switch"><input type="checkbox" checked={configDraft.interests.newsTopics.hot} onChange={(event) => setConfigDraft({ ...configDraft, interests: { ...configDraft.interests, newsTopics: { ...configDraft.interests.newsTopics, hot: event.target.checked } } })} />今日热点</label>
            <label className="voice-switch"><input type="checkbox" checked={configDraft.interests.newsTopics.gaming} onChange={(event) => setConfigDraft({ ...configDraft, interests: { ...configDraft.interests, newsTopics: { ...configDraft.interests.newsTopics, gaming: event.target.checked } } })} />游戏领域</label>
            <label className="voice-switch"><input type="checkbox" checked={configDraft.interests.newsTopics.science} onChange={(event) => setConfigDraft({ ...configDraft, interests: { ...configDraft.interests, newsTopics: { ...configDraft.interests.newsTopics, science: event.target.checked } } })} />科学与航天</label>
            <label className="voice-switch"><input type="checkbox" checked={configDraft.interests.newsTopics.ai} onChange={(event) => setConfigDraft({ ...configDraft, interests: { ...configDraft.interests, newsTopics: { ...configDraft.interests.newsTopics, ai: event.target.checked } } })} />AI 发展</label>
          </div>
        ) : null}

        {configDraft.interests.networkAccess !== "off" ? (
          <div className="action-row">
            <span className="knowledge-hint">天气使用 Windows 定位；资讯使用内置只读来源，不需要填写城市或网站。</span>
            <button className="ghost-button compact" type="button" onClick={() => void handleRefreshInterestLocation()}>重新获取 Windows 定位</button>
          </div>
        ) : null}

        <label className="voice-switch"><input type="checkbox" disabled={configDraft.interests.permissionLevel !== "preview"} checked={configDraft.interests.autoOpenPreview} onChange={(event) => setConfigDraft({ ...configDraft, interests: { ...configDraft.interests, autoOpenPreview: event.target.checked } })} />完成后自动打开作品（仅“预览”权限可用）</label>
      </details>

      <div className="stats-grid">
        <article className="stat-card"><span>今日自主创作</span><strong>{interestSnapshot?.today.creativeTaskCount ?? 0} / {configDraft.interests.dailyTaskLimit}</strong></article>
        <article className="stat-card"><span>轻量 / 娱乐 / 陪伴</span><strong>{interestSnapshot?.today.lightActivityCount ?? 0} / {interestSnapshot?.today.entertainmentCount ?? 0} / {interestSnapshot?.today.companionActivityCount ?? 0}</strong></article>
        <article className="stat-card"><span>自主 Token 总预算</span><strong>{interestSnapshot?.today.tokenCount ?? 0} / {configDraft.interests.dailyTokenBudget}</strong></article>
        <article className="stat-card"><span>独立空间占用</span><strong>{formatStorageBytes(interestSnapshot?.diskBytes)}</strong></article>
      </div>

      <div className="action-row">
        <button className="primary-button" type="button" disabled={!bridge || Boolean(interestRunning) || interestRuntimeState.status === "working"} onClick={() => void handleInterestActivity("diary")}>{interestRunning === "diary" ? "写作中…" : "现在写一篇日记"}</button>
        <button className="ghost-button compact" type="button" disabled={!bridge || Boolean(interestRunning) || interestRuntimeState.status === "working"} onClick={() => void handleInterestActivity("drawing")}>现在画一幅画</button>
        <button className="ghost-button compact" type="button" disabled={!bridge || Boolean(interestRunning) || interestRuntimeState.status === "working"} onClick={() => void handleInterestActivity("mini_game")}>现在做个小游戏</button>
        <button className="ghost-button compact" type="button" disabled={!bridge} onClick={async () => setInterestSnapshot(await bridge!.getInterestSandbox())}>刷新记录</button>
      </div>

      {configDraft.interests.autonomousLifeEnabled ? (
        <details className="settings-fold">
          <summary><span>自主生活内容</span><small>选择允许自行安排的日常行为</small></summary>
          <div className="autonomous-activity-switches">
            {([
              ["collectDiaryMaterials", "收集日记素材"], ["browseInformation", "看天气和资讯"],
              ["organizeMemory", "整理记忆和近期话题"], ["playExistingGame", "玩已有游戏"],
              ["improveExistingGame", "改进以前的游戏"], ["reviewDrawing", "回顾自己的画作"],
              ["planCreation", "规划下一次创作"], ["rest", "休息和发呆"],
              ["prepareChatTopics", "准备聊天话题"]
            ] as const).map(([key, label]) => (
              <label className="voice-switch" key={key}>
                <input type="checkbox" checked={configDraft.interests.autonomousActivities[key]} onChange={(event) => setConfigDraft({ ...configDraft, interests: { ...configDraft.interests, autonomousActivities: { ...configDraft.interests.autonomousActivities, [key]: event.target.checked } } })} />
                {label}
              </label>
            ))}
          </div>
        </details>
      ) : <p className="knowledge-hint">自主生活关闭时，不生成虚拟日程、不执行后台日常、不使用自主预算；手动对话、原有工具和手动沙盒按钮保持可用。</p>}
      {interestMessage ? <p className="feedback-text">{interestMessage}</p> : null}

      <div className="interest-storage-panel">
        <div className="interest-storage-heading">
          <div><strong>空间管理</strong><span>失败记录不包含作品；清理失败日志不会删除已经完成的日记、绘画或小游戏。</span></div>
          <div className="interest-storage-actions">
            <button className="ghost-button compact" type="button" disabled={cleaningInterest || !(interestSnapshot?.storage?.failedCount)} onClick={() => void handleCleanupInterest("failed_logs")}>清理失败记录（{interestSnapshot?.storage?.failedCount ?? 0}）</button>
            <button className="ghost-button compact" type="button" disabled={cleaningInterest || !interestSnapshot?.activities.some((item: any) => ["mini_game", "play_existing_game", "improve_existing_game"].includes(item.type))} onClick={() => void handleCleanupInterest("game_content")}>清理游戏文件夹</button>
            <button className="ghost-button compact danger" type="button" disabled={cleaningInterest || !(interestSnapshot?.activities.length)} onClick={() => void handleCleanupInterest("all_content")}>清空全部作品</button>
          </div>
        </div>
        <div className="interest-category-actions">
          <button className="ghost-button compact" type="button" disabled={!bridge} onClick={() => void bridge?.openInterestCategory("diary")}>打开日记目录</button>
          <button className="ghost-button compact" type="button" disabled={!bridge} onClick={() => void bridge?.openInterestCategory("drawing")}>打开绘画目录</button>
          <button className="ghost-button compact" type="button" disabled={!bridge} onClick={() => void bridge?.openInterestCategory("mini_game")}>打开游戏目录</button>
        </div>
        <div className="interest-storage-breakdown">
          <span>日记 {formatStorageBytes(interestSnapshot?.storage?.byType.diary)}</span>
          <span>绘画 {formatStorageBytes(interestSnapshot?.storage?.byType.drawing)}</span>
          <span>小游戏 {formatStorageBytes(interestSnapshot?.storage?.byType.mini_game)}</span>
          <span>日常记录 {formatStorageBytes(interestSnapshot?.storage?.byType.life)}</span>
          <span>人格归档 {interestSnapshot?.storage?.personaCount ?? 0} 个</span>
        </div>
      </div>

      <div className="interest-log-panel">
        <div className="interest-log-toolbar">
          <div><strong>活动记录</strong><span>共 {filteredInterestActivities.length} 条</span></div>
          <select value={interestLogStatus} onChange={(event) => { setInterestLogStatus(event.target.value as "all" | "completed" | "failed"); setInterestLogPage(1); }}>
            <option value="all">全部状态</option><option value="completed">仅完成</option><option value="failed">失败 / 终止</option>
          </select>
          <select value={interestLogPersona} onChange={(event) => { setInterestLogPersona(event.target.value); setInterestLogPage(1); }}>
            <option value="all">全部人物卡</option>{interestPersonaOptions.map((item: any) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </div>
        {pagedInterestActivities.length ? <table className="interest-log-table">
          <thead><tr><th>作品</th><th>类型 / 状态</th><th>人物卡</th><th>时间</th><th>操作</th></tr></thead>
          <tbody>{pagedInterestActivities.map((activity: any) => (
            <tr key={activity.id} className={activity.status !== "completed" ? "is-failed" : ""}>
              <td><strong>{activity.title}</strong><small title={activity.summary}>{activity.summary}</small>{activity.playtest ? <em title={`${activity.playtest.reflection}${activity.playtest.timeline?.length ? `\n${activity.playtest.timeline.map((entry: any) => entry.label).join(" → ")}` : ""}`}>自主试玩 · {activity.playtest.outcome === "cancelled" ? "已中止" : activity.playtest.outcome === "won" ? "胜利" : activity.playtest.outcome === "lost" ? "结束" : activity.playtest.ok ? "已运行" : "失败"}{activity.playtest.highestScore != null ? ` · ${activity.playtest.highestScore} 分` : ""}</em> : activity.relatedActivityIds?.length && ["diary", "drawing"].includes(activity.type) ? <em>已关联当天的{activity.type === "diary" ? "画作" : "日记"}</em> : null}</td>
              <td><span>{interestActivityLabel(activity.type)}</span><small>{interestCategoryLabel(activity.category)} · {activity.status === "completed" ? activity.action === "updated" ? "已更新" : "已完成" : activity.status === "cancelled" ? "已终止" : "失败"}</small></td>
              <td><span>{activity.personaName || "旧记录"}</span><small>{activity.personaVersion ? `v${activity.personaVersion}` : "未标注"}</small></td>
              <td>{new Date(activity.createdAt).toLocaleString("zh-CN", { hour12: false })}</td>
              <td><div className="interest-row-actions"><button className="ghost-button compact" type="button" disabled={!activity.artifactPath} onClick={() => void bridge?.openInterestArtifact(activity.artifactPath)}>查看</button>{activity.type === "mini_game" && activity.status === "completed" ? <button className="ghost-button compact" type="button" disabled={Boolean(interestRunning) || interestRuntimeState.status === "working"} onClick={() => void handlePlayInterestGame(activity.id)}>试玩</button> : null}{activity.playtest?.screenshotPath ? <button className="ghost-button compact" type="button" onClick={() => void bridge?.openInterestArtifact(activity.playtest!.screenshotPath)}>截图</button> : null}</div></td>
            </tr>
          ))}</tbody>
        </table> : <p className="knowledge-hint">当前筛选条件下没有活动记录。</p>}
        <div className="interest-log-pagination">
          <button className="ghost-button compact" type="button" disabled={safeInterestLogPage <= 1} onClick={() => setInterestLogPage((page: number) => Math.max(1, page - 1))}>上一页</button>
          <span>第 {safeInterestLogPage} / {interestLogPageCount} 页</span>
          <button className="ghost-button compact" type="button" disabled={safeInterestLogPage >= interestLogPageCount} onClick={() => setInterestLogPage((page: number) => Math.min(interestLogPageCount, page + 1))}>下一页</button>
        </div>
      </div>
    </section>
  );
}

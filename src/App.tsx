import {
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import Live2DPreview from "./pet/Live2DPreview";
import { PetMood } from "./pet/live2dConfig";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type RuntimeReplyMeta = ChatResult["meta"] & {
  sourceLabel: string;
};

type WindowView = "pet" | "settings" | "scale" | "composer" | "chat" | "bubble";

const starterMessages: ChatMessage[] = [
  {
    role: "assistant",
    content: "你好，我是你的桌面 Agent。右键模型可以打开设置窗口。"
  }
];

const previewConfig: AgentConfig = {
  appName: "V-Manager",
  personaName: "Vivi",
  personaPrompt:
    "你是用户的桌面智能搭档，语气自然、直接、可靠。优先给出可执行建议，记住用户偏好，并主动引用本地知识库中的相关设定。",
  deepseek: {
    apiKey: "",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat"
  },
  memory: {
    maxMessages: 40,
    knowledgeTopK: 3
  }
};

const previewBootstrap: AgentBootstrap = {
  config: previewConfig,
  knowledgeFiles: ["persona.md"],
  runtime: {
    mode: "preview"
  },
  abilities: [
    { id: "chat", name: "自然对话", status: "partial", detail: "当前处于预览模式，界面可见，模型调用依赖桌面桥接。" },
    { id: "memory", name: "本地记忆/RAG", status: "partial", detail: "预览模式下仅展示结构，桌面环境中会接真实本地数据。" },
    { id: "browser", name: "浏览器搜索", status: "planned", detail: "预留插件位，后续接浏览器自动化或联网搜索。" },
    { id: "filesystem", name: "文件管理", status: "planned", detail: "后续扩展文件读写、整理与索引。" },
    { id: "messenger", name: "QQ/微信消息发送", status: "planned", detail: "后续通过 UI 自动化/系统脚本接入。" }
  ]
};

const deepSeekModelPresets = [
  { value: "deepseek-v4-flash", label: "deepseek-v4-flash", hint: "官方 V4 Flash，偏速度，适合日常对话。" },
  { value: "deepseek-v4-pro", label: "deepseek-v4-pro", hint: "官方 V4 Pro，质量更高，通常更慢也更贵。" },
  { value: "deepseek-chat", label: "deepseek-chat（兼容别名）", hint: "兼容旧 ID，体验上更接近快速聊天模式。" },
  { value: "deepseek-reasoner", label: "deepseek-reasoner（兼容别名）", hint: "兼容旧 ID，体验上更接近深度推理模式。" }
] as const;

function getViewMode(): WindowView {
  const params = new URLSearchParams(window.location.search);
  const view = params.get("view");
  if (view === "settings" || view === "scale" || view === "composer" || view === "chat" || view === "bubble") {
    return view;
  }

  return "pet";
}

function clearBubbleTimers(timers: { current: number[] }) {
  timers.current.forEach((timer) => window.clearTimeout(timer));
  timers.current = [];
}

function clampPetScale(scale: number) {
  return Math.max(0.8, Math.min(1.16, Number(scale) || 1));
}

function getModelPresetValue(model: string) {
  return deepSeekModelPresets.some((item) => item.value === model) ? model : "custom";
}

function App() {
  const viewMode = useMemo(() => getViewMode(), []);
  const [bootstrap, setBootstrap] = useState<AgentBootstrap | null>(null);
  const [configDraft, setConfigDraft] = useState<AgentConfig | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(starterMessages);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [knowledge, setKnowledge] = useState<AgentKnowledge[]>([]);
  const [lastReplyMeta, setLastReplyMeta] = useState<RuntimeReplyMeta | null>(null);
  const [fileQuery, setFileQuery] = useState("");
  const [fileResults, setFileResults] = useState<FileSearchResult[]>([]);
  const [systemSnapshot, setSystemSnapshot] = useState<SystemResourceSnapshot | null>(null);
  const [fileSnapshot, setFileSnapshot] = useState<FileManagerSnapshot | null>(null);
  const [saveMessage, setSaveMessage] = useState("");
  const [connectionMessage, setConnectionMessage] = useState("");
  const [testingConnection, setTestingConnection] = useState(false);
  const [clearingMemory, setClearingMemory] = useState(false);
  const [loadingSystemSnapshot, setLoadingSystemSnapshot] = useState(false);
  const [loadingFileSnapshot, setLoadingFileSnapshot] = useState(false);
  const [petMood, setPetMood] = useState<PetMood>("idle");
  const [petScale, setPetScale] = useState(1);
  const [draftPetScale, setDraftPetScale] = useState(1);
  const [bubbleVisible, setBubbleVisible] = useState(viewMode !== "pet");
  const [bubbleFading, setBubbleFading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const historyListRef = useRef<HTMLDivElement | null>(null);
  const bubbleTimersRef = useRef<number[]>([]);
  const bubbleStreamingRef = useRef(false);
  const dragStateRef = useRef<{
    pointerId: number;
    startScreenX: number;
    startScreenY: number;
    windowX: number;
    windowY: number;
    lastX: number;
    lastY: number;
  } | null>(null);
  const bridge = window.agentDesktop;

  function showBubble(autoHide = true) {
    if (viewMode !== "bubble") {
      setBubbleVisible(true);
      setBubbleFading(false);
      return;
    }

    clearBubbleTimers(bubbleTimersRef);
    setBubbleVisible(true);
    setBubbleFading(false);

    if (!autoHide) {
      return;
    }

    const fadeTimer = window.setTimeout(() => {
      setBubbleFading(true);
    }, 9300);

    const hideTimer = window.setTimeout(() => {
      setBubbleVisible(false);
      setBubbleFading(false);
    }, 10000);

    bubbleTimersRef.current = [fadeTimer, hideTimer];
  }

  useEffect(() => {
    async function bootstrapAgent() {
      if (!bridge) {
        setBootstrap(previewBootstrap);
        setConfigDraft(previewBootstrap.config);
        return;
      }

      try {
        const result = await bridge.getBootstrap();
        setBootstrap(result);
        setConfigDraft(result.config);
        const runtimeScale = clampPetScale(await bridge.getPetScale());
        setPetScale(runtimeScale);
        setDraftPetScale(runtimeScale);
        const nextChatState = await bridge.getChatState();
        setMessages(nextChatState.messages);
        setKnowledge(nextChatState.knowledge);
        setLastReplyMeta(nextChatState.lastReplyMeta);
      } catch {
        setBootstrap(previewBootstrap);
        setConfigDraft(previewBootstrap.config);
      }
    }

    bootstrapAgent();
  }, [bridge]);

  useEffect(() => {
    return () => {
      clearBubbleTimers(bubbleTimersRef);
    };
  }, []);

  useEffect(() => {
    if (!bridge) {
      return;
    }

    const offConfig = bridge.onConfigUpdated((nextConfig) => {
      setConfigDraft(nextConfig);
      setBootstrap((current) => (current ? { ...current, config: nextConfig } : current));
    });

    const offScale = bridge.onPetScaleUpdated((nextScale) => {
      const normalized = clampPetScale(nextScale);
      setPetScale(normalized);
      setDraftPetScale(normalized);
    });

    const offChatState = bridge.onChatStateUpdated((nextState) => {
      setMessages(nextState.messages);
      setKnowledge(nextState.knowledge);
      setLastReplyMeta(nextState.lastReplyMeta);
    });

    const offMenu = bridge.onMenuAction((action) => {
      if (action === "focus-composer" || action === "expand-composer") {
        if (viewMode === "composer") {
          window.setTimeout(() => composerRef.current?.focus(), 60);
        }
      }

      if (action === "open-history-panel") {
        if (viewMode === "chat") {
          window.setTimeout(() => composerRef.current?.focus(), 60);
        }
      }

      if (action === "open-scale-panel") {
        void bridge.openScaleWindow();
      }

      if (action === "clear-bubble" && viewMode === "bubble") {
        setBubbleVisible(false);
      }

      if (action === "pet-idle") {
        setPetMood("idle");
      }

      if (action === "pet-happy") {
        setPetMood("happy");
      }

      if (action === "pet-thinking") {
        setPetMood("thinking");
      }
    });

    return () => {
      offConfig();
      offScale();
      offChatState();
      offMenu();
    };
  }, [bridge, viewMode]);

  const ready = Boolean(bootstrap && configDraft);
  const selectedModelPreset = configDraft ? getModelPresetValue(configDraft.deepseek.model) : "deepseek-v4-flash";
  const isReplyStreaming = lastReplyMeta?.sourceLabel === "生成中...";
  const statusText = useMemo(() => {
    if (!configDraft) {
      return "初始化中";
    }

    if (bootstrap?.runtime?.mode === "preview") {
      return "预览模式";
    }

    return configDraft.deepseek.apiKey ? "DeepSeek 已配置" : "桌面本地模式";
  }, [bootstrap?.runtime?.mode, configDraft]);

  const lastAssistantMessage = useMemo(() => {
    return [...messages].reverse().find((message) => message.role === "assistant") ?? starterMessages[0];
  }, [messages]);

  useEffect(() => {
    if (viewMode !== "bubble") {
      setBubbleVisible(true);
      setBubbleFading(false);
      bubbleStreamingRef.current = false;
      return;
    }

    if (isReplyStreaming) {
      bubbleStreamingRef.current = true;
      showBubble(false);
      return;
    }

    if (bubbleStreamingRef.current) {
      bubbleStreamingRef.current = false;
      showBubble(true);
      return;
    }

    showBubble(true);
  }, [isReplyStreaming, lastAssistantMessage.content, viewMode]);

  useEffect(() => {
    if (viewMode !== "chat" || !historyListRef.current) {
      return;
    }

    historyListRef.current.scrollTop = historyListRef.current.scrollHeight;
  }, [messages, viewMode]);

  async function handleSave() {
    if (!configDraft) {
      return;
    }

    if (!bridge) {
      setSaveMessage("当前仍在预览模式，设置不会真正保存到桌面端。");
      return;
    }

    setSaving(true);
    try {
      const saved = await bridge.saveConfig(configDraft);
      setConfigDraft(saved);
      setSaveMessage("设置已保存到桌面端配置文件。");
    } finally {
      setSaving(false);
    }
  }

  async function handleTestConnection() {
    if (!bridge) {
      setConnectionMessage("当前仍在预览模式，无法测试真实 DeepSeek 连通性。");
      return;
    }

    setTestingConnection(true);
    try {
      const result = await bridge.testDeepSeek();
      setConnectionMessage(result.message);
    } finally {
      setTestingConnection(false);
    }
  }

  function handleModelPresetChange(nextValue: string) {
    if (!configDraft) {
      return;
    }

    const nextModel = nextValue === "custom" ? configDraft.deepseek.model : nextValue;
    setConfigDraft({
      ...configDraft,
      deepseek: {
        ...configDraft.deepseek,
        model: nextModel
      }
    });
  }

  async function handleClearMemory() {
    if (!bridge) {
      setConnectionMessage("当前仍在预览模式，没有真实对话记忆可清空。");
      return;
    }

    setClearingMemory(true);
    try {
      await bridge.clearMemory();
      setConnectionMessage("历史对话记忆已清空。");
    } finally {
      setClearingMemory(false);
    }
  }

  async function handleRefreshSystemSnapshot() {
    if (!bridge) {
      return;
    }

    setLoadingSystemSnapshot(true);
    try {
      const snapshot = await bridge.getSystemResourceSnapshot();
      setSystemSnapshot(snapshot);
    } finally {
      setLoadingSystemSnapshot(false);
    }
  }

  async function handleRefreshFileSnapshot() {
    if (!bridge) {
      return;
    }

    setLoadingFileSnapshot(true);
    try {
      const snapshot = await bridge.getFileManagerSnapshot();
      setFileSnapshot(snapshot);
    } finally {
      setLoadingFileSnapshot(false);
    }
  }

  async function submitCurrentMessage() {
    const message = input.trim();
    if (!message || sending) {
      return;
    }

    setSending(true);
    setPetMood("thinking");
    setInput("");

    try {
      if (!bridge) {
        const previewReply =
          "当前是桌宠预览模式。等桌面桥接生效后，这里会切到真实 DeepSeek 回复，并把回答显示成模型右侧独立气泡。";

        setMessages((current) => [...current, { role: "user", content: message }, { role: "assistant", content: previewReply }]);
        setKnowledge([
          {
            file: "persona.md",
            score: 1,
            content: "# 角色设定\n- 名称：Vivi\n- 定位：PC 端多功能桌面 Agent"
          }
        ]);
        setLastReplyMeta({
          responseMode: "fallback_local",
          usedKnowledge: true,
          knowledgeCount: 1,
          knowledgeFiles: ["persona.md"],
          fallbackReason: "当前为预览模式",
          sourceLabel: "预览模式"
        });
        setPetMood("talking");
        window.setTimeout(() => setPetMood("idle"), 2200);
        return;
      }

      const result = await bridge.chat({ message });
      setMessages(result.messages);
      setKnowledge(result.knowledge);
      setLastReplyMeta(result.lastReplyMeta);
      setPetMood("talking");
      window.setTimeout(() => setPetMood("happy"), 1400);
      window.setTimeout(() => setPetMood("idle"), 2600);
    } finally {
      setSending(false);
    }
  }

  async function handleSend(event: FormEvent) {
    event.preventDefault();
    await submitCurrentMessage();
  }

  function handleComposerKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (sending || !input.trim()) {
        return;
      }

      void submitCurrentMessage();
    }
  }

  async function handleFileSearch() {
    if (!bridge) {
      setFileResults([{ name: "demo-notes.md", location: "预览模式", type: "file" }]);
      return;
    }

    const results = await bridge.searchFiles(fileQuery);
    setFileResults(results);
  }

  useEffect(() => {
    if (!bridge || viewMode !== "settings") {
      return;
    }

    void handleRefreshSystemSnapshot();
    void handleRefreshFileSnapshot();
  }, [bridge, viewMode]);

  function handleContextMenu(event: ReactMouseEvent) {
    event.preventDefault();
    bridge?.showPetContextMenu();
  }

  async function applyScale(nextScaleValue: number) {
    const nextScale = clampPetScale(nextScaleValue);
    setPetScale(nextScale);
    setDraftPetScale(nextScale);

    if (!bridge) {
      return;
    }

    await bridge.updatePetWindowLayout(nextScale);
  }

  async function handleInteractionPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!bridge) {
      return;
    }

    if (event.button === 2) {
      event.preventDefault();
      bridge.showPetContextMenu();
      return;
    }

    if (event.button !== 0) {
      return;
    }

    const target = event.target as HTMLElement;
    if (target.closest("button, input, textarea")) {
      return;
    }

    const bounds = await bridge.getPetWindowBounds();
    dragStateRef.current = {
      pointerId: event.pointerId,
      startScreenX: event.screenX,
      startScreenY: event.screenY,
      windowX: bounds.x,
      windowY: bounds.y,
      lastX: bounds.x,
      lastY: bounds.y
    };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  async function handleInteractionPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const dragState = dragStateRef.current;
    if (!dragState || event.pointerId !== dragState.pointerId || !bridge) {
      return;
    }

    const nextX = Math.round(dragState.windowX + (event.screenX - dragState.startScreenX));
    const nextY = Math.round(dragState.windowY + (event.screenY - dragState.startScreenY));

    if (nextX === dragState.lastX && nextY === dragState.lastY) {
      return;
    }

    dragState.lastX = nextX;
    dragState.lastY = nextY;
    await bridge.setPetWindowPosition(nextX, nextY);
  }

  function handleInteractionPointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const dragState = dragStateRef.current;
    if (!dragState || event.pointerId !== dragState.pointerId) {
      return;
    }

    dragStateRef.current = null;
    setDragging(false);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  if (!ready || !configDraft || !bootstrap) {
    return <div className="loading-shell">V-Manager 正在启动...</div>;
  }

  if (viewMode === "settings") {
    return (
      <div className="settings-shell">
        <header className="settings-header">
          <div>
            <p className="eyebrow">设置窗口</p>
            <h1>{configDraft.personaName} 配置</h1>
            <p className="settings-subtitle">保存后会同步到桌宠主窗。当前状态：{statusText}</p>
          </div>
        </header>

        <div className="settings-grid">
          <section className="panel-block">
            <p className="eyebrow">人设设定</p>
            <label>
              名称
              <input
                value={configDraft.personaName}
                onChange={(event) => setConfigDraft({ ...configDraft, personaName: event.target.value })}
              />
            </label>
            <label>
              系统提示词
              <textarea
                rows={6}
                value={configDraft.personaPrompt}
                onChange={(event) => setConfigDraft({ ...configDraft, personaPrompt: event.target.value })}
              />
            </label>
          </section>

          <section className="panel-block">
            <p className="eyebrow">模型与记忆</p>
            <label>
              DeepSeek API Key
              <input
                type="password"
                value={configDraft.deepseek.apiKey}
                onChange={(event) =>
                  setConfigDraft({
                    ...configDraft,
                    deepseek: { ...configDraft.deepseek, apiKey: event.target.value }
                  })
                }
              />
            </label>
            <label>
              Base URL
              <input
                value={configDraft.deepseek.baseUrl}
                onChange={(event) =>
                  setConfigDraft({
                    ...configDraft,
                    deepseek: { ...configDraft.deepseek, baseUrl: event.target.value }
                  })
                }
              />
            </label>
            <label>
              模型预设
              <select value={selectedModelPreset} onChange={(event) => handleModelPresetChange(event.target.value)}>
                {deepSeekModelPresets.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
                <option value="custom">自定义模型 ID</option>
              </select>
            </label>
            <p className="knowledge-hint">
              {selectedModelPreset === "custom"
                ? "当前使用自定义模型 ID。"
                : deepSeekModelPresets.find((item) => item.value === selectedModelPreset)?.hint}
            </p>
            <label>
              模型名
              <input
                value={configDraft.deepseek.model}
                onChange={(event) =>
                  setConfigDraft({
                    ...configDraft,
                    deepseek: { ...configDraft.deepseek, model: event.target.value }
                  })
                }
              />
            </label>
            <p className="knowledge-hint">
              当前对话已启用流式输出，支持边生成边显示。`flash` 更适合快回复，`pro` 更适合更高质量的复杂回答。
            </p>
            <div className="inline-grid">
              <label>
                最大消息数
                <input
                  type="number"
                  min={10}
                  max={100}
                  value={configDraft.memory.maxMessages}
                  onChange={(event) =>
                    setConfigDraft({
                      ...configDraft,
                      memory: { ...configDraft.memory, maxMessages: Number(event.target.value) }
                    })
                  }
                />
              </label>
              <label>
                检索条数
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={configDraft.memory.knowledgeTopK}
                  onChange={(event) =>
                    setConfigDraft({
                      ...configDraft,
                      memory: { ...configDraft.memory, knowledgeTopK: Number(event.target.value) }
                    })
                  }
                />
              </label>
            </div>
            <div className="action-row">
              <button className="primary-button" type="button" onClick={handleSave} disabled={saving}>
                {saving ? "保存中..." : "保存设置"}
              </button>
              <button className="ghost-button compact" type="button" onClick={handleTestConnection} disabled={testingConnection}>
                {testingConnection ? "测试中..." : "测试连通性"}
              </button>
            </div>
            <button className="ghost-button compact full-width" type="button" onClick={handleClearMemory} disabled={clearingMemory}>
              {clearingMemory ? "清空中..." : "清空历史记忆"}
            </button>
            {saveMessage ? <p className="feedback-text">{saveMessage}</p> : null}
            {connectionMessage ? <p className="feedback-text">{connectionMessage}</p> : null}
          </section>

          <section className="panel-block">
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
          </section>

          <section className="panel-block">
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

          <section className="panel-block">
            <div className="section-header-row">
              <p className="eyebrow">资源查看</p>
              <button
                className="ghost-button compact"
                type="button"
                onClick={handleRefreshSystemSnapshot}
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

          <section className="panel-block">
            <div className="section-header-row">
              <p className="eyebrow">文件管理</p>
              <button
                className="ghost-button compact"
                type="button"
                onClick={handleRefreshFileSnapshot}
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

          <section className="panel-block">
            <p className="eyebrow">文件检索</p>
            <div className="search-row">
              <input value={fileQuery} onChange={(event) => setFileQuery(event.target.value)} placeholder="输入文件名关键词" />
              <button className="ghost-button compact" type="button" onClick={handleFileSearch}>
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

          <section className="panel-block">
            <p className="eyebrow">知识命中</p>
            <p className="knowledge-hint">当前本地知识文件：{bootstrap.knowledgeFiles.join("、") || "暂无"}</p>
            <div className="knowledge-list">
              {knowledge.map((item) => (
                <article className="knowledge-card" key={`${item.file}-${item.score}`}>
                  <strong>{item.file}</strong>
                  <p>{item.content}</p>
                </article>
              ))}
            </div>
          </section>
        </div>
      </div>
    );
  }

  if (viewMode === "scale") {
    return (
      <div className="scale-window-shell">
        <div className="scale-window-card">
          <div className="panel-mini-header">
            <div>
              <p className="eyebrow">模型大小</p>
              <strong>稳定区间 80% - 116%</strong>
            </div>
            <span className="scale-value">{Math.round(draftPetScale * 100)}%</span>
          </div>

          <input
            type="range"
            min={0.8}
            max={1.16}
            step={0.01}
            value={draftPetScale}
            onChange={(event) => setDraftPetScale(clampPetScale(Number(event.target.value)))}
          />

          <p className="scale-hint">为避免桌宠主窗闪烁，当前改成单独窗口调节，点击应用后再更新模型。</p>

          <div className="scale-window-actions">
            <button className="ghost-button compact" type="button" onClick={() => setDraftPetScale(petScale)}>
              还原当前
            </button>
            <button className="ghost-button compact" type="button" onClick={() => void applyScale(1)}>
              重置
            </button>
            <button className="primary-button compact-primary" type="button" onClick={() => void applyScale(draftPetScale)}>
              应用
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (viewMode === "composer") {
    return (
      <div className="composer-window-shell">
        <section className="composer-window-panel">
          <div className="panel-mini-header drag-region composer-window-header">
            <div>
              <p className="eyebrow">对话窗口</p>
              <strong>快速输入</strong>
            </div>
            <div className="composer-window-header-actions no-drag">
              <span className={`runtime-badge ${lastReplyMeta?.responseMode ?? "fallback_local"}`}>
                {lastReplyMeta?.sourceLabel ?? "尚未发送对话"}
              </span>
              <button
                className="bubble-close-button"
                type="button"
                aria-label="关闭对话窗口"
                onClick={() => window.close()}
              >
                ×
              </button>
            </div>
          </div>

          <form className="composer-window-form no-drag" onSubmit={handleSend}>
            <div className="speech-bubble assistant-bubble composer-input-bubble no-drag">
              <textarea
                ref={composerRef}
                placeholder="和 Vivi 说点什么... Enter 发送，Shift + Enter 换行"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                rows={5}
              />
            </div>
            <div className="pet-history-actions no-drag">
              <button className="ghost-button compact" type="button" onClick={() => setInput("")}>
                清空输入
              </button>
              <button
                className="ghost-button compact"
                type="button"
                onClick={() => {
                  void bridge?.openChatWindow();
                }}
              >
                打开聊天栏
              </button>
              <button className="primary-button" type="submit" disabled={sending}>
                {sending ? "思考中..." : "发送"}
              </button>
            </div>
          </form>
        </section>
      </div>
    );
  }

  if (viewMode === "chat") {
    return (
      <div className="chat-window-shell">
        <section className="chat-window-panel">
          <div className="panel-mini-header">
            <div>
              <p className="eyebrow">聊天栏</p>
              <strong>{configDraft.personaName} 历史上下文</strong>
            </div>
            <span className={`runtime-badge ${lastReplyMeta?.responseMode ?? "fallback_local"}`}>
              {lastReplyMeta?.sourceLabel ?? "尚未发送对话"}
            </span>
          </div>

          <div className="chat-window-list" ref={historyListRef}>
            {messages.map((message, index) => (
              <article className={`message ${message.role}`} key={`${message.role}-${index}`}>
                <span className="message-role">{message.role === "assistant" ? configDraft.personaName : "你"}</span>
                <p>{message.content}</p>
              </article>
            ))}
          </div>

          <form className="chat-window-composer" onSubmit={handleSend}>
            <textarea
              ref={composerRef}
              placeholder="继续对话... Enter 发送，Shift + Enter 换行"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              rows={4}
            />
            <div className="pet-history-actions">
              <button className="ghost-button compact" type="button" onClick={() => setInput("")}>
                清空输入
              </button>
              <button className="primary-button" type="submit" disabled={sending}>
                {sending ? "思考中..." : "发送"}
              </button>
            </div>
          </form>
        </section>
      </div>
    );
  }

  if (viewMode === "bubble") {
    return (
      <div className="bubble-window-shell">
        {bubbleVisible ? (
          <article className={`speech-bubble assistant-bubble bubble-window-card ${bubbleFading ? "is-fading" : ""}`}>
            <div className="bubble-card-header">
              <span className="message-role">{configDraft.personaName}</span>
              <button
                className="bubble-close-button"
                type="button"
                aria-label="关闭气泡"
                onClick={() => {
                  clearBubbleTimers(bubbleTimersRef);
                  setBubbleVisible(false);
                  setBubbleFading(false);
                }}
              >
                ×
              </button>
            </div>
            {lastReplyMeta ? (
              <div className="bubble-runtime-status">
                <span className={`runtime-badge ${lastReplyMeta.responseMode}`}>{lastReplyMeta.sourceLabel}</span>
                <span className="runtime-inline-text">
                  {lastReplyMeta.usedKnowledge ? `本地检索 ${lastReplyMeta.knowledgeCount}` : "未用本地检索"}
                </span>
              </div>
            ) : null}
            <p>{lastAssistantMessage.content}</p>
          </article>
        ) : null}
      </div>
    );
  }

  return (
    <div className="pet-window-shell" onContextMenu={handleContextMenu}>
      <div className="pet-window-frame">
        <div className="pet-stage no-drag">
          <div
            className={`pet-interaction-zone ${dragging ? "is-dragging" : ""}`}
            onContextMenu={handleContextMenu}
            onPointerDown={handleInteractionPointerDown}
            onPointerMove={handleInteractionPointerMove}
            onPointerUp={handleInteractionPointerEnd}
            onPointerCancel={handleInteractionPointerEnd}
          >
            <Live2DPreview mood={petMood} scale={petScale} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;

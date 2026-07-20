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
import { AlertCircle, CheckCircle2, LoaderCircle, Mic, RotateCcw, Square, Volume2 } from "lucide-react";
import Live2DPreview from "./pet/Live2DPreview";
import { FaceParams, LIVE2D_MODEL_PRESETS, PetMood } from "./pet/live2dConfig";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type RuntimeReplyMeta = ChatResult["meta"] & {
  sourceLabel: string;
};

type MoodBeat = {
  mood: PetMood;
  atMs: number;
};

type WindowView = "pet" | "settings" | "scale" | "composer" | "chat" | "bubble" | "expressions" | "code";
type SettingsSection = "appearance" | "persona" | "intelligence" | "voice" | "abilities" | "storage";
type AsmrMode = "sleep" | "casual" | "custom";
type VoiceConnectionState = "idle" | "testing" | "success" | "error";

const settingsSections: Array<{ id: SettingsSection; label: string; description: string }> = [
  { id: "appearance", label: "个性化", description: "主题与窗口外观" },
  { id: "persona", label: "角色与陪伴", description: "称呼、性格和表达方式" },
  { id: "intelligence", label: "模型与记忆", description: "对话模型、知识库和上下文" },
  { id: "voice", label: "语音与 ASMR", description: "语音接口、耳语脚本和音色" },
  { id: "abilities", label: "桌面能力", description: "系统状态、文件和本地工具" },
  { id: "storage", label: "数据与隐私", description: "本地数据位置和管理" }
];

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
    model: "deepseek-chat",
    chatModel: "deepseek-chat"
  },
  embedding: {
    apiKey: "",
    baseUrl: "https://api.siliconflow.cn/v1",
    model: "BAAI/bge-m3"
  },
  appearance: {
    theme: "light",
    live2dModel: "qianqian"
  },
  voice: {
    enabled: false,
    provider: "elevenlabs",
    baseUrl: "https://api.elevenlabs.io/v1",
    apiKey: "",
    model: "eleven_v3",
    voice: "pFZP5JQG7iQjIQuC4Bku",
    outputFormat: "mp3_44100_128",
    speed: 1,
    stability: 0.5,
    similarityBoost: 0.75,
    asmrEnabled: false,
    asmrMode: "sleep",
    asmrPrompt: "",
    asmrScript: ""
  },
  speechInput: {
    provider: "local_whisper",
    model: "small-q5_1",
    language: "zh",
    silenceMs: 1100
  },
  relationship: {
    enabled: true,
    showProgress: true
  },
  memory: {
    maxMessages: 40,
    knowledgeTopK: 3
  }
};

const previewBootstrap: AgentBootstrap = {
  config: previewConfig,
  relationshipProfile: {
    version: 1,
    affection: { score: 12, stage: "new", stageLabel: "初识", interactions: 0, touchInteractions: 0, positiveInteractions: 0, negativeInteractions: 0 },
    emotion: { valence: 0.1, arousal: 0.25, label: "平静", suggestedMood: "idle" },
    daily: { date: "", positiveGrowth: 0 },
    createdAt: new Date().toISOString(),
    lastInteractionAt: null,
    updatedAt: new Date().toISOString()
  },
  knowledgeFiles: ["persona.md"],
  runtime: {
    mode: "preview"
  },
  abilities: [
    { id: "chat", name: "自然对话", status: "partial", detail: "当前处于预览模式，界面可见，模型调用依赖桌面桥接。" },
    { id: "memory", name: "本地记忆/RAG", status: "partial", detail: "预览模式下仅展示结构，桌面环境中会接真实本地数据。" },
    { id: "browser", name: "浏览器搜索", status: "partial", detail: "桌面模式可打开网址和搜索结果页；预览模式仅展示能力。" },
    { id: "vscode", name: "VS Code 适配", status: "partial", detail: "桌面模式可打开本地文件或工作区，并定位到指定行。" },
    { id: "filesystem", name: "文件管理", status: "planned", detail: "后续扩展文件读写、整理与索引。" },
    { id: "messenger", name: "微信消息发送", status: "partial", detail: "桌面模式可向完全匹配的联系人发送单条文本；读取回复和连续对话待开发。" }
  ]
};

const deepSeekModelPresets = [
  { value: "deepseek-v4-flash", label: "deepseek-v4-flash", hint: "官方 V4 Flash，偏速度，适合日常对话。" },
  { value: "deepseek-v4-pro", label: "deepseek-v4-pro", hint: "官方 V4 Pro，质量更高，通常更慢也更贵。" },
  { value: "deepseek-chat", label: "deepseek-chat（兼容别名）", hint: "兼容旧 ID，体验上更接近快速聊天模式。" },
  { value: "deepseek-reasoner", label: "deepseek-reasoner（兼容别名）", hint: "兼容旧 ID，体验上更接近深度推理模式。" }
] as const;

const elevenLabsModelPresets = [
  { value: "eleven_v3", label: "Eleven v3", hint: "情绪表现最丰富，支持耳语标签，单次最多 5,000 字符" },
  { value: "eleven_multilingual_v2", label: "Multilingual v2", hint: "长文本稳定并支持中文，单次最多 10,000 字符" },
  { value: "eleven_flash_v2_5", label: "Flash v2.5", hint: "低延迟实时语音，单次最多 40,000 字符" }
] as const;

const elevenLabsVoicePresets: ElevenLabsVoiceOption[] = [
  { voiceId: "hpp4J3VqNfWAUOO0d1Us", name: "Bella", category: "官方预置 · 温暖女声", previewUrl: "" },
  { voiceId: "EXAVITQu4vr4xnSDxMaL", name: "Sarah", category: "官方预置 · 安心女声", previewUrl: "" },
  { voiceId: "FGY2WhTYpPnrIDTdsKH5", name: "Laura", category: "官方预置 · 活泼女声", previewUrl: "" },
  { voiceId: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice", category: "官方预置 · 清晰女声", previewUrl: "" },
  { voiceId: "XrExE9yKIg1WjnnlVkGX", name: "Matilda", category: "官方预置 · 知性女声", previewUrl: "" },
  { voiceId: "cgSgspJ2msm6clMCkdW9", name: "Jessica", category: "官方预置 · 明亮女声", previewUrl: "" },
  { voiceId: "pFZP5JQG7iQjIQuC4Bku", name: "Lily", category: "官方预置 · 丝绒女声", previewUrl: "" },
  { voiceId: "CwhRBWXzGAHq8TQ4Fs17", name: "Roger", category: "官方预置 · 轻松男声", previewUrl: "" },
  { voiceId: "IKne3meq5aSn9XLyUdCD", name: "Charlie", category: "官方预置 · 深沉男声", previewUrl: "" },
  { voiceId: "JBFqnCBsd6RMkjVDRZzb", name: "George", category: "官方预置 · 叙事男声", previewUrl: "" },
  { voiceId: "N2lVS1w4EtoT3dr4eOWO", name: "Callum", category: "官方预置 · 沙哑男声", previewUrl: "" },
  { voiceId: "SAz9YHcvj6GT2YYXdXww", name: "River", category: "官方预置 · 中性男声", previewUrl: "" },
  { voiceId: "SOYHLrjzK2X1ezoPC6cr", name: "Harry", category: "官方预置 · 强烈男声", previewUrl: "" },
  { voiceId: "TX3LPaxmHKxFdv7VOQHJ", name: "Liam", category: "官方预置 · 活力男声", previewUrl: "" },
  { voiceId: "bIHbv24MWmeRgasZH58o", name: "Will", category: "官方预置 · 乐观男声", previewUrl: "" },
  { voiceId: "cjVigY5qzO86Huf0OWal", name: "Eric", category: "官方预置 · 可信男声", previewUrl: "" },
  { voiceId: "iP95p4xoKVk53GoZ742B", name: "Chris", category: "官方预置 · 自然男声", previewUrl: "" },
  { voiceId: "nPczCjzI2devNBz1zQrb", name: "Brian", category: "官方预置 · 共鸣男声", previewUrl: "" },
  { voiceId: "onwK4e9ZLuTAKqWW03F9", name: "Daniel", category: "官方预置 · 稳定男声", previewUrl: "" },
  { voiceId: "pNInz6obpgDQGcFmaJgB", name: "Adam", category: "官方预置 · 坚定男声", previewUrl: "" },
  { voiceId: "pqHfZKP75CvOlQylNhV4", name: "Bill", category: "官方预置 · 成熟男声", previewUrl: "" }
];

const asmrModes: Array<{ id: AsmrMode; label: string; description: string }> = [
  { id: "sleep", label: "哄睡", description: "缓慢安抚与睡前陪伴" },
  { id: "casual", label: "闲聊", description: "轻松自然的耳边谈话" },
  { id: "custom", label: "自定义", description: "粘贴或导入自己的文本" }
];

const asmrTemplates: Record<Exclude<AsmrMode, "custom">, string> = {
  sleep: "好啦，今天已经辛苦很久了。现在把肩膀慢慢放松，呼吸也不用着急。\n\n我会在这里陪着你。你不需要再想明天的事情，也不用担心还有什么没有完成。闭上眼睛，听着我的声音，慢慢吸气，再轻轻呼出来。\n\n晚安。今晚就安心睡吧，剩下的事情，等醒来以后再说。",
  casual: "现在想聊点什么呢？不用特意找话题，我们就这样慢慢说也很好。\n\n你可以讲讲今天遇到的小事，开心的、麻烦的，或者只是刚才突然想到的东西。我会认真听着，不催你，也不会打断你。\n\n偶尔停一会儿也没关系。安静本身，也是陪伴的一部分。"
};

function getViewMode(): WindowView {
  const params = new URLSearchParams(window.location.search);
  const view = params.get("view");
  if (view === "settings" || view === "scale" || view === "composer" || view === "chat" || view === "bubble" || view === "expressions" || view === "code") {
    return view;
  }

  return "pet";
}

function clearBubbleTimers(timers: { current: number[] }) {
  timers.current.forEach((timer) => window.clearTimeout(timer));
  timers.current = [];
}

function clampPetScale(scale: number) {
  return Math.max(0.8, Math.min(1.5, Number(scale) || 1));
}

function relationshipNextStage(profile: RelationshipProfile) {
  const next = [
    { max: 19, label: "熟悉", target: 20 },
    { max: 44, label: "朋友", target: 45 },
    { max: 69, label: "挚友", target: 70 },
    { max: 89, label: "心意相通", target: 90 }
  ].find((stage) => profile.affection.score <= stage.max);
  return next ? `距「${next.label}」还需 ${(next.target - profile.affection.score).toFixed(1)}` : "已达到最高关系阶段";
}

const persistentShapeExpressions = new Set(["expression20", "expression21", "expression22", "expression24"]);

function retainPersistentShapes(expressions: Set<string>) {
  return new Set([...expressions].filter((name) => persistentShapeExpressions.has(name)));
}

function clampDuration(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function estimateSpeechDurationMs(text: string) {
  const compact = text.replace(/\s+/g, "");
  const cjkCount = compact.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  const latinWordCount = text.match(/[A-Za-z0-9]+/g)?.length ?? 0;
  const punctuationCount = text.match(/[，。！？、,.!?;；:：]/g)?.length ?? 0;
  const lineBreakCount = text.match(/\n/g)?.length ?? 0;

  return clampDuration(
    700 + cjkCount * 95 + latinWordCount * 230 + punctuationCount * 180 + lineBreakCount * 260,
    1400,
    16000
  );
}

function estimateExpressionDurationMs(text: string) {
  return clampDuration(Math.max(10000, estimateSpeechDurationMs(text) + 3000), 3600, 22000);
}

function sanitizeBubbleReply(text: string) {
  return text
    .split("\n")
    .filter((line) => !/^\s*\[(?:mood|face):.*\]\s*$/i.test(line))
    .join("\n");
}

function takeCompleteSentences(text: string) {
  const sentences: string[] = [];
  let start = 0;
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (/[。！？!?]/.test(char) || char === "\n") {
      let end = index + 1;
      while (end < text.length && /[。！？!?…\n”’」』）)]/.test(text[end])) end += 1;
      const sentence = text.slice(start, end);
      if (sentence.trim()) sentences.push(sentence);
      start = end;
      index = end;
      continue;
    }
    index += 1;
  }
  return { sentences, consumed: start, remainder: text.slice(start) };
}

function groupBubbleSentences(sentences: string[]) {
  const groups: string[] = [];
  const pending = [...sentences];
  while (pending.length > 0) {
    const firstLength = Array.from(pending[0].replace(/\s+/g, "")).length;
    const takeCount = firstLength >= 42 ? 1 : Math.min(2, pending.length);
    const group = pending.splice(0, takeCount).join("").trim();
    if (group) groups.push(group);
  }
  return groups;
}

function splitSpeechText(text: string, maxLength = 4800) {
  const segments = text
    .split(/(?<=[。！？!?；;\n])/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const segment of segments) {
    if (segment.length > maxLength) {
      if (current) chunks.push(current);
      for (let start = 0; start < segment.length; start += maxLength) {
        chunks.push(segment.slice(start, start + maxLength));
      }
      current = "";
      continue;
    }
    if (current && current.length + segment.length > maxLength) {
      chunks.push(current);
      current = segment;
    } else {
      current += segment;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function encodeWavFromChunks(chunks: Float32Array[], sourceSampleRate: number) {
  const sourceLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const source = new Float32Array(sourceLength);
  let sourceOffset = 0;
  chunks.forEach((chunk) => {
    source.set(chunk, sourceOffset);
    sourceOffset += chunk.length;
  });

  const targetSampleRate = 16000;
  const ratio = sourceSampleRate / targetSampleRate;
  const targetLength = Math.max(1, Math.round(source.length / ratio));
  const pcm = new Int16Array(targetLength);
  for (let index = 0; index < targetLength; index += 1) {
    const position = index * ratio;
    const left = Math.floor(position);
    const right = Math.min(left + 1, source.length - 1);
    const value = source[left] + (source[right] - source[left]) * (position - left);
    pcm[index] = Math.round(Math.max(-1, Math.min(1, value)) * 32767);
  }

  const buffer = new ArrayBuffer(44 + pcm.byteLength);
  const view = new DataView(buffer);
  const writeText = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
  };
  writeText(0, "RIFF");
  view.setUint32(4, 36 + pcm.byteLength, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, targetSampleRate, true);
  view.setUint32(28, targetSampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, pcm.byteLength, true);
  new Int16Array(buffer, 44).set(pcm);
  return new Uint8Array(buffer);
}

function moodForTextSegment(segment: string, fallbackMood: PetMood): PetMood {
  if (/居然|竟然|真的吗|怎么会|为什么|什么情况|没想到|吓我|吃惊|惊讶|困惑|疑惑|搞不懂|不明白|[！!][？?]|[？?][！!]/.test(segment)) return "surprised";
  if (/[？?]|怎么|什么|要不|还是说/.test(segment)) return "thinking";
  if (/宝宝|乖|嘿嘿|摸摸头|想我|陪你|待在|呀/.test(segment)) return "blush";
  if (/累|辛苦|熬夜|费神|休息|喝口水|伸个懒腰|别太/.test(segment)) return "sad";
  if (/生气|皱眉|不许|别又/.test(segment)) return "angry";
  if (/好|可以|配合|全力|放松|开心|啦|～|~/.test(segment)) return "happy";
  return fallbackMood;
}

function buildMoodBeats(text: string, fallbackMood: PetMood, speechMs: number): MoodBeat[] {
  const rawSegments = text
    .split(/(?<=[。！？!?；;~～\n])/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (rawSegments.length <= 1) {
    return [{ mood: fallbackMood, atMs: 0 }];
  }

  const beats: MoodBeat[] = [];
  let elapsedWeight = 0;
  const weightedSegments = rawSegments.map((segment) => ({
    segment,
    weight: Math.max(4, segment.replace(/\s+/g, "").length)
  }));
  const totalWeight = weightedSegments.reduce((sum, item) => sum + item.weight, 0);

  for (const item of weightedSegments) {
    const atMs = Math.round((elapsedWeight / totalWeight) * speechMs);
    const mood = moodForTextSegment(item.segment, fallbackMood);
    if (beats.length === 0 || beats[beats.length - 1].mood !== mood) {
      beats.push({ mood, atMs });
    }
    elapsedWeight += item.weight;
  }

  return beats.slice(0, 5);
}

function getModelPresetValue(model: string) {
  return deepSeekModelPresets.some((item) => item.value === model) ? model : "custom";
}

function App() {
  const viewMode = useMemo(() => getViewMode(), []);
  const [bootstrap, setBootstrap] = useState<AgentBootstrap | null>(null);
  const [configDraft, setConfigDraft] = useState<AgentConfig | null>(null);
  const [relationshipProfile, setRelationshipProfile] = useState<RelationshipProfile>(previewBootstrap.relationshipProfile);
  const [resettingRelationship, setResettingRelationship] = useState(false);
  const [live2dModels, setLive2dModels] = useState<Live2DModelOption[]>(
    LIVE2D_MODEL_PRESETS.map((model) => ({ id: model.id, label: model.name, detail: model.detail, builtIn: true }))
  );
  const [scanningModels, setScanningModels] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(starterMessages);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("persona");
  const [sending, setSending] = useState(false);
  const [knowledge, setKnowledge] = useState<AgentKnowledge[]>([]);
  const [lastReplyMeta, setLastReplyMeta] = useState<RuntimeReplyMeta | null>(null);
  const [fileQuery, setFileQuery] = useState("");
  const [fileResults, setFileResults] = useState<FileSearchResult[]>([]);
  const [codeWorkspace, setCodeWorkspace] = useState<CodeWorkspaceSnapshot | null>(null);
  const [collapsedCodeDirs, setCollapsedCodeDirs] = useState<Set<string>>(new Set());
  const [codeFilter, setCodeFilter] = useState("");
  const [activeCodePath, setActiveCodePath] = useState("");
  const [activeCodeContent, setActiveCodeContent] = useState("");
  const [codeFileLoading, setCodeFileLoading] = useState(false);
  const [codeWorkspaceError, setCodeWorkspaceError] = useState("");
  const [systemSnapshot, setSystemSnapshot] = useState<SystemResourceSnapshot | null>(null);
  const [fileSnapshot, setFileSnapshot] = useState<FileManagerSnapshot | null>(null);
  const [saveMessage, setSaveMessage] = useState("");
  const [connectionMessage, setConnectionMessage] = useState("");
  const [testingConnection, setTestingConnection] = useState(false);
  const [clearingMemory, setClearingMemory] = useState(false);
  const [dataPathInfo, setDataPathInfo] = useState<{ baseDir: string; dataDir: string } | null>(null);
  const [loadingSystemSnapshot, setLoadingSystemSnapshot] = useState(false);
  const [loadingFileSnapshot, setLoadingFileSnapshot] = useState(false);
  const [ragStatus, setRagStatus] = useState<RagStatusSnapshot | null>(null);
  const [loadingRagStatus, setLoadingRagStatus] = useState(false);
  const [rebuildingIndex, setRebuildingIndex] = useState(false);
  const [rebuildMessage, setRebuildMessage] = useState("");
  const [testingEmbedding, setTestingEmbedding] = useState(false);
  const [embeddingTestMessage, setEmbeddingTestMessage] = useState("");
  const [petMood, setPetMood] = useState<PetMood>("idle");
  const [petScale, setPetScale] = useState(1);
  const [draftPetScale, setDraftPetScale] = useState(1);
  const [bubbleVisible, setBubbleVisible] = useState(viewMode !== "pet");
  const [bubbleFading, setBubbleFading] = useState(false);
  const [bubblePlacement, setBubblePlacement] = useState<"left" | "right">("right");
  const [bubbleSegmentText, setBubbleSegmentText] = useState("");
  const [asmrMode, setAsmrMode] = useState<AsmrMode>("sleep");
  const [asmrPrompt, setAsmrPrompt] = useState("");
  const [asmrScript, setAsmrScript] = useState("");
  const [asmrMessage, setAsmrMessage] = useState("");
  const [generatingAsmr, setGeneratingAsmr] = useState(false);
  const [accountVoices, setAccountVoices] = useState<ElevenLabsVoiceOption[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [voiceConnectionState, setVoiceConnectionState] = useState<VoiceConnectionState>("idle");
  const [voiceConnectionMessage, setVoiceConnectionMessage] = useState("");
  const [previewingVoice, setPreviewingVoice] = useState(false);
  const [localSttStatus, setLocalSttStatus] = useState<LocalSttStatus | null>(null);
  const [installingLocalStt, setInstallingLocalStt] = useState(false);
  const [localSttProgress, setLocalSttProgress] = useState<{ phase: "runtime" | "model"; percent: number } | null>(null);
  const [recordingVoiceInput, setRecordingVoiceInput] = useState(false);
  const [transcribingVoiceInput, setTranscribingVoiceInput] = useState(false);
  const [voiceInputMessage, setVoiceInputMessage] = useState("");
  const [messageVoiceState, setMessageVoiceState] = useState<{ index: number; status: "loading" | "playing" | "error" } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [posLocked, setPosLocked] = useState(false);
  const [activeExpressionSet, setActiveExpressionSet] = useState<Set<string>>(new Set());
  const [faceParams, setFaceParams] = useState<Record<string, number> | null>(null);
  const [petSpeaking, setPetSpeaking] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const historyListRef = useRef<HTMLDivElement | null>(null);
  const bubbleTimersRef = useRef<number[]>([]);
  const bubbleCardRef = useRef<HTMLElement | null>(null);
  const bubbleStreamingRef = useRef(false);
  const bubbleSourceRef = useRef("");
  const bubbleConsumedRef = useRef(0);
  const bubblePendingSentencesRef = useRef<string[]>([]);
  const bubbleSegmentQueueRef = useRef<string[]>([]);
  const bubbleSegmentTextRef = useRef("");
  const bubbleSegmentTimerRef = useRef<number | null>(null);
  const bubbleAudioRef = useRef<HTMLAudioElement | null>(null);
  const voicePreviewAudioRef = useRef<HTMLAudioElement | null>(null);
  const voicePreviewTokenRef = useRef(0);
  const messageVoiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const messageVoiceTokenRef = useRef(0);
  const recordingRef = useRef(false);
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const microphoneContextRef = useRef<AudioContext | null>(null);
  const microphoneSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const microphoneProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const microphoneGainRef = useRef<GainNode | null>(null);
  const microphoneChunksRef = useRef<Float32Array[]>([]);
  const microphoneSampleRateRef = useRef(48000);
  const microphoneStartedAtRef = useRef(0);
  const microphoneLastVoiceAtRef = useRef(0);
  const microphoneHeardSpeechRef = useRef(false);
  const streamingRef = useRef(false);                        // tracks isReplyStreaming for mood timeouts
  const talkingHoldRef = useRef<number | null>(null);
  const moodTimerRef = useRef<number | null>(null);
  const faceTimerRef = useRef<number | null>(null);
  const speakingTimerRef = useRef<number | null>(null);
  const moodBeatTimersRef = useRef<number[]>([]);
  const dragStateRef = useRef<{
    pointerId: number;
    startScreenX: number;
    startScreenY: number;
    windowX: number;
    windowY: number;
    lastX: number;
    lastY: number;
    dragStarted: boolean;
  } | null>(null);
  const petTouchPointerRef = useRef<{
    pointerId: number;
    startScreenX: number;
    startScreenY: number;
    startedAt: number;
    moved: boolean;
  } | null>(null);
  const bridge = window.agentDesktop;
  const availableVoiceOptions = useMemo(() => {
    const voices = new Map(elevenLabsVoicePresets.map((voice) => [voice.voiceId, voice]));
    accountVoices.forEach((voice) => voices.set(voice.voiceId, voice));
    return [...voices.values()];
  }, [accountVoices]);

  useEffect(() => {
    const theme = configDraft?.appearance?.theme ?? "light";
    document.documentElement.dataset.theme = theme;
  }, [configDraft?.appearance?.theme]);

  useEffect(() => {
    if (!bridge || !configDraft || (viewMode !== "settings" && viewMode !== "chat")) return;
    let cancelled = false;
    bridge.getLocalSttStatus(configDraft.speechInput.model)
      .then((status) => { if (!cancelled) setLocalSttStatus(status); })
      .catch(() => { if (!cancelled) setLocalSttStatus(null); });
    return () => { cancelled = true; };
  }, [bridge, configDraft?.speechInput.model, viewMode]);

  useEffect(() => {
    if (!bridge) return;
    return bridge.onLocalSttProgress((progress) => {
      setLocalSttProgress({ phase: progress.phase, percent: progress.percent });
    });
  }, [bridge]);

  function clearTimer(timerRef: { current: number | null }) {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function holdSpeaking(durationMs: number) {
    clearTimer(speakingTimerRef);
    setPetSpeaking(true);
    speakingTimerRef.current = window.setTimeout(() => {
      speakingTimerRef.current = null;
      setPetSpeaking(false);
    }, durationMs);
  }

  function clearMoodBeatTimers() {
    moodBeatTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    moodBeatTimersRef.current = [];
  }

  function playMoodBeats(replyText: string, fallbackMood: PetMood, speechMs: number) {
    clearMoodBeatTimers();
    const beats = buildMoodBeats(replyText, fallbackMood, speechMs);
    for (const beat of beats) {
      if (beat.atMs <= 0) {
        setPetMood(beat.mood);
        continue;
      }
      const timer = window.setTimeout(() => {
        setPetMood(beat.mood);
      }, beat.atMs);
      moodBeatTimersRef.current.push(timer);
    }
  }

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
        setRelationshipProfile(result.relationshipProfile ?? previewBootstrap.relationshipProfile);
        setAsmrMode(result.config.voice.asmrMode ?? "sleep");
        setAsmrPrompt(result.config.voice.asmrPrompt ?? "");
        setAsmrScript(result.config.voice.asmrScript ?? "");
        if (result.live2dModels?.length) setLive2dModels(result.live2dModels);
        const runtimeScale = clampPetScale(await bridge.getPetScale());
        setPetScale(runtimeScale);
        setDraftPetScale(runtimeScale);
        const nextChatState = await bridge.getChatState();
        setMessages(nextChatState.messages);
        setKnowledge(nextChatState.knowledge);
        setLastReplyMeta(nextChatState.lastReplyMeta);
        try {
          const dp = await bridge.getDataPath();
          setDataPathInfo(dp);
        } catch { /* preview mode */ }
        try {
          const locked = await bridge.getPositionLock();
          setPosLocked(locked);
        } catch { /* ignore */ }
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
      clearTimer(bubbleSegmentTimerRef);
      bubbleAudioRef.current?.pause();
      voicePreviewAudioRef.current?.pause();
      messageVoiceAudioRef.current?.pause();
      microphoneStreamRef.current?.getTracks().forEach((track) => track.stop());
      void microphoneContextRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (!bridge || viewMode !== "bubble") return;
    return bridge.onBubblePlacementUpdated(setBubblePlacement);
  }, [bridge, viewMode]);

  useEffect(() => {
    if (!bridge || viewMode !== "code") return;
    let cancelled = false;
    bridge.getCodeWorkspace()
      .then((snapshot) => {
        if (cancelled) return;
        applyCodeWorkspaceSnapshot(snapshot);
      })
      .catch((error) => {
        if (!cancelled) setCodeWorkspaceError(error instanceof Error ? error.message : String(error));
      });
    return () => { cancelled = true; };
  }, [bridge, viewMode]);

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

    const offRelationship = bridge.onRelationshipUpdated(setRelationshipProfile);

    const offPosLock = bridge.onPositionLockUpdated((locked: boolean) => {
      setPosLocked(locked);
    });

    const offTriggerExpr = bridge.onTriggerExpression((name: string) => {
      if (viewMode === "pet") {
        setActiveExpressionSet(prev => {
          const next = new Set(prev);
          if (next.has(name)) next.delete(name); else next.add(name);
          return next;
        });
      }
    });

    const offClearExpr = bridge.onClearExpressions(() => {
      if (viewMode === "pet") {
        setActiveExpressionSet(new Set());
      }
    });

    const offLive2DModels = bridge.onLive2DModelsUpdated(setLive2dModels);

    const offExpressionsUpdated = bridge.onExpressionsUpdated((expressions) => {
      setActiveExpressionSet(new Set(expressions));
    });

    const offMoodUpdated = bridge.onMoodUpdated?.((payload: { mood: string; faceParams: Record<string, number> | null; reply?: string }) => {
      if (viewMode === "pet" && payload?.mood) {
        console.log("[App] received mood from LLM:", payload.mood);
        const llmMood = payload.mood as PetMood;
        const replyContent = payload.reply ?? [...messages].reverse().find((message) => message.role === "assistant")?.content ?? "";
        const speechMs = estimateSpeechDurationMs(replyContent);
        const expressionMs = estimateExpressionDurationMs(replyContent);
        clearTimer(talkingHoldRef);
        clearTimer(moodTimerRef);
        clearTimer(faceTimerRef);
        setActiveExpressionSet(retainPersistentShapes);
        playMoodBeats(replyContent, llmMood, speechMs);
        holdSpeaking(speechMs);
        moodTimerRef.current = window.setTimeout(() => {
          moodTimerRef.current = null;
          clearMoodBeatTimers();
          setPetMood(prev => {
            return streamingRef.current ? "thinking" : "idle";
          });
        }, expressionMs);
        // Param52 (豆豆眼) is reserved for surprise/shock/confusion.
        const safeFaceParams = payload.faceParams ? { ...payload.faceParams } : null;
        if (safeFaceParams && llmMood !== "surprised") {
          delete safeFaceParams.Param52;
        }
        setFaceParams(safeFaceParams && Object.keys(safeFaceParams).length ? safeFaceParams : null);
        if (safeFaceParams && Object.keys(safeFaceParams).length) {
          faceTimerRef.current = window.setTimeout(() => {
            faceTimerRef.current = null;
            setFaceParams(null);
          }, expressionMs);
        }
      }
    });

    const offMenu = bridge.onMenuAction((action) => {
      if (viewMode === "settings" && action === "open-settings-general") {
        setSettingsSection("persona");
      }

      if (viewMode === "settings" && action === "open-settings-llm") {
        setSettingsSection("intelligence");
      }

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
        setActiveExpressionSet(retainPersistentShapes);
      }

      if (action === "pet-happy") {
        setPetMood("happy");
        setActiveExpressionSet(retainPersistentShapes);
      }

      if (action === "pet-thinking") {
        setPetMood("thinking");
        setActiveExpressionSet(retainPersistentShapes);
      }
    });

    return () => {
      offConfig();
      offLive2DModels();
      offScale();
      offChatState();
      offRelationship();
      offMenu();
      offPosLock?.();
      offTriggerExpr?.();
      offClearExpr?.();
      offExpressionsUpdated?.();
      offMoodUpdated?.();
    };
  }, [bridge, viewMode, messages]);

  const ready = Boolean(bootstrap && configDraft);
  const selectedLive2DModel = live2dModels.find((model) => model.id === configDraft?.appearance?.live2dModel)
    ?? live2dModels[0];
  const selectedModelPreset = configDraft ? getModelPresetValue(configDraft.deepseek.model) : "deepseek-v4-flash";
  const isReplyStreaming = /^(生成中|正在执行|正在查询)/.test(lastReplyMeta?.sourceLabel ?? "");
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
    if (viewMode !== "bubble") return;
    const source = sanitizeBubbleReply(lastAssistantMessage.content);

    if ((!isReplyStreaming && source !== bubbleSourceRef.current) || !source.startsWith(bubbleSourceRef.current)) {
      bubbleConsumedRef.current = 0;
      bubblePendingSentencesRef.current = [];
      bubbleSegmentQueueRef.current = [];
      bubbleSegmentTextRef.current = "";
      setBubbleSegmentText("");
    }
    bubbleSourceRef.current = source;

    const unread = source.slice(bubbleConsumedRef.current);
    const parsed = takeCompleteSentences(unread);
    bubbleConsumedRef.current += parsed.consumed;
    bubblePendingSentencesRef.current.push(...parsed.sentences);

    while (isReplyStreaming && (
      bubblePendingSentencesRef.current.length >= 2
      || Array.from((bubblePendingSentencesRef.current[0] ?? "").replace(/\s+/g, "")).length >= 42
    )) {
      const firstLength = Array.from(bubblePendingSentencesRef.current[0].replace(/\s+/g, "")).length;
      const takeCount = firstLength >= 42 ? 1 : 2;
      bubbleSegmentQueueRef.current.push(bubblePendingSentencesRef.current.splice(0, takeCount).join("").trim());
    }

    if (!isReplyStreaming) {
      if (parsed.remainder.trim()) {
        bubblePendingSentencesRef.current.push(parsed.remainder);
        bubbleConsumedRef.current = source.length;
      }
      bubbleSegmentQueueRef.current.push(...groupBubbleSentences(bubblePendingSentencesRef.current));
      bubblePendingSentencesRef.current = [];
    }

    if (!bubbleSegmentTextRef.current && bubbleSegmentQueueRef.current.length > 0) {
      const next = bubbleSegmentQueueRef.current.shift() ?? "";
      bubbleSegmentTextRef.current = next;
      setBubbleSegmentText(next);
    }
  }, [isReplyStreaming, lastAssistantMessage.content, viewMode]);

  useEffect(() => {
    if (viewMode !== "bubble" || !bubbleSegmentText) return;
    clearBubbleTimers(bubbleTimersRef);
    setBubbleVisible(true);
    setBubbleFading(false);
    clearTimer(bubbleSegmentTimerRef);
    bubbleAudioRef.current?.pause();
    let cancelled = false;

    const advance = () => {
      if (cancelled) return;
      const next = bubbleSegmentQueueRef.current.shift();
      if (next) {
        bubbleSegmentTextRef.current = next;
        setBubbleSegmentText(next);
      } else {
        bubbleSegmentTextRef.current = "";
        if (!streamingRef.current) showBubble(true);
      }
    };

    const scheduleTextFallback = () => {
      const duration = clampDuration(1400 + Array.from(bubbleSegmentText).length * 72, 2200, 6800);
      bubbleSegmentTimerRef.current = window.setTimeout(advance, duration);
    };

    const voiceReady = Boolean(
      bridge
      && configDraft?.voice.enabled
      && configDraft.voice.apiKey
      && configDraft.voice.voice
      && configDraft.voice.model
    );

    if (voiceReady) {
      bridge.synthesizeSpeech(bubbleSegmentText, Boolean(configDraft?.voice.asmrEnabled))
        .then((result) => {
          if (cancelled) return;
          const audio = new Audio(`data:${result.mimeType};base64,${result.audioBase64}`);
          bubbleAudioRef.current = audio;
          audio.onended = () => {
            if (!cancelled) bubbleSegmentTimerRef.current = window.setTimeout(advance, 320);
          };
          audio.onerror = () => {
            if (!cancelled) scheduleTextFallback();
          };
          return audio.play();
        })
        .catch((error) => {
          if (cancelled) return;
          console.warn("[voice] ElevenLabs playback failed, using text timing:", error);
          scheduleTextFallback();
        });
    } else {
      scheduleTextFallback();
    }

    return () => {
      cancelled = true;
      clearTimer(bubbleSegmentTimerRef);
      bubbleAudioRef.current?.pause();
      bubbleAudioRef.current = null;
    };
  }, [bridge, bubbleSegmentText, configDraft?.voice.apiKey, configDraft?.voice.asmrEnabled, configDraft?.voice.enabled, configDraft?.voice.model, configDraft?.voice.voice, viewMode]);

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
    if (!bridge || viewMode !== "bubble" || !bubbleVisible || !bubbleCardRef.current) return;

    const textLength = Array.from(bubbleSegmentText.replace(/\s+/g, "")).length;
    const cardWidth = Math.max(300, Math.min(640, Math.round(250 + Math.sqrt(Math.max(1, textLength)) * 20)));
    const card = bubbleCardRef.current;
    card.style.width = `${cardWidth}px`;

    const frame = window.requestAnimationFrame(() => {
      const width = cardWidth + 24;
      const height = Math.ceil(card.offsetHeight) + 28;
      void bridge.updateBubbleWindowSize(width, height).then((layout) => {
        if (layout?.placement) setBubblePlacement(layout.placement);
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [bridge, bubbleSegmentText, bubbleVisible, lastReplyMeta, viewMode]);

  // ---- Auto mouth movement: thinking + speaking while text is streaming ----
  // Mouth movement is independent from the emotion mood, so expressions are not overwritten.
  // Starts only when content actually arrives (not during network latency / LLM thinking).
  useEffect(() => {
    streamingRef.current = isReplyStreaming;

    if (isReplyStreaming && lastAssistantMessage.content) {
      clearTimer(speakingTimerRef);
      setPetSpeaking(true);
      // Text actually flowing → keep a thinking base mood unless a richer mood is active.
      setPetMood(prev => {
        if (prev === "idle" || prev === "talking") return "thinking";
        return prev; // keep LLM-set moods (happy/sad/etc.)
      });
    } else if (!isReplyStreaming) {
      // AI just finished — hold talking briefly (grace period for LLM mood IPC to arrive)
      // If no mood arrives within the grace period, fade back to idle.
      clearTimer(talkingHoldRef);
      talkingHoldRef.current = window.setTimeout(() => {
        talkingHoldRef.current = null;
        if (!lastReplyMeta?.detectedMood) {
          setPetSpeaking(false);
          setPetMood(prev => (prev === "thinking" || prev === "talking" ? "idle" : prev));
        }
      }, 500);
    }

    return () => {
      clearTimer(talkingHoldRef);
    };
  }, [isReplyStreaming, lastAssistantMessage.content, lastReplyMeta?.detectedMood]);

  useEffect(() => {
    return () => {
      clearTimer(talkingHoldRef);
      clearTimer(moodTimerRef);
      clearTimer(faceTimerRef);
      clearTimer(speakingTimerRef);
      clearMoodBeatTimers();
    };
  }, []);

  useEffect(() => {
    if ((viewMode !== "chat" && viewMode !== "code") || !historyListRef.current) {
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
      const draftWithAsmr = {
        ...configDraft,
        voice: {
          ...configDraft.voice,
          asmrMode,
          asmrPrompt,
          asmrScript
        }
      };
      const saved = await bridge.saveConfig(draftWithAsmr);
      setConfigDraft(saved);
      setSaveMessage("设置已保存到桌面端配置文件。");
    } finally {
      setSaving(false);
    }
  }

  async function handleResetRelationship() {
    if (!bridge || resettingRelationship) return;
    if (!window.confirm("确认重置情绪与好感度？互动次数和关系阶段都会回到初始状态。")) return;
    setResettingRelationship(true);
    try {
      setRelationshipProfile(await bridge.resetRelationshipProfile());
    } finally {
      setResettingRelationship(false);
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

  async function handleRefreshRagStatus() {
    if (!bridge) return;
    setLoadingRagStatus(true);
    try {
      const status = await bridge.getRagStatus();
      setRagStatus(status);
    } finally {
      setLoadingRagStatus(false);
    }
  }

  async function handleRebuildRagIndex() {
    if (!bridge) return;
    setRebuildingIndex(true);
    setRebuildMessage("");
    try {
      const result = await bridge.rebuildRagIndex();
      const fileCount = result.files?.length ?? 0;
      const embeddedCount = result.embeddedCount ?? 0;
      setRebuildMessage(`索引重建完成：${fileCount} 个文件，${embeddedCount} 个片段已向量化。`);
      // Refresh status after rebuild
      await handleRefreshRagStatus();
    } catch (err: any) {
      setRebuildMessage(`重建失败：${err?.message ?? String(err)}`);
    } finally {
      setRebuildingIndex(false);
    }
  }

  async function handleTestEmbedding() {
    if (!bridge) return;
    setTestingEmbedding(true);
    setEmbeddingTestMessage("");
    try {
      const result = await bridge.testEmbedding();
      setEmbeddingTestMessage(result.message);
    } finally {
      setTestingEmbedding(false);
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
    setActiveExpressionSet(retainPersistentShapes);
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
        const previewSpeechMs = estimateSpeechDurationMs(previewReply);
        playMoodBeats(previewReply, "happy", previewSpeechMs);
        holdSpeaking(previewSpeechMs);
        clearTimer(moodTimerRef);
        moodTimerRef.current = window.setTimeout(() => {
          moodTimerRef.current = null;
          clearMoodBeatTimers();
          setPetMood("idle");
        }, estimateExpressionDurationMs(previewReply));
        return;
      }

      const result = await bridge.chat({ message });
      setMessages(result.messages);
      setKnowledge(result.knowledge);
      setLastReplyMeta(result.lastReplyMeta);
      // Mood application is handled by main process → agent:mood-updated → pet window
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

  function handleCreateAsmrTemplate() {
    if (asmrMode === "custom") {
      setAsmrMessage("自定义模式可直接粘贴内容，或从 TXT / Markdown 文件导入。");
      return;
    }

    setAsmrScript(asmrTemplates[asmrMode]);
    setAsmrMessage(`已生成${asmrMode === "sleep" ? "哄睡" : "闲聊"}本地草稿，可继续编辑。`);
  }

  async function handleImportAsmrText() {
    if (!bridge) {
      setAsmrMessage("预览模式下无法打开本地文件选择器。");
      return;
    }

    try {
      const result = await bridge.selectAsmrTextFile();
      if (!result) return;
      setAsmrMode("custom");
      setAsmrScript(result.content);
      setAsmrMessage(`已导入 ${result.path.split(/[\\/]/).pop() ?? "文本文件"}。`);
    } catch (error) {
      setAsmrMessage(`导入失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function handleGenerateAsmrScript() {
    if (!bridge) {
      setAsmrMessage("预览模式下无法调用模型生成脚本。");
      return;
    }

    setGeneratingAsmr(true);
    setAsmrMessage("");
    try {
      const prompt = asmrPrompt.trim() || (
        asmrMode === "sleep"
          ? "生成一段约 3 分钟的温柔哄睡耳语。"
          : asmrMode === "casual"
            ? "生成一段约 3 分钟的轻松休闲耳语谈话。"
            : "生成一段自然、亲近、适合耳语朗读的 ASMR 文本。"
      );
      const script = await bridge.generateAsmrScript(asmrMode, prompt);
      setAsmrScript(script);
      setAsmrMessage("AI 耳语脚本已生成，可编辑后用于后续语音合成。");
    } catch (error) {
      setAsmrMessage(`生成失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setGeneratingAsmr(false);
    }
  }

  async function handleLoadElevenLabsVoices() {
    if (!bridge || !configDraft) return;
    setLoadingVoices(true);
    setVoiceConnectionState("testing");
    setVoiceConnectionMessage("正在连接 ElevenLabs 并验证 API Key...");
    try {
      const voices = await bridge.listElevenLabsVoices(configDraft.voice);
      setAccountVoices(voices);
      setVoiceConnectionState("success");
      setVoiceConnectionMessage(`连接成功，读取到 ${voices.length} 个账号可用音色。`);
    } catch (error) {
      setVoiceConnectionState("error");
      setVoiceConnectionMessage(`连接失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoadingVoices(false);
    }
  }

  async function handlePreviewAsmrVoice() {
    if (!bridge || !configDraft) return;
    if (previewingVoice) {
      voicePreviewTokenRef.current += 1;
      voicePreviewAudioRef.current?.pause();
      voicePreviewAudioRef.current = null;
      setPreviewingVoice(false);
      setAsmrMessage("试听已停止。");
      return;
    }

    const text = asmrScript.trim() || "你好，我是 Vivi。接下来，我会用这个声音陪你说话。";
    const chunks = splitSpeechText(text);
    const token = voicePreviewTokenRef.current + 1;
    voicePreviewTokenRef.current = token;
    setPreviewingVoice(true);
    setAsmrMessage(`正在使用 ${configDraft.voice.model} 合成试听...`);
    try {
      for (const chunk of chunks) {
        if (voicePreviewTokenRef.current !== token) return;
        const result = await bridge.synthesizeSpeech(chunk, true, configDraft.voice);
        if (voicePreviewTokenRef.current !== token) return;
        await new Promise<void>((resolve, reject) => {
          const audio = new Audio(`data:${result.mimeType};base64,${result.audioBase64}`);
          voicePreviewAudioRef.current = audio;
          audio.onended = () => resolve();
          audio.onerror = () => reject(new Error("音频播放失败。"));
          audio.play().catch(reject);
        });
      }
      setAsmrMessage(`试听完成，共播放 ${chunks.length} 个语音片段。`);
    } catch (error) {
      if (voicePreviewTokenRef.current === token) {
        setAsmrMessage(`试听失败：${error instanceof Error ? error.message : String(error)}`);
      }
    } finally {
      if (voicePreviewTokenRef.current === token) {
        voicePreviewAudioRef.current = null;
        setPreviewingVoice(false);
      }
    }
  }

  async function handleInstallLocalStt() {
    if (!bridge || !configDraft || installingLocalStt) return;
    setInstallingLocalStt(true);
    setLocalSttProgress({ phase: "runtime", percent: 0 });
    setVoiceInputMessage("正在准备本地语音识别组件...");
    try {
      const status = await bridge.installLocalStt(configDraft.speechInput.model);
      setLocalSttStatus(status);
      setVoiceInputMessage("本地语音识别已就绪，录音不会上传到网络。");
    } catch (error) {
      setVoiceInputMessage(`安装失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setInstallingLocalStt(false);
      setLocalSttProgress(null);
    }
  }

  async function handleMessageVoice(index: number, text: string) {
    if (!bridge || !configDraft?.voice.apiKey || !text.trim()) return;
    if (messageVoiceState?.index === index && messageVoiceState.status !== "error") {
      messageVoiceTokenRef.current += 1;
      messageVoiceAudioRef.current?.pause();
      messageVoiceAudioRef.current = null;
      setMessageVoiceState(null);
      return;
    }

    messageVoiceTokenRef.current += 1;
    const token = messageVoiceTokenRef.current;
    messageVoiceAudioRef.current?.pause();
    setMessageVoiceState({ index, status: "loading" });
    try {
      const chunks = splitSpeechText(sanitizeBubbleReply(text));
      for (const chunk of chunks) {
        if (messageVoiceTokenRef.current !== token) return;
        const result = await bridge.synthesizeSpeech(chunk, Boolean(configDraft.voice.asmrEnabled), configDraft.voice);
        if (messageVoiceTokenRef.current !== token) return;
        setMessageVoiceState({ index, status: "playing" });
        await new Promise<void>((resolve, reject) => {
          const audio = new Audio(`data:${result.mimeType};base64,${result.audioBase64}`);
          messageVoiceAudioRef.current = audio;
          audio.onended = () => resolve();
          audio.onerror = () => reject(new Error("音频播放失败。"));
          audio.play().catch(reject);
        });
      }
      if (messageVoiceTokenRef.current === token) setMessageVoiceState(null);
    } catch (error) {
      console.warn("[voice] message playback failed:", error);
      if (messageVoiceTokenRef.current === token) setMessageVoiceState({ index, status: "error" });
    }
  }

  function releaseMicrophone() {
    microphoneProcessorRef.current?.disconnect();
    microphoneSourceRef.current?.disconnect();
    microphoneGainRef.current?.disconnect();
    microphoneStreamRef.current?.getTracks().forEach((track) => track.stop());
    microphoneProcessorRef.current = null;
    microphoneSourceRef.current = null;
    microphoneGainRef.current = null;
    microphoneStreamRef.current = null;
    const context = microphoneContextRef.current;
    microphoneContextRef.current = null;
    if (context) void context.close();
  }

  async function stopVoiceInput() {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    setRecordingVoiceInput(false);
    const chunks = microphoneChunksRef.current;
    const sampleRate = microphoneSampleRateRef.current;
    const heardSpeech = microphoneHeardSpeechRef.current;
    microphoneChunksRef.current = [];
    releaseMicrophone();

    if (!heardSpeech || chunks.length === 0) {
      setVoiceInputMessage("没有检测到清晰语音，请靠近麦克风后重试。");
      return;
    }
    if (!bridge) return;
    setTranscribingVoiceInput(true);
    setVoiceInputMessage("正在本地识别，不会上传录音...");
    try {
      const wav = encodeWavFromChunks(chunks, sampleRate);
      const result = await bridge.transcribeLocalSpeech(wav);
      setInput((current) => current.trim() ? `${current.trim()} ${result.text}` : result.text);
      setVoiceInputMessage("识别结果已填入输入框，可修改后发送。");
      window.setTimeout(() => composerRef.current?.focus(), 30);
    } catch (error) {
      setVoiceInputMessage(`识别失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setTranscribingVoiceInput(false);
    }
  }

  async function startVoiceInput() {
    if (recordingRef.current) {
      await stopVoiceInput();
      return;
    }
    let currentSttStatus = localSttStatus;
    if (!currentSttStatus?.installed && bridge && configDraft) {
      currentSttStatus = await bridge.getLocalSttStatus(configDraft.speechInput.model).catch(() => null);
      setLocalSttStatus(currentSttStatus);
    }
    if (!currentSttStatus?.installed) {
      setVoiceInputMessage("请先在“设置 → 语音与 ASMR”安装本地 Whisper 模型。");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false
      });
      const context = new AudioContext();
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      const gain = context.createGain();
      gain.gain.value = 0;
      source.connect(processor);
      processor.connect(gain);
      gain.connect(context.destination);

      microphoneStreamRef.current = stream;
      microphoneContextRef.current = context;
      microphoneSourceRef.current = source;
      microphoneProcessorRef.current = processor;
      microphoneGainRef.current = gain;
      microphoneChunksRef.current = [];
      microphoneSampleRateRef.current = context.sampleRate;
      microphoneStartedAtRef.current = Date.now();
      microphoneLastVoiceAtRef.current = Date.now();
      microphoneHeardSpeechRef.current = false;
      recordingRef.current = true;
      setRecordingVoiceInput(true);
      setVoiceInputMessage("正在聆听，说完后静音会自动结束，也可再次点击停止。");

      processor.onaudioprocess = (event) => {
        if (!recordingRef.current) return;
        const chunk = new Float32Array(event.inputBuffer.getChannelData(0));
        microphoneChunksRef.current.push(chunk);
        let energy = 0;
        for (const sample of chunk) energy += sample * sample;
        const rms = Math.sqrt(energy / chunk.length);
        const now = Date.now();
        if (rms >= 0.018) {
          microphoneHeardSpeechRef.current = true;
          microphoneLastVoiceAtRef.current = now;
        }
        const silentLongEnough = microphoneHeardSpeechRef.current
          && now - microphoneLastVoiceAtRef.current >= (configDraft?.speechInput.silenceMs ?? 1100);
        if (silentLongEnough || now - microphoneStartedAtRef.current >= 60000) void stopVoiceInput();
      };
    } catch (error) {
      releaseMicrophone();
      recordingRef.current = false;
      setRecordingVoiceInput(false);
      setVoiceInputMessage(`无法使用麦克风：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function refreshLive2DModelList() {
    if (!bridge || scanningModels) return;
    setScanningModels(true);
    try {
      setLive2dModels(await bridge.refreshLive2DModels());
    } finally {
      setScanningModels(false);
    }
  }

  async function openCodeFile(path: string) {
    if (!bridge) return;
    setCodeFileLoading(true);
    setCodeWorkspaceError("");
    try {
      const result = await bridge.readCodeFile(path);
      setActiveCodePath(result.path);
      setActiveCodeContent(result.content);
    } catch (error) {
      setCodeWorkspaceError(error instanceof Error ? error.message : String(error));
    } finally {
      setCodeFileLoading(false);
    }
  }

  function applyCodeWorkspaceSnapshot(snapshot: CodeWorkspaceSnapshot) {
    setCodeWorkspace(snapshot);
    setCollapsedCodeDirs(new Set(
      snapshot.entries
        .filter((entry) => entry.type === "directory" && entry.depth >= 1)
        .map((entry) => entry.path)
    ));
    setActiveCodePath("");
    setActiveCodeContent("");
    setCodeFilter("");
    const firstFile = snapshot.entries.find((entry) => entry.path === "README.md")
      ?? snapshot.entries.find((entry) => entry.path === "package.json")
      ?? snapshot.entries.find((entry) => entry.type === "file");
    if (firstFile) void openCodeFile(firstFile.path);
  }

  async function selectCodeWorkspace() {
    if (!bridge) return;
    setCodeWorkspaceError("");
    try {
      const snapshot = await bridge.selectCodeWorkspace();
      if (snapshot) applyCodeWorkspaceSnapshot(snapshot);
    } catch (error) {
      setCodeWorkspaceError(error instanceof Error ? error.message : String(error));
    }
  }

  async function refreshCodeWorkspace() {
    if (!bridge) return;
    setCodeWorkspaceError("");
    try {
      applyCodeWorkspaceSnapshot(await bridge.getCodeWorkspace());
    } catch (error) {
      setCodeWorkspaceError(error instanceof Error ? error.message : String(error));
    }
  }

  function toggleCodeDirectory(path: string) {
    setCollapsedCodeDirs((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  useEffect(() => {
    if (!bridge || viewMode !== "settings") {
      return;
    }

    void handleRefreshSystemSnapshot();
    void handleRefreshFileSnapshot();
    void handleRefreshRagStatus();
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

    const pointerId = event.pointerId;
    petTouchPointerRef.current = {
      pointerId,
      startScreenX: event.screenX,
      startScreenY: event.screenY,
      startedAt: Date.now(),
      moved: false
    };
    event.currentTarget.setPointerCapture(pointerId);

    if (posLocked) return;

    const bounds = await bridge.getPetWindowBounds();
    if (petTouchPointerRef.current?.pointerId !== pointerId) return;
    dragStateRef.current = {
      pointerId,
      startScreenX: event.screenX,
      startScreenY: event.screenY,
      windowX: bounds.x,
      windowY: bounds.y,
      lastX: bounds.x,
      lastY: bounds.y,
      dragStarted: false
    };
  }

  async function handleInteractionPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const touchPointer = petTouchPointerRef.current;
    if (touchPointer?.pointerId === event.pointerId) {
      const distance = Math.hypot(
        event.screenX - touchPointer.startScreenX,
        event.screenY - touchPointer.startScreenY
      );
      if (distance > 7) touchPointer.moved = true;
    }

    const dragState = dragStateRef.current;
    if (!dragState || event.pointerId !== dragState.pointerId || !bridge) {
      return;
    }

    const deltaX = event.screenX - dragState.startScreenX;
    const deltaY = event.screenY - dragState.startScreenY;
    if (!dragState.dragStarted && Math.hypot(deltaX, deltaY) <= 7) return;
    if (!dragState.dragStarted) {
      dragState.dragStarted = true;
      setDragging(true);
    }
    const nextX = Math.round(dragState.windowX + deltaX);
    const nextY = Math.round(dragState.windowY + deltaY);

    if (nextX === dragState.lastX && nextY === dragState.lastY) {
      return;
    }

    dragState.lastX = nextX;
    dragState.lastY = nextY;
    await bridge.setPetWindowPosition(nextX, nextY);
  }

  function handleInteractionPointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const touchPointer = petTouchPointerRef.current;
    const dragState = dragStateRef.current;
    const isTrackedTouch = touchPointer?.pointerId === event.pointerId;
    const shouldReact = isTrackedTouch
      && event.type !== "pointercancel"
      && !touchPointer.moved
      && Date.now() - touchPointer.startedAt <= 650;

    if (isTrackedTouch) petTouchPointerRef.current = null;
    if (dragState?.pointerId === event.pointerId) dragStateRef.current = null;
    setDragging(false);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (shouldReact) void bridge?.petTouch();
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
              <button className="settings-save-button" type="button" onClick={handleSave} disabled={saving}>
                {saving ? "正在保存..." : "保存更改"}
              </button>
              {saveMessage ? <p>{saveMessage}</p> : null}
            </div>
          </nav>

          <div className={`settings-grid settings-tab-${settingsSection}`}>
          <section className="panel-block personalization-panel">
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
            <div className="model-choice-section">
              <p className="eyebrow">Live2D 模型</p>
              <div className="model-choice-grid" role="radiogroup" aria-label="Live2D 模型">
                {live2dModels.map((model) => (
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
                  <input
                    type="checkbox"
                    checked={configDraft.relationship.enabled}
                    onChange={(event) => setConfigDraft({
                      ...configDraft,
                      relationship: { ...configDraft.relationship, enabled: event.target.checked }
                    })}
                  />
                  启用关系成长
                </label>
                <label className="voice-switch">
                  <input
                    type="checkbox"
                    checked={configDraft.relationship.showProgress}
                    onChange={(event) => setConfigDraft({
                      ...configDraft,
                      relationship: { ...configDraft.relationship, showProgress: event.target.checked }
                    })}
                  />
                  显示成长进度
                </label>
              </div>

              {configDraft.relationship.showProgress ? (
                <>
                  <div className="relationship-progress-copy">
                    <span>好感度 {relationshipProfile.affection.score.toFixed(1)}</span>
                    <span>{relationshipNextStage(relationshipProfile)}</span>
                  </div>
                  <div
                    className="relationship-progress"
                    role="progressbar"
                    aria-label="好感度"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={relationshipProfile.affection.score}
                  >
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
              复杂任务模型预设
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
              复杂任务模型名
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
            <label>
              日常对话模型
              <input
                value={configDraft.deepseek.chatModel}
                placeholder="deepseek-chat"
                onChange={(event) =>
                  setConfigDraft({
                    ...configDraft,
                    deepseek: { ...configDraft.deepseek, chatModel: event.target.value }
                  })
                }
              />
            </label>
            <p className="knowledge-hint">
              日常对话使用独立快速模型单次流式返回；电脑操作与代码任务使用复杂任务模型和对应工具。
            </p>
            <section className="panel-block" style={{ borderTop: "1px solid var(--border-color, #e0e0e0)", paddingTop: "0.75rem", marginTop: "0.5rem" }}>
              <p className="eyebrow">Embedding 配置（RAG 向量检索）</p>
              {!configDraft.embedding?.apiKey ? (
                <p className="knowledge-hint">配置后可启用向量相似度检索，替代关键词匹配。推荐使用硅基流动（SiliconFlow）免费 Embedding API。</p>
              ) : null}
              <label>
                API Key
                <input
                  type="password"
                  value={configDraft.embedding?.apiKey ?? ""}
                  placeholder="sk-..."
                  onChange={(event) =>
                    setConfigDraft({
                      ...configDraft,
                      embedding: { ...configDraft.embedding, apiKey: event.target.value }
                    })
                  }
                />
              </label>
              <label>
                Base URL
                <input
                  value={configDraft.embedding?.baseUrl ?? "https://api.siliconflow.cn/v1"}
                  onChange={(event) =>
                    setConfigDraft({
                      ...configDraft,
                      embedding: { ...configDraft.embedding, baseUrl: event.target.value }
                    })
                  }
                />
              </label>
              <label>
                模型名
                <input
                  value={configDraft.embedding?.model ?? "BAAI/bge-m3"}
                  onChange={(event) =>
                    setConfigDraft({
                      ...configDraft,
                      embedding: { ...configDraft.embedding, model: event.target.value }
                    })
                  }
                />
              </label>
              <p className="knowledge-hint">
                向量检索会优先使用 embedding 相似度匹配，失败时自动降级到关键词检索。重建 RAG 索引时自动生成向量。
              </p>
            </section>

            <section className="panel-block" style={{ borderTop: "1px solid var(--border-color, #e0e0e0)", paddingTop: "0.75rem", marginTop: "0.5rem" }}>
              <div className="section-header-row">
                <p className="eyebrow">RAG 知识库索引</p>
                <button
                  className="ghost-button compact"
                  type="button"
                  onClick={handleRefreshRagStatus}
                  disabled={loadingRagStatus}
                >
                  {loadingRagStatus ? "刷新中..." : "刷新"}
                </button>
              </div>
              {ragStatus ? (
                <>
                  <div className="stats-grid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                    <article className="stat-card">
                      <span>索引文件</span>
                      <strong>{ragStatus.status.indexedFileCount}</strong>
                    </article>
                    <article className="stat-card">
                      <span>文本片段</span>
                      <strong>{ragStatus.status.indexedChunkCount}</strong>
                    </article>
                    <article className="stat-card">
                      <span>已向量化</span>
                      <strong>{ragStatus.status.embeddedChunkCount}</strong>
                    </article>
                  </div>
                  <p className="knowledge-hint">
                    检索模式：{ragStatus.config.mode === "keyword_only" ? "仅关键词" : "自动（优先向量）"}
                    {" · "}Embedding：{ragStatus.config.embeddingProvider} / {ragStatus.config.embeddingModel}
                    {ragStatus.status.updatedAt ? ` · 更新于 ${new Date(ragStatus.status.updatedAt).toLocaleString("zh-CN")}` : " · 尚未构建索引"}
                  </p>
                </>
              ) : (
                <p className="knowledge-hint">点击刷新查看 RAG 索引状态。</p>
              )}
              <div className="action-row" style={{ marginTop: "0.5rem" }}>
                <button
                  className="primary-button"
                  type="button"
                  onClick={handleRebuildRagIndex}
                  disabled={rebuildingIndex}
                >
                  {rebuildingIndex ? "重建中..." : "重建 RAG 索引"}
                </button>
                <button
                  className="ghost-button compact"
                  type="button"
                  onClick={handleTestEmbedding}
                  disabled={testingEmbedding}
                >
                  {testingEmbedding ? "测试中..." : "测试 Embedding"}
                </button>
              </div>
              {rebuildMessage ? <p className="feedback-text">{rebuildMessage}</p> : null}
              {embeddingTestMessage ? <p className="feedback-text">{embeddingTestMessage}</p> : null}
            </section>
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

          <section className="panel-block">
            <p className="eyebrow">数据存储</p>
            {dataPathInfo ? (
              <>
                <label>数据目录</label>
                <input value={dataPathInfo.dataDir} readOnly onClick={(e) => (e.target as HTMLInputElement).select()} />
                <p className="knowledge-hint">对话记录、知识库、应用注册表、RAG 索引均存储在此目录。</p>
                <div className="action-row">
                  <button className="ghost-button compact" type="button" onClick={async () => {
                    if (bridge) await bridge.openDataFolder();
                  }}>
                    打开数据目录
                  </button>
                </div>
              </>
            ) : (
              <p className="knowledge-hint">数据存储在系统默认应用数据目录（%APPDATA%/v-manager/agent-data/）。</p>
            )}
          </section>

          <section className="panel-block voice-settings-panel">
            <div className="section-header-row voice-section-header">
              <div>
                <p className="eyebrow">语音与 ASMR</p>
                <p className="settings-section-description">ElevenLabs V3 已接入。回复气泡会等待当前语音播放结束，再继续下一段。</p>
              </div>
              <label className="voice-switch">
                <input
                  type="checkbox"
                  checked={configDraft.voice.enabled}
                  onChange={(event) => setConfigDraft({
                    ...configDraft,
                    voice: { ...configDraft.voice, enabled: event.target.checked }
                  })}
                />
                自动朗读回复
              </label>
            </div>

            <div className="voice-config-grid">
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
                <select
                  value={configDraft.voice.model}
                  onChange={(event) => setConfigDraft({
                    ...configDraft,
                    voice: { ...configDraft.voice, model: event.target.value }
                  })}
                >
                  {elevenLabsModelPresets.map((model) => <option value={model.value} key={model.value}>{model.label}</option>)}
                </select>
              </label>
              <label>
                官方与账号音色
                <select
                  value={configDraft.voice.voice}
                  onChange={(event) => setConfigDraft({
                    ...configDraft,
                    voice: { ...configDraft.voice, voice: event.target.value }
                  })}
                >
                  {!availableVoiceOptions.some((voice) => voice.voiceId === configDraft.voice.voice) && configDraft.voice.voice ? (
                    <option value={configDraft.voice.voice}>自定义 · {configDraft.voice.voice}</option>
                  ) : null}
                  {availableVoiceOptions.map((voice) => (
                    <option value={voice.voiceId} key={voice.voiceId}>{voice.name} · {voice.category}</option>
                  ))}
                </select>
              </label>
              <label>
                自定义 Voice ID
                <input
                  value={configDraft.voice.voice}
                  placeholder="voice_id"
                  onChange={(event) => setConfigDraft({
                    ...configDraft,
                    voice: { ...configDraft.voice, voice: event.target.value.trim() }
                  })}
                />
              </label>
              <label>
                输出格式
                <select
                  value={configDraft.voice.outputFormat}
                  onChange={(event) => setConfigDraft({
                    ...configDraft,
                    voice: { ...configDraft.voice, outputFormat: event.target.value }
                  })}
                >
                  <option value="mp3_44100_128">MP3 · 44.1kHz · 128kbps</option>
                  <option value="mp3_22050_32">MP3 · 22.05kHz · 32kbps</option>
                </select>
              </label>
              <label className="voice-speed-control">
                <span>稳定度 <strong>{configDraft.voice.stability === 0 ? "Creative" : configDraft.voice.stability === 1 ? "Robust" : "Natural"}</strong></span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.5"
                  value={configDraft.voice.stability}
                  onChange={(event) => setConfigDraft({
                    ...configDraft,
                    voice: { ...configDraft.voice, stability: Number(event.target.value) }
                  })}
                />
              </label>
              <label className="voice-speed-control">
                <span>相似度 <strong>{Math.round(configDraft.voice.similarityBoost * 100)}%</strong></span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={configDraft.voice.similarityBoost}
                  onChange={(event) => setConfigDraft({
                    ...configDraft,
                    voice: { ...configDraft.voice, similarityBoost: Number(event.target.value) }
                  })}
                />
              </label>
              <label className="voice-speed-control">
                <span>语速 <strong>{configDraft.voice.model === "eleven_v3" ? "V3 使用标签控制" : `${configDraft.voice.speed.toFixed(2)}x`}</strong></span>
                <input
                  type="range"
                  min="0.7"
                  max="1.2"
                  step="0.05"
                  value={configDraft.voice.speed}
                  disabled={configDraft.voice.model === "eleven_v3"}
                  onChange={(event) => setConfigDraft({
                    ...configDraft,
                    voice: { ...configDraft.voice, speed: Number(event.target.value) }
                  })}
                />
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
                  <select
                    value={configDraft.speechInput.model}
                    onChange={(event) => setConfigDraft({
                      ...configDraft,
                      speechInput: { ...configDraft.speechInput, model: event.target.value as AgentConfig["speechInput"]["model"] }
                    })}
                  >
                    <option value="small-q5_1">Small Q5 · 推荐中文准确率 · 约 190 MB</option>
                    <option value="base-q5_1">Base Q5 · 速度优先 · 约 60 MB</option>
                  </select>
                </label>
                <label className="voice-speed-control">
                  <span>自动结束静音 <strong>{(configDraft.speechInput.silenceMs / 1000).toFixed(1)} 秒</strong></span>
                  <input
                    type="range"
                    min="700"
                    max="2000"
                    step="100"
                    value={configDraft.speechInput.silenceMs}
                    onChange={(event) => setConfigDraft({
                      ...configDraft,
                      speechInput: { ...configDraft.speechInput, silenceMs: Number(event.target.value) }
                    })}
                  />
                </label>
              </div>
              <div className="asmr-actions">
                <button className="primary-button" type="button" onClick={() => void handleInstallLocalStt()} disabled={installingLocalStt || localSttStatus?.installed}>
                  {installingLocalStt
                    ? `${localSttProgress?.phase === "model" ? "下载模型" : "安装运行时"} ${localSttProgress?.percent || 0}%`
                    : localSttStatus?.installed ? "本地识别已安装" : "安装本地语音识别"}
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
                  <input
                    type="checkbox"
                    checked={configDraft.voice.asmrEnabled}
                    onChange={(event) => setConfigDraft({
                      ...configDraft,
                      voice: { ...configDraft.voice, asmrEnabled: event.target.checked }
                    })}
                  />
                  ASMR 模式
                </label>
              </div>

              <div className="asmr-mode-selector" role="radiogroup" aria-label="ASMR 内容类型">
                {asmrModes.map((mode) => (
                  <button
                    className={asmrMode === mode.id ? "is-active" : ""}
                    type="button"
                    role="radio"
                    aria-checked={asmrMode === mode.id}
                    key={mode.id}
                    onClick={() => setAsmrMode(mode.id)}
                  >
                    <strong>{mode.label}</strong>
                    <span>{mode.description}</span>
                  </button>
                ))}
              </div>

              <label>
                生成要求
                <input
                  value={asmrPrompt}
                  placeholder="例如：雨夜、语气很轻、约 5 分钟，不要重复句子"
                  onChange={(event) => setAsmrPrompt(event.target.value)}
                />
              </label>
              <label>
                脚本文本
                <textarea
                  className="asmr-script-editor"
                  rows={10}
                  value={asmrScript}
                  placeholder="在这里编辑耳语内容，或使用下方操作生成、导入。"
                  onChange={(event) => setAsmrScript(event.target.value)}
                />
              </label>

              <div className="asmr-actions">
                <button className="primary-button" type="button" onClick={() => void handlePreviewAsmrVoice()} disabled={!configDraft.voice.apiKey || !configDraft.voice.voice}>
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
          </div>
        </div>
      </div>
    );
  }

  if (viewMode === "scale") {
    return (
      <div className="scale-window-shell">
        <div className="window-drag-strip drag-region" aria-hidden="true" />
        <div className="scale-window-card">
          <div className="panel-mini-header drag-region scale-window-header">
            <div>
              <p className="eyebrow">模型大小</p>
              <strong>显示比例 80% - 150%</strong>
            </div>
            <span className="scale-value">{Math.round(draftPetScale * 100)}%</span>
          </div>

          <input
            type="range"
            min={0.8}
            max={1.5}
            step={0.01}
            value={draftPetScale}
            onChange={(event) => setDraftPetScale(clampPetScale(Number(event.target.value)))}
          />

          <div className="scale-presets" aria-label="常用模型比例">
            {[0.8, 1, 1.25, 1.5].map((preset) => (
              <button
                className={Math.abs(draftPetScale - preset) < 0.005 ? "is-active" : ""}
                type="button"
                key={preset}
                onClick={() => setDraftPetScale(preset)}
              >
                {Math.round(preset * 100)}%
              </button>
            ))}
          </div>

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
            {voiceInputMessage ? <p className="composer-voice-feedback" role="status">{voiceInputMessage}</p> : null}
            <div className="pet-history-actions no-drag">
              <button
                className={`voice-input-button ${recordingVoiceInput ? "is-recording" : ""}`}
                type="button"
                title={recordingVoiceInput ? "停止录音" : "本地语音输入"}
                aria-label={recordingVoiceInput ? "停止录音" : "本地语音输入"}
                disabled={transcribingVoiceInput}
                onClick={() => void startVoiceInput()}
              >
                {transcribingVoiceInput ? <LoaderCircle size={16} /> : recordingVoiceInput ? <Square size={14} /> : <Mic size={17} />}
                <span>{transcribingVoiceInput ? "识别中" : recordingVoiceInput ? "停止" : "语音"}</span>
              </button>
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
        <div className="window-drag-strip drag-region" aria-hidden="true" />
        <section className="chat-window-panel">
          <div className="panel-mini-header drag-region chat-window-header">
            <div>
              <p className="eyebrow">聊天栏</p>
              <strong>{configDraft.personaName} 历史上下文</strong>
            </div>
            <span className={`runtime-badge ${lastReplyMeta?.responseMode ?? "fallback_local"}`}>
              {lastReplyMeta?.sourceLabel ?? "尚未发送对话"}
            </span>
          </div>

          <div className="chat-window-list" ref={historyListRef}>
            {messages.map((message, index) => {
              const voiceState = messageVoiceState?.index === index ? messageVoiceState.status : null;
              const replyStillStreaming = isReplyStreaming && index === messages.length - 1;
              return (
              <article className={`message ${message.role}`} key={`${message.role}-${index}`}>
                <div className="chat-message-header">
                  <span className="message-role">{message.role === "assistant" ? configDraft.personaName : "你"}</span>
                  {message.role === "assistant" ? (
                    <button
                      className={`message-voice-button ${voiceState ? `is-${voiceState}` : ""}`}
                      type="button"
                      title={voiceState === "playing" ? "停止播放" : voiceState === "loading" ? "正在生成语音" : voiceState === "error" ? "重试语音" : "朗读这条回复"}
                      aria-label={voiceState === "playing" ? "停止播放" : "朗读这条回复"}
                      disabled={!configDraft.voice.apiKey || !message.content.trim() || replyStillStreaming}
                      onClick={() => void handleMessageVoice(index, message.content)}
                    >
                      {voiceState === "loading" ? <LoaderCircle size={15} /> : voiceState === "playing" ? <Square size={13} /> : voiceState === "error" ? <RotateCcw size={15} /> : <Volume2 size={16} />}
                    </button>
                  ) : null}
                </div>
                <p>{message.content}</p>
              </article>
              );
            })}
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
            {voiceInputMessage ? <p className="voice-input-feedback">{voiceInputMessage}</p> : null}
            <div className="pet-history-actions">
              <button
                className={`voice-input-button ${recordingVoiceInput ? "is-recording" : ""}`}
                type="button"
                title={recordingVoiceInput ? "停止录音" : "语音输入"}
                aria-label={recordingVoiceInput ? "停止录音" : "语音输入"}
                disabled={transcribingVoiceInput}
                onClick={() => void startVoiceInput()}
              >
                {transcribingVoiceInput ? <LoaderCircle size={17} /> : recordingVoiceInput ? <Square size={15} /> : <Mic size={18} />}
                <span>{transcribingVoiceInput ? "识别中" : recordingVoiceInput ? "停止" : "语音输入"}</span>
              </button>
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


  if (viewMode === "code") {
    const normalizedFilter = codeFilter.trim().toLowerCase();
    const visibleEntries = codeWorkspace?.entries.filter((entry) => (
      normalizedFilter
        ? entry.path.toLowerCase().includes(normalizedFilter)
        : ![...collapsedCodeDirs].some((directory) => (
            entry.path !== directory
            && (entry.path.startsWith(`${directory}\\`) || entry.path.startsWith(`${directory}/`))
          ))
    )) ?? [];
    const codeLines = activeCodeContent.split(/\r?\n/).slice(0, 5000);

    return (
      <div className="code-workbench-shell">
        <header className="code-workbench-header">
          <div className="code-brand">
            <strong>Vivi Code</strong>
            <span>{codeWorkspace?.root ?? "正在读取工作区..."}</span>
          </div>
          <div className="code-header-actions">
            <span className={`runtime-badge ${lastReplyMeta?.responseMode ?? "fallback_local"}`}>
              {sending ? "Vivi 正在处理" : lastReplyMeta?.sourceLabel ?? "代码会话就绪"}
            </span>
            <button className="code-icon-button" type="button" aria-label="关闭代码工作台" title="关闭" onClick={() => window.close()}>
              ×
            </button>
          </div>
        </header>

        <main className="code-workbench-grid">
          <aside className="code-explorer">
            <div className="code-pane-title">
              <strong>资源管理器</strong>
              <button className="code-refresh-button" type="button" title="刷新文件树" aria-label="刷新文件树" onClick={() => void refreshCodeWorkspace()}>
                ↻
              </button>
            </div>
            <div className="code-workspace-actions">
              <button type="button" onClick={() => void selectCodeWorkspace()}>打开文件夹</button>
              <button type="button" onClick={() => void bridge?.openChatWindow()}>日常对话</button>
            </div>
            <input
              className="code-file-filter"
              value={codeFilter}
              onChange={(event) => setCodeFilter(event.target.value)}
              placeholder="筛选文件"
              aria-label="筛选工作区文件"
            />
            <div className="code-file-tree">
              {visibleEntries.map((entry) => (
                entry.type === "directory" ? (
                  <button
                    className={`code-tree-directory ${collapsedCodeDirs.has(entry.path) ? "is-collapsed" : ""}`}
                    style={{ paddingLeft: 10 + entry.depth * 14 }}
                    key={`directory-${entry.path}`}
                    title={entry.path}
                    type="button"
                    onClick={() => toggleCodeDirectory(entry.path)}
                  >
                    <span>{collapsedCodeDirs.has(entry.path) ? "›" : "⌄"}</span>{entry.name}
                  </button>
                ) : (
                  <button
                    className={`code-tree-file ${activeCodePath === entry.path ? "is-active" : ""}`}
                    style={{ paddingLeft: 24 + entry.depth * 14 }}
                    type="button"
                    key={`file-${entry.path}`}
                    title={entry.path}
                    onClick={() => void openCodeFile(entry.path)}
                  >
                    {entry.name}
                  </button>
                )
              ))}
            </div>
          </aside>

          <section className="code-editor-pane">
            <div className="code-editor-tabbar">
              <span className={activeCodePath ? "is-open" : ""}>{activeCodePath || "选择一个文件"}</span>
              {codeFileLoading ? <small>读取中...</small> : <small>只读预览</small>}
            </div>
            {codeWorkspaceError ? <div className="code-empty-state">{codeWorkspaceError}</div> : null}
            {!codeWorkspaceError && activeCodePath ? (
              <pre className="code-editor-content" aria-label={activeCodePath}>
                {codeLines.map((line, index) => (
                  <div className="code-line" key={`${activeCodePath}-${index}`}>
                    <span>{index + 1}</span>
                    <code>{line || " "}</code>
                  </div>
                ))}
              </pre>
            ) : null}
            {!codeWorkspaceError && !activeCodePath ? (
              <div className="code-empty-state">从左侧选择文件，或直接让 Vivi 检查项目。</div>
            ) : null}
          </section>

          <aside className="code-agent-pane">
            <div className="code-pane-title code-agent-title">
              <div>
                <strong>{configDraft.personaName}</strong>
                <span>代码会话与日常记忆共享</span>
              </div>
            </div>
            <div className="code-terminal-chat" ref={historyListRef}>
              {messages.map((message, index) => (
                <article className={`code-terminal-message ${message.role}`} key={`code-${message.role}-${index}`}>
                  <span>{message.role === "assistant" ? configDraft.personaName.toLowerCase() : "you"} &gt;</span>
                  <p>{message.content}</p>
                </article>
              ))}
            </div>
            <div className="code-quick-actions">
              <button type="button" onClick={() => setInput("检查当前项目结构并告诉我最值得处理的问题")}>检查项目</button>
              <button
                type="button"
                disabled={!activeCodePath}
                onClick={() => setInput(`解释 ${activeCodePath} 的职责和关键逻辑`)}
              >
                解释当前文件
              </button>
            </div>
            <form className="code-agent-composer" onSubmit={handleSend}>
              <textarea
                ref={composerRef}
                placeholder="和 Vivi 聊天，或让她搜索、解释、修改代码..."
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                rows={5}
              />
              <div className="code-composer-footer">
                <span>Enter 发送 · Shift + Enter 换行</span>
                <button className="primary-button compact-primary" type="submit" disabled={sending || !input.trim()}>
                  {sending ? "处理中..." : "发送"}
                </button>
              </div>
            </form>
          </aside>
        </main>
      </div>
    );
  }

  function handlePetInteractionChange(interactive: boolean) {
    if (dragStateRef.current || petTouchPointerRef.current || !bridge || viewMode !== "pet") return;
    bridge.setPetMousePassthrough(!interactive);
  }

  if (viewMode === "expressions") {
    const expressions = [
      { name: "expression0", label: "豆豆眼", cat: "情绪" },
      { name: "expression1", label: "星星眼", cat: "情绪" },
      { name: "expression2", label: "脸红", cat: "情绪" },
      { name: "expression3", label: "脸红2", cat: "情绪" },
      { name: "expression4", label: "黑脸", cat: "情绪" },
      { name: "expression5", label: "眼泪", cat: "情绪" },
      { name: "expression6", label: "眼珠", cat: "情绪" },
      { name: "expression7", label: "问号", cat: "情绪" },
      { name: "expression8", label: "问号2", cat: "情绪" },
      { name: "expression9", label: "流汗", cat: "情绪" },
      { name: "expression10", label: "无语", cat: "情绪" },
      { name: "expression11", label: "钱眼", cat: "情绪" },
      { name: "expression12", label: "爱心眼", cat: "情绪" },
      { name: "expression13", label: "轮回眼", cat: "情绪" },
      { name: "expression14", label: "空白眼", cat: "情绪" },
      { name: "expression15", label: "吐舌", cat: "情绪" },
      { name: "expression16", label: "嘟嘴", cat: "情绪" },
      { name: "expression17", label: "鼓嘴", cat: "情绪" },
      { name: "expression18", label: "星星", cat: "情绪" },
      { name: "expression19", label: "生气", cat: "情绪" },
      { name: "expression20", label: "长发", cat: "形态" },
      { name: "expression21", label: "双马尾", cat: "形态" },
      { name: "expression22", label: "垂耳", cat: "形态" },
      { name: "expression23", label: "照镜子", cat: "动作" },
      { name: "expression24", label: "狐狸", cat: "形态" },
      { name: "expression25", label: "笔记本R", cat: "动作" },
      { name: "expression26", label: "笔记本L", cat: "动作" },
      { name: "expression27", label: "打游戏", cat: "动作" },
      { name: "expression28", label: "抱狐狸", cat: "动作" },
      { name: "expression29", label: "扇子", cat: "动作" },
      { name: "expression30", label: "话筒", cat: "动作" },
      { name: "expression31", label: "比心", cat: "动作" },
    ];
    const cats = ["情绪", "形态", "动作"];
    return (
      <div className="expression-window-shell">
        <header className="expression-window-header">
          <p className="eyebrow">表情与动作</p>
          <h1>芊芊</h1>
          <p className="settings-subtitle">点击开关，可多选组合</p>
        </header>
        <div className="expression-reset-bar">
          <button
            className="expression-reset-button"
            onClick={() => bridge?.clearExpressions()}
          >
            全部清除
          </button>
        </div>
        {cats.map(cat => (
          <section key={cat} className="panel-block" style={{marginBottom: '12px', padding: '14px'}}>
            <p className="eyebrow">{cat}</p>
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px'}}>
              {expressions.filter(e => e.cat === cat).map(e => (
                <button
                  key={e.name}
                  className={`ghost-button compact ${activeExpressionSet.has(e.name) ? "is-active" : ""}`}
                  style={{padding: '8px 6px', fontSize: '12px', textAlign: 'center'}}
                  onClick={() => bridge?.triggerExpression(e.name)}
                >
                  {e.label}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    );
  }



  if (viewMode === "bubble") {
    return (
      <div className={`bubble-window-shell placement-${bubblePlacement}`}>
        {bubbleVisible ? (
          <article ref={bubbleCardRef} className={`speech-bubble assistant-bubble bubble-window-card ${bubbleFading ? "is-fading" : ""}`}>
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
            <p>{bubbleSegmentText || "..."}</p>
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
            <Live2DPreview
              mood={petMood}
              modelId={selectedLive2DModel?.id ?? "qianqian"}
              modelName={selectedLive2DModel?.label}
              modelDirectory={selectedLive2DModel?.directory}
              modelFileName={selectedLive2DModel?.fileName}
              activeExpressionSet={activeExpressionSet}
              faceParams={faceParams}
              speaking={petSpeaking}
              onInteractionChange={handlePetInteractionChange}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;

import {
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  Suspense,
  useEffect,
  lazy,
  useMemo,
  useRef,
  useState
} from "react";
import { AlertCircle, CheckCircle2, Code2, LoaderCircle, Mic, RotateCcw, Send, Settings2, Sparkles, Square, Volume2 } from "lucide-react";
import { FaceParams, LIVE2D_MODEL_PRESETS, PetMood } from "./pet/live2dConfig";
import {
  BubbleWindowView,
  ChatWindowView,
  ComposerWindowView,
  ExpressionsWindowView,
  PetWindowView,
  ScaleWindowView,
  StartupView
} from "./views/window-views";
import { CodeWindowRoot, SettingsWindowRoot } from "./views/window-roots";
import type {
  AsmrMode,
  ChatMessage,
  DeepSeekModelPreset,
  PersonaDraft,
  RuntimeReplyMeta,
  SettingsSection,
  VoiceConnectionState
} from "./views/runtime-types";
import type { WindowView } from "./window-view";

type MoodBeat = {
  mood: PetMood;
  atMs: number;
};

const Live2DPreview = lazy(() => import("./pet/Live2DPreview"));

const codeAgentModes: Array<{ id: CodeAgentMode; label: string; hint: string }> = [
  { id: "auto", label: "自动", hint: "自动判断；写入前会先确认" },
  { id: "read", label: "问答", hint: "只读搜索与解释" },
  { id: "plan", label: "规划", hint: "分析并制定方案，不改文件" },
  { id: "agent", label: "Agent", hint: "连续编辑、检查并运行测试" },
  { id: "review", label: "审查", hint: "检查代码和 Git 变更，不改文件" }
];

const starterMessages: ChatMessage[] = [
  {
    role: "assistant",
    content: "你来啦。今天想从哪里开始聊？"
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
    model: "deepseek-v4-pro",
    chatModel: "deepseek-v4-flash"
  },
  embedding: {
    apiKey: "",
    baseUrl: "https://api.siliconflow.cn/v1",
    model: "BAAI/bge-m3"
  },
  appearance: {
    theme: "light",
    live2dModel: "qianqian",
    mouseFollow: true,
    hoverAutoHide: false,
    renderFps: 30,
    powerSaving: true
  },
  voice: {
    enabled: false,
    provider: "local",
    localPackId: "sherpa-zh-ll",
    localSpeakerId: 0,
    localSpeed: 1,
    localSilenceScale: 0.2,
    gptSovitsBaseUrl: "http://127.0.0.1:9880",
    gptSovitsProfileId: "dania-v2-pro-plus",
    gptSovitsSpeed: 1,
    gptSovitsAutoStart: true,
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
  astrbot: {
    enabled: false,
    baseUrl: "http://127.0.0.1:6185",
    apiKey: "",
    contactMap: {}
  },
  relationship: {
    enabled: true,
    showProgress: true
  },
  proactive: {
    enabled: true,
    socialCheckins: true,
    healthReminders: true,
    lateNightCare: true,
    systemNotifications: true,
    workMinutes: 60,
    reminderCooldownMinutes: 90,
    minimumIntervalMinutes: 120,
    dailyLimit: 4,
    idleResetMinutes: 10,
    viviRestAfterMinutes: 120,
    lateNightHour: 23,
    quietStart: "00:00",
    quietEnd: "08:00"
  },
  interests: {
    enabled: false,
    permissionLevel: "diary_only",
    activities: { diary: true, miniGames: false, drawing: false },
    dailyTaskLimit: 1,
    dailyTokenBudget: 2500,
    maxTaskMinutes: 5,
    maxDiskMB: 100,
    idleMinutes: 30,
    minimumHoursBetweenTasks: 6,
    activeStart: "09:00",
    activeEnd: "22:00",
    diaryHour: 21,
    diaryTime: "21:00",
    autoOpenPreview: false,
    selfPlayGames: true,
    selfPlayMaxSeconds: 20,
    selfPlayMaxActions: 40,
    selfRepairAttempts: 1,
    autonomousLifeEnabled: true,
    virtualScheduleEnabled: true,
    autonomousRoutineLimit: 9,
    entertainmentDailyLimit: 2,
    autonomousActivities: {
      collectDiaryMaterials: true, browseInformation: true, organizeMemory: true,
      playExistingGame: true, improveExistingGame: true, reviewDrawing: true,
      planCreation: true, rest: true, prepareChatTopics: true
    },
    networkAccess: "off",
    autoLocation: true,
    weatherLocation: "",
    newsTopics: { hot: true, gaming: true, science: true, ai: true },
    newsFeeds: []
  },
  memory: {
    maxMessages: 40,
    knowledgeTopK: 3,
    maxInputTokens: 12000,
    historyTokenBudget: 6000,
    companionTokenBudget: 1000,
    knowledgeTokenBudget: 1800
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
    { id: "messenger", name: "消息联动", status: "planned", detail: "AstrBot、微信代发与自动回复已归入后续路线，本阶段不作为可用能力开放。" }
  ]
};

const emptyPersonaPayload: PersonaPayload = {
  identityName: "Vivi",
  identity: "住在电脑桌面上的私人智能搭档",
  selfReference: "我",
  userAddress: "你、主人",
  relationship: "桌面伙伴与工作搭档",
  values: ["真诚", "可靠", "尊重隐私"],
  personalityTraits: ["自然", "亲和", "偏执行型"],
  speechStyle: "使用自然、简洁的中文，根据关系和情绪调整表达。",
  habits: "",
  boundaries: "不编造执行结果，不越过用户授权，不把角色设定当作现实事实。",
  background: "",
  cosplay: "",
  extra: "",
  exampleLines: [],
  live2dModelId: ""
};

function personaDraftFromCard(card?: PersonaCard | null): PersonaDraft {
  return card
    ? { id: card.id, name: card.name, status: card.status, payload: { ...card.payload } }
    : { id: "", name: "新人物卡", status: "active", payload: { ...emptyPersonaPayload } };
}

function formatStorageBytes(value: number | undefined) {
  const bytes = Math.max(0, Number(value) || 0);
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 2 : 1)} MB`;
}

function interestActivityLabel(type: InterestActivityType) {
  const labels: Record<InterestActivityType, string> = {
    diary: "整理日记", drawing: "自由绘画", mini_game: "制作并试玩小游戏",
    collect_diary_materials: "收集日记素材", browse_information: "看看天气和资讯",
    organize_memory: "整理记忆和话题", play_existing_game: "玩已有游戏",
    improve_existing_game: "改进以前的游戏", review_drawing: "回顾自己的画作",
    plan_creation: "规划下一次创作", rest: "休息和发呆", prepare_chat_topics: "准备聊天话题"
  };
  return labels[type] || type;
}

function interestCategoryLabel(category?: string) {
  return category === "creative" ? "创作" : category === "entertainment" ? "娱乐" : category === "companion" ? "陪伴准备" : "轻量日常";
}

function formatDiarySchedule(dueAt: string | undefined, nowMs: number) {
  if (!dueAt) return "保存设置后安排";
  const due = new Date(dueAt);
  const clock = due.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
  const remainingMinutes = Math.ceil((due.getTime() - nowMs) / 60000);
  if (remainingMinutes <= 0) return `计划 ${clock} · 等待主人暂时没有互动`;
  if (remainingMinutes < 60) return `计划 ${clock} · 还有 ${remainingMinutes} 分钟`;
  const hours = Math.floor(remainingMinutes / 60);
  const minutes = remainingMinutes % 60;
  return `计划 ${clock} · 还有 ${hours} 小时${minutes ? ` ${minutes} 分钟` : ""}`;
}

const deepSeekModelPresets: readonly DeepSeekModelPreset[] = [
  { value: "deepseek-v4-flash", label: "deepseek-v4-flash", hint: "官方 V4 Flash，偏速度，适合日常对话。" },
  { value: "deepseek-v4-pro", label: "deepseek-v4-pro", hint: "官方 V4 Pro，质量更高，通常更慢也更贵。" }
] as const;

const elevenLabsModelPresets: readonly DeepSeekModelPreset[] = [
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

type RuntimeAppProps = {
  viewMode: WindowView;
};

function RuntimeApp({ viewMode }: RuntimeAppProps) {
  const [startupStatus, setStartupStatus] = useState<StartupStatus>({
    phase: "booting",
    progress: 4,
    title: "正在唤醒 Vivi",
    detail: "准备本地运行环境…"
  });
  const [bootstrap, setBootstrap] = useState<AgentBootstrap | null>(null);
  const [configDraft, setConfigDraft] = useState<AgentConfig | null>(null);
  const [personaCards, setPersonaCards] = useState<PersonaCard[]>([]);
  const [personaDraft, setPersonaDraft] = useState<PersonaDraft>(() => personaDraftFromCard());
  const [personaMessage, setPersonaMessage] = useState("");
  const [savingPersona, setSavingPersona] = useState(false);
  const [personaAiPrompt, setPersonaAiPrompt] = useState("");
  const [personaAiUseWeb, setPersonaAiUseWeb] = useState(true);
  const [personaAiGenerating, setPersonaAiGenerating] = useState(false);
  const [personaAiSources, setPersonaAiSources] = useState<PersonaGenerationSource[]>([]);
  const [personaSearch, setPersonaSearch] = useState("");
  const [personaListFilter, setPersonaListFilter] = useState<"all" | "active" | "archived">("all");
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
  const [codeDraftContent, setCodeDraftContent] = useState("");
  const [codeEditing, setCodeEditing] = useState(false);
  const [codeSaving, setCodeSaving] = useState(false);
  const [codeSaveMessage, setCodeSaveMessage] = useState("");
  const [codeAgentMode, setCodeAgentMode] = useState<CodeAgentMode>(() => {
    const saved = window.localStorage.getItem("vivi-code-agent-mode");
    return codeAgentModes.some((mode) => mode.id === saved) ? saved as CodeAgentMode : "auto";
  });
  const [autoLaunchEnabled, setAutoLaunchEnabled] = useState(false);
  const [lifeState, setLifeState] = useState<LifeState | null>(null);
  const [companionMemory, setCompanionMemory] = useState<CompanionMemoryStore | null>(null);
  const [interestSnapshot, setInterestSnapshot] = useState<InterestSandboxSnapshot | null>(null);
  const [interestRuntimeState, setInterestRuntimeState] = useState<InterestRuntimeState>({ status: "idle", type: null, label: "当前没有进行创作", startedAt: null });
  const [interestScheduleClock, setInterestScheduleClock] = useState(Date.now());
  const [interestMessage, setInterestMessage] = useState("");
  const [interestRunning, setInterestRunning] = useState<InterestActivityType | null>(null);
  const [interestLogStatus, setInterestLogStatus] = useState<"all" | "completed" | "failed">("all");
  const [interestLogPersona, setInterestLogPersona] = useState("all");
  const [interestLogPage, setInterestLogPage] = useState(1);
  const [cleaningInterest, setCleaningInterest] = useState(false);
  const [locationRetryNonce, setLocationRetryNonce] = useState(0);
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [codeFileLoading, setCodeFileLoading] = useState(false);
  const [codeWorkspaceError, setCodeWorkspaceError] = useState("");
  const [systemSnapshot, setSystemSnapshot] = useState<SystemResourceSnapshot | null>(null);
  const [fileSnapshot, setFileSnapshot] = useState<FileManagerSnapshot | null>(null);
  const [managedTarget, setManagedTarget] = useState("downloads");
  const [managedMode, setManagedMode] = useState<"type" | "date">("type");
  const [managedScan, setManagedScan] = useState<ManagedDirectoryScan | null>(null);
  const [organizationPreview, setOrganizationPreview] = useState<FileOrganizationPreview | null>(null);
  const [fileOperations, setFileOperations] = useState<FileOperation[]>([]);
  const [fileManagerMessage, setFileManagerMessage] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [connectionMessage, setConnectionMessage] = useState("");
  const [astrBotConnectionMessage, setAstrBotConnectionMessage] = useState("");
  const [testingAstrBot, setTestingAstrBot] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [clearingMemory, setClearingMemory] = useState(false);
  const [dataPathInfo, setDataPathInfo] = useState<{
    baseDir: string;
    dataDir: string;
    knowledgeDir?: string;
    personaKnowledgePath?: string;
    personaDatabasePath?: string;
  } | null>(null);
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
  const [bubbleSegmentReady, setBubbleSegmentReady] = useState(false);
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
  const [localTtsPacks, setLocalTtsPacks] = useState<LocalTtsPackStatus[]>([]);
  const [installingLocalTts, setInstallingLocalTts] = useState(false);
  const [localTtsProgress, setLocalTtsProgress] = useState(0);
  const [localTtsMessage, setLocalTtsMessage] = useState("");
  const [gptSovitsProfiles, setGptSovitsProfiles] = useState<GptSovitsProfileStatus[]>([]);
  const [installingGptSovits, setInstallingGptSovits] = useState(false);
  const [gptSovitsProgress, setGptSovitsProgress] = useState(0);
  const [gptSovitsMessage, setGptSovitsMessage] = useState("");
  const [showGptSovitsImport, setShowGptSovitsImport] = useState(false);
  const [importingGptSovits, setImportingGptSovits] = useState(false);
  const [gptSovitsImportDraft, setGptSovitsImportDraft] = useState({
    name: "",
    author: "",
    version: "v2ProPlus",
    sourceUrl: "",
    license: "请以来源网页标注为准",
    promptText: "",
    promptLang: "zh",
    textLang: "zh",
    description: ""
  });
  const [gptSovitsRuntimeStatus, setGptSovitsRuntimeStatus] = useState<GptSovitsRuntimeStatus>({ ready: false });
  const [gptSovitsRuntimeBusy, setGptSovitsRuntimeBusy] = useState<"start" | "stop" | null>(null);
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
  const [petHoverHidden, setPetHoverHidden] = useState(false);
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
  const chatAutomaticAudioRef = useRef<HTMLAudioElement | null>(null);
  const chatAutomaticVoiceTokenRef = useRef(0);
  const activePersonaVoiceRef = useRef("");
  const memoryRefreshTimerRef = useRef<number | null>(null);
  const voicePreviewAudioRef = useRef<HTMLAudioElement | null>(null);
  const voicePreviewTokenRef = useRef(0);
  const messageVoiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const messageVoiceTokenRef = useRef(0);
  const automaticVoiceBlockedUntilRef = useRef(0);
  const recordingRef = useRef(false);
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const microphoneContextRef = useRef<AudioContext | null>(null);
  const locationRequestedRef = useRef(false);
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
  const speechSignalRef = useRef({ active: false, level: 0 });
  const speechAnalysisCleanupRef = useRef<(() => void) | null>(null);
  const pendingSpeechPerformanceRef = useRef<{
    reply: string;
    mood: PetMood;
    faceParams: Record<string, number> | null;
  } | null>(null);
  const rendererReadyReportedRef = useRef(false);
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
  const lastPetInteractiveRef = useRef(true);
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
    if (!activePersonaVoiceRef.current && configDraft?.activePersonaCard?.id) {
      activePersonaVoiceRef.current = configDraft.activePersonaCard.id;
    }
  }, [configDraft?.activePersonaCard?.id]);

  useEffect(() => {
    if (!bridge || viewMode !== "pet") return;
    const enabled = configDraft?.appearance?.hoverAutoHide === true;
    setPetHoverHidden(enabled && lastPetInteractiveRef.current);
    bridge.setPetMousePassthrough(enabled || !lastPetInteractiveRef.current);
  }, [bridge, configDraft?.appearance?.hoverAutoHide, viewMode]);

  useEffect(() => {
    if (!bridge || !configDraft || (viewMode !== "settings" && viewMode !== "chat")) return;
    let cancelled = false;
    bridge.getLocalSttStatus(configDraft.speechInput.model)
      .then((status) => { if (!cancelled) setLocalSttStatus(status); })
      .catch(() => { if (!cancelled) setLocalSttStatus(null); });
    return () => { cancelled = true; };
  }, [bridge, configDraft?.speechInput.model, viewMode]);

  useEffect(() => {
    if (!bridge || (viewMode !== "settings" && viewMode !== "chat")) return;
    return bridge.onLocalSttProgress((progress) => {
      setLocalSttProgress({ phase: progress.phase, percent: progress.percent });
    });
  }, [bridge, viewMode]);

  useEffect(() => {
    if (!bridge || viewMode !== "settings") return;
    let cancelled = false;
    bridge.listLocalTtsPacks()
      .then((packs) => { if (!cancelled) setLocalTtsPacks(packs); })
      .catch(() => { if (!cancelled) setLocalTtsPacks([]); });
    bridge.listGptSovitsProfiles()
      .then((profiles) => { if (!cancelled) setGptSovitsProfiles(profiles); })
      .catch(() => { if (!cancelled) setGptSovitsProfiles([]); });
    if (configDraft?.voice.gptSovitsBaseUrl) {
      bridge.getGptSovitsRuntimeStatus(configDraft.voice.gptSovitsBaseUrl)
        .then((status) => { if (!cancelled) setGptSovitsRuntimeStatus(status); })
        .catch(() => { if (!cancelled) setGptSovitsRuntimeStatus({ ready: false }); });
    }
    return () => { cancelled = true; };
  }, [bridge, configDraft?.voice.gptSovitsBaseUrl, viewMode]);

  useEffect(() => {
    if (!bridge || viewMode !== "settings") return;
    return bridge.onLocalTtsProgress((progress) => setLocalTtsProgress(progress.percent));
  }, [bridge, viewMode]);

  useEffect(() => {
    if (!bridge || viewMode !== "settings") return;
    return bridge.onGptSovitsProgress((progress) => setGptSovitsProgress(progress.percent));
  }, [bridge, viewMode]);

  function clearTimer(timerRef: { current: number | null }) {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function stopSpeechLipSync() {
    const cleanup = speechAnalysisCleanupRef.current;
    speechAnalysisCleanupRef.current = null;
    cleanup?.();
    speechSignalRef.current.active = false;
    speechSignalRef.current.level = 0;
    bridge?.reportSpeechSignal?.({ active: false, level: 0 });
  }

  function startSpeechLipSync(audio: HTMLAudioElement) {
    stopSpeechLipSync();
    speechSignalRef.current.active = true;
    speechSignalRef.current.level = 0;
    let context: AudioContext | null = null;
    let source: MediaElementAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;
    let frame: number | null = null;
    let disposed = false;

    const cleanup = () => {
      if (disposed) return;
      disposed = true;
      if (frame !== null) window.cancelAnimationFrame(frame);
      try { source?.disconnect(); } catch { }
      try { analyser?.disconnect(); } catch { }
      if (context) void context.close().catch(() => { });
      if (speechAnalysisCleanupRef.current === cleanup) {
        speechAnalysisCleanupRef.current = null;
        speechSignalRef.current.active = false;
        speechSignalRef.current.level = 0;
      }
    };

    try {
      context = new AudioContext();
      source = context.createMediaElementSource(audio);
      analyser = context.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.58;
      source.connect(analyser);
      analyser.connect(context.destination);
      const samples = new Float32Array(analyser.fftSize);
      let smoothed = 0;
      let lastBroadcastAt = 0;
      const update = () => {
        if (disposed || !analyser) return;
        analyser.getFloatTimeDomainData(samples);
        let energy = 0;
        for (const sample of samples) energy += sample * sample;
        const rms = Math.sqrt(energy / samples.length);
        smoothed = smoothed * 0.62 + rms * 0.38;
        speechSignalRef.current.level = smoothed;
        const now = performance.now();
        if (now - lastBroadcastAt >= 66) {
          lastBroadcastAt = now;
          bridge?.reportSpeechSignal?.({ active: true, level: smoothed });
        }
        frame = window.requestAnimationFrame(update);
      };
      void context.resume();
      frame = window.requestAnimationFrame(update);
    } catch (error) {
      console.warn("[voice] audio analyser unavailable; using fallback mouth animation:", error);
    }

    speechAnalysisCleanupRef.current = cleanup;
    return cleanup;
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

  function hasAutomaticVoice() {
    if (!configDraft?.voice.enabled) return false;
    return configDraft.voice.provider === "local"
      || configDraft.voice.provider === "gpt_sovits"
      || Boolean(configDraft.voice.apiKey && configDraft.voice.voice && configDraft.voice.model);
  }

  function playChatAutomaticReply(
    replyText: string,
    mood: PetMood,
    requestedFaceParams: Record<string, number> | null
  ) {
    const token = ++chatAutomaticVoiceTokenRef.current;
    chatAutomaticAudioRef.current?.pause();
    chatAutomaticAudioRef.current = null;
    stopSpeechLipSync();
    pendingSpeechPerformanceRef.current = { reply: replyText, mood, faceParams: requestedFaceParams };

    bridge?.synthesizeSpeech(replyText, Boolean(configDraft?.voice.asmrEnabled), configDraft?.voice, true)
      .then((result) => {
        if (token !== chatAutomaticVoiceTokenRef.current || viewMode !== "chat") return;
        if (result.skipped || !result.audioBase64 || !result.mimeType) {
          pendingSpeechPerformanceRef.current = null;
          startReplyPerformance(replyText, mood, requestedFaceParams, estimateSpeechDurationMs(replyText), true);
          return;
        }
        const audio = new Audio(`data:${result.mimeType};base64,${result.audioBase64}`);
        chatAutomaticAudioRef.current = audio;
        let stopLipSync = () => { };
        const finish = () => {
          stopLipSync();
          if (token !== chatAutomaticVoiceTokenRef.current) return;
          chatAutomaticAudioRef.current = null;
          pendingSpeechPerformanceRef.current = null;
          finishReplyPerformance();
        };
        audio.onended = finish;
        audio.onerror = () => {
          stopLipSync();
          if (token !== chatAutomaticVoiceTokenRef.current) return;
          chatAutomaticAudioRef.current = null;
          pendingSpeechPerformanceRef.current = null;
          startReplyPerformance(replyText, mood, requestedFaceParams, estimateSpeechDurationMs(replyText), true);
        };
        return audio.play().then(() => {
          if (token !== chatAutomaticVoiceTokenRef.current) {
            audio.pause();
            return;
          }
          stopLipSync = startSpeechLipSync(audio);
          startReplyPerformance(
            replyText,
            mood,
            requestedFaceParams,
            Number.isFinite(audio.duration) && audio.duration > 0 ? Math.round(audio.duration * 1000) : estimateSpeechDurationMs(replyText),
            false
          );
          setPetSpeaking(true);
        });
      })
      .catch((error) => {
        if (token !== chatAutomaticVoiceTokenRef.current) return;
        console.warn("[voice] chat automatic playback failed; using estimated lip sync:", error);
        pendingSpeechPerformanceRef.current = null;
        startReplyPerformance(replyText, mood, requestedFaceParams, estimateSpeechDurationMs(replyText), true);
      });
  }

  function startReplyPerformance(
    replyText: string,
    mood: PetMood,
    requestedFaceParams: Record<string, number> | null,
    durationMs = estimateSpeechDurationMs(replyText),
    useEstimatedMouth = true
  ) {
    const speechMs = Math.max(600, durationMs);
    const expressionMs = Math.max(estimateExpressionDurationMs(replyText), speechMs);
    clearTimer(talkingHoldRef);
    clearTimer(moodTimerRef);
    clearTimer(faceTimerRef);
    setActiveExpressionSet(retainPersistentShapes);
    playMoodBeats(replyText, mood, speechMs);
    if (useEstimatedMouth) holdSpeaking(speechMs);

    const safeFaceParams = requestedFaceParams ? { ...requestedFaceParams } : null;
    if (safeFaceParams && mood !== "surprised") delete safeFaceParams.Param52;
    setFaceParams(safeFaceParams && Object.keys(safeFaceParams).length ? safeFaceParams : null);
    moodTimerRef.current = window.setTimeout(() => {
      moodTimerRef.current = null;
      clearMoodBeatTimers();
      setPetMood(streamingRef.current ? "thinking" : "idle");
    }, expressionMs);
    if (safeFaceParams && Object.keys(safeFaceParams).length) {
      faceTimerRef.current = window.setTimeout(() => {
        faceTimerRef.current = null;
        setFaceParams(null);
      }, expressionMs);
    }
  }

  function finishReplyPerformance() {
    clearTimer(talkingHoldRef);
    clearTimer(speakingTimerRef);
    clearTimer(moodTimerRef);
    clearTimer(faceTimerRef);
    clearMoodBeatTimers();
    setPetSpeaking(false);
    setPetMood(streamingRef.current ? "thinking" : "idle");
    setFaceParams(null);
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
    if (!bridge || viewMode !== "startup") return;
    void bridge.getStartupStatus().then(setStartupStatus);
    return bridge.onStartupProgress(setStartupStatus);
  }, [bridge, viewMode]);

  useEffect(() => {
    async function bootstrapAgent() {
      if (viewMode === "startup" || viewMode === "expressions" || viewMode === "scale") return;
      if (!bridge) {
        setBootstrap(previewBootstrap);
        setConfigDraft(previewBootstrap.config);
        setPersonaCards(previewBootstrap.personaCards ?? []);
        return;
      }

      try {
        const result = await bridge.getBootstrap();
        setBootstrap(result);
        setConfigDraft(result.config);
        setPersonaCards(result.personaCards ?? []);
        if (viewMode === "settings") {
          setPersonaDraft(personaDraftFromCard(result.activePersonaCard ?? result.personaCards?.[0]));
          setAsmrMode(result.config.voice.asmrMode ?? "sleep");
          setAsmrPrompt(result.config.voice.asmrPrompt ?? "");
          setAsmrScript(result.config.voice.asmrScript ?? "");
        }
        if (viewMode === "settings" || viewMode === "chat") {
          setRelationshipProfile(result.relationshipProfile ?? previewBootstrap.relationshipProfile);
        }
        if (viewMode === "settings" || viewMode === "pet" || viewMode === "chat") {
          if (result.live2dModels?.length) setLive2dModels(result.live2dModels);
        }
        if (viewMode === "pet") {
          const runtimeScale = clampPetScale(await bridge.getPetScale());
          setPetScale(runtimeScale);
          setDraftPetScale(runtimeScale);
          try {
            const locked = await bridge.getPositionLock();
            setPosLocked(locked);
          } catch { /* ignore */ }
        }
        if (viewMode === "chat" || viewMode === "composer" || viewMode === "code" || viewMode === "bubble") {
          const nextChatState = await bridge.getChatState();
          setMessages(nextChatState.messages);
          setKnowledge(nextChatState.knowledge);
          setLastReplyMeta(nextChatState.lastReplyMeta);
        }
        if (viewMode === "settings") {
          try {
            const dp = await bridge.getDataPath();
            setDataPathInfo(dp);
          } catch { /* preview mode */ }
          try {
            setLifeState(await bridge.getLifeState());
          } catch { /* preview mode */ }
          try {
            setCompanionMemory(await bridge.getCompanionMemory());
          } catch { /* preview mode */ }
          try {
            setSchedules(await bridge.listSchedules());
          } catch { /* preview mode */ }
        }
        if (viewMode === "settings" || viewMode === "bubble") {
          try {
            setInterestSnapshot(await bridge.getInterestSandbox());
          } catch { /* preview mode */ }
          try {
            setInterestRuntimeState(await bridge.getInterestState());
          } catch { /* preview mode */ }
        }
      } catch {
        setBootstrap(previewBootstrap);
        setConfigDraft(previewBootstrap.config);
        setPersonaCards([]);
      }
    }

    bootstrapAgent();
  }, [bridge, viewMode]);

  useEffect(() => {
    if (!bridge || viewMode !== "scale") return;
    let cancelled = false;
    bridge.getPetScale()
      .then((nextScale) => {
        if (cancelled) return;
        const normalized = clampPetScale(nextScale);
        setPetScale(normalized);
        setDraftPetScale(normalized);
      })
      .catch(() => { });
    return () => { cancelled = true; };
  }, [bridge, viewMode]);

  useEffect(() => {
    return () => {
      clearBubbleTimers(bubbleTimersRef);
      clearTimer(bubbleSegmentTimerRef);
      if (memoryRefreshTimerRef.current !== null) window.clearTimeout(memoryRefreshTimerRef.current);
      bubbleAudioRef.current?.pause();
      voicePreviewAudioRef.current?.pause();
      messageVoiceAudioRef.current?.pause();
      stopSpeechLipSync();
      microphoneStreamRef.current?.getTracks().forEach((track) => track.stop());
      void microphoneContextRef.current?.close();
    };
  }, []);

  useEffect(() => {
    const interests = configDraft?.interests;
    if (!bridge || !interests?.enabled || interests.autoLocation === false || interests.networkAccess === "off" || locationRequestedRef.current) return;
    if (!("geolocation" in navigator)) {
      setInterestMessage("当前 Windows 环境不支持自动定位，天气信息将暂时跳过。");
      return;
    }
    locationRequestedRef.current = true;
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const snapshot = await bridge.updateInterestLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy
          });
          setInterestSnapshot(snapshot);
        } catch (error) {
          setInterestMessage(error instanceof Error ? error.message : String(error));
        }
      },
      () => setInterestMessage("未获得 Windows 定位权限，天气信息将暂时跳过；其他创作仍可正常进行。"),
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 6 * 60 * 60_000 }
    );
  }, [bridge, configDraft?.interests.enabled, configDraft?.interests.autoLocation, configDraft?.interests.networkAccess, locationRetryNonce]);

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
    if (!bridge || viewMode !== "settings") return;
    let cancelled = false;
    const offAutoLaunch = bridge.onAutoLaunchUpdated(setAutoLaunchEnabled);
    bridge.getAutoLaunch()
      .then((enabled) => { if (!cancelled) setAutoLaunchEnabled(enabled); })
      .catch(() => { if (!cancelled) setAutoLaunchEnabled(false); });
    return () => { cancelled = true; offAutoLaunch(); };
  }, [bridge, viewMode]);

  useEffect(() => {
    if (!bridge) {
      return;
    }

    const needsConfigSync = viewMode !== "startup" && viewMode !== "expressions" && viewMode !== "scale";
    const needsChatStateSync = viewMode === "settings" || viewMode === "chat" || viewMode === "composer" || viewMode === "code" || viewMode === "bubble";
    const needsRelationshipSync = viewMode === "settings" || viewMode === "chat";
    const needsInterestSync = viewMode === "settings" || viewMode === "bubble";
    const needsPetScaleSync = viewMode === "pet" || viewMode === "scale";
    const needsLive2DModelSync = viewMode === "settings" || viewMode === "pet" || viewMode === "chat";

    const offConfig = needsConfigSync ? bridge.onConfigUpdated((nextConfig) => {
      const nextPersonaId = nextConfig.activePersonaCard?.id || "";
      const automaticVoiceStopped = nextConfig.voice?.enabled !== true;
      if (automaticVoiceStopped || (activePersonaVoiceRef.current && activePersonaVoiceRef.current !== nextPersonaId)) {
        chatAutomaticVoiceTokenRef.current += 1;
        chatAutomaticAudioRef.current?.pause();
        chatAutomaticAudioRef.current = null;
        bubbleAudioRef.current?.pause();
        bubbleAudioRef.current = null;
        messageVoiceTokenRef.current += 1;
        messageVoiceAudioRef.current?.pause();
        if (automaticVoiceStopped) pendingSpeechPerformanceRef.current = null;
        stopSpeechLipSync();
      }
      activePersonaVoiceRef.current = nextPersonaId;
      setConfigDraft(nextConfig);
      setBootstrap((current) => (current ? { ...current, config: nextConfig } : current));
    }) : () => { };

    const offScale = needsPetScaleSync ? bridge.onPetScaleUpdated((nextScale) => {
      const normalized = clampPetScale(nextScale);
      setPetScale(normalized);
      setDraftPetScale(normalized);
    }) : () => { };

    const offChatState = needsChatStateSync ? bridge.onChatStateUpdated((nextState) => {
      setMessages(nextState.messages);
      setKnowledge(nextState.knowledge);
      setLastReplyMeta(nextState.lastReplyMeta);
      if (viewMode === "settings") {
        if (memoryRefreshTimerRef.current !== null) window.clearTimeout(memoryRefreshTimerRef.current);
        memoryRefreshTimerRef.current = window.setTimeout(() => {
          memoryRefreshTimerRef.current = null;
          void bridge.getCompanionMemory().then(setCompanionMemory).catch(() => { });
        }, 350);
      }
    }) : () => { };

    const offRelationship = needsRelationshipSync ? bridge.onRelationshipUpdated(setRelationshipProfile) : () => { };
    const offLifeState = viewMode === "settings" ? bridge.onLifeStateUpdated(setLifeState) : undefined;
    const offSchedules = viewMode === "settings" ? bridge.onSchedulesUpdated(setSchedules) : undefined;
    const offInterestState = needsInterestSync ? bridge.onInterestStateUpdated(setInterestRuntimeState) : undefined;

    const offPosLock = viewMode === "pet" ? bridge.onPositionLockUpdated((locked: boolean) => {
      setPosLocked(locked);
    }) : undefined;

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

    const offLive2DModels = needsLive2DModelSync ? bridge.onLive2DModelsUpdated(setLive2dModels) : () => { };

    const offExpressionsUpdated = (viewMode === "pet" || viewMode === "expressions" || viewMode === "chat")
      ? bridge.onExpressionsUpdated((expressions) => {
        setActiveExpressionSet(new Set(expressions));
      })
      : () => { };

    const offMoodUpdated = (viewMode === "pet" || viewMode === "chat") ? bridge.onMoodUpdated?.((payload) => {
      if ((viewMode === "pet" || viewMode === "chat") && payload?.mood) {
        console.log(`[App] received ${payload.phase ?? "final"} mood:`, payload.mood);
        const llmMood = payload.mood as PetMood;
        if (payload.phase === "anticipation") {
          const durationMs = Math.max(420, Math.min(payload.durationMs ?? 760, 1400));
          clearTimer(talkingHoldRef);
          clearTimer(moodTimerRef);
          clearTimer(faceTimerRef);
          clearMoodBeatTimers();
          setPetSpeaking(false);
          setActiveExpressionSet(retainPersistentShapes);
          setPetMood(llmMood);
          setFaceParams(payload.faceParams ? { ...payload.faceParams } : null);
          moodTimerRef.current = window.setTimeout(() => {
            moodTimerRef.current = null;
            setPetMood(streamingRef.current ? "thinking" : "idle");
          }, durationMs);
          faceTimerRef.current = window.setTimeout(() => {
            faceTimerRef.current = null;
            setFaceParams(null);
          }, Math.min(durationMs + 180, 1500));
          return;
        }
        const replyContent = payload.reply ?? [...messages].reverse().find((message) => message.role === "assistant")?.content ?? "";
        if (hasAutomaticVoice() && viewMode === "chat") {
          playChatAutomaticReply(replyContent, llmMood, payload.faceParams ? { ...payload.faceParams } : null);
        } else if (hasAutomaticVoice()) {
          pendingSpeechPerformanceRef.current = {
            reply: replyContent,
            mood: llmMood,
            faceParams: payload.faceParams ? { ...payload.faceParams } : null
          };
          if (!speechSignalRef.current.active) finishReplyPerformance();
        } else {
          pendingSpeechPerformanceRef.current = null;
          startReplyPerformance(replyContent, llmMood, payload.faceParams ? { ...payload.faceParams } : null);
        }
      }
    }) : undefined;

    const offSpeechSignal = (viewMode === "pet" || viewMode === "chat") ? bridge.onSpeechSignalUpdated?.((signal) => {
      speechSignalRef.current.active = Boolean(signal?.active);
      speechSignalRef.current.level = Math.max(0, Math.min(1, Number(signal?.level) || 0));
      if (signal?.phase === "start") {
        const pending = pendingSpeechPerformanceRef.current;
        const text = signal.text || pending?.reply || "";
        const mood = (signal.mood as PetMood) || pending?.mood || "happy";
        startReplyPerformance(
          text,
          mood,
          signal.faceParams || pending?.faceParams || null,
          signal.durationMs || estimateSpeechDurationMs(text),
          false
        );
        setPetSpeaking(true);
        return;
      }
      if (signal?.phase === "fallback") {
        const pending = pendingSpeechPerformanceRef.current;
        const text = signal.text || pending?.reply || "";
        startReplyPerformance(
          text,
          (signal.mood as PetMood) || pending?.mood || "happy",
          signal.faceParams || pending?.faceParams || null,
          signal.durationMs || estimateSpeechDurationMs(text),
          true
        );
        pendingSpeechPerformanceRef.current = null;
        return;
      }
      if (signal?.phase === "end") {
        if (signal.finalSegment) pendingSpeechPerformanceRef.current = null;
        finishReplyPerformance();
        return;
      }
      if (signal?.active) setPetSpeaking(true);
      else if (!streamingRef.current) setPetSpeaking(false);
    }) : undefined;

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

      if (action === "open-scale-panel" && viewMode === "pet") {
        void bridge.openScaleWindow();
      }

      if (action === "clear-bubble" && viewMode === "bubble") {
        setBubbleVisible(false);
      }

      if (action === "show-bubble" && viewMode === "bubble") {
        const source = sanitizeBubbleReply(
          [...messages].reverse().find((message) => message.role === "assistant")?.content ?? ""
        ).trim();
        clearBubbleTimers(bubbleTimersRef);
        clearTimer(bubbleSegmentTimerRef);
        bubblePendingSentencesRef.current = [];
        bubbleSegmentQueueRef.current = [];
        bubbleConsumedRef.current = source.length;
        bubbleSourceRef.current = source;
        bubbleSegmentTextRef.current = source;
        setBubbleSegmentText(source);
        showBubble(true);
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
      offLifeState?.();
      offSchedules?.();
      offInterestState?.();
      offMenu();
      offPosLock?.();
      offTriggerExpr?.();
      offClearExpr?.();
      offExpressionsUpdated?.();
      offMoodUpdated?.();
      offSpeechSignal?.();
    };
  }, [bridge, viewMode, messages]);

  const ready = viewMode === "scale" || viewMode === "expressions" || Boolean(bootstrap && configDraft);
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

  const visiblePersonaCards = useMemo(() => {
    const query = personaSearch.trim().toLocaleLowerCase();
    return personaCards.filter((card) => {
      if (personaListFilter === "active" && card.status === "archived") return false;
      if (personaListFilter === "archived" && card.status !== "archived") return false;
      if (!query) return true;
      const searchable = [
        card.name,
        card.payload.identityName,
        card.payload.identity,
        card.payload.personalityTraits.join(" ")
      ].join(" ").toLocaleLowerCase();
      return searchable.includes(query);
    });
  }, [personaCards, personaListFilter, personaSearch]);

  const interestPersonaOptions = useMemo(() => {
    const values = new Map<string, string>();
    for (const activity of interestSnapshot?.activities ?? []) {
      const id = activity.personaCardId || "legacy";
      values.set(id, activity.personaName || (id === "legacy" ? "旧记录（未标注人格）" : id));
    }
    return [...values.entries()].map(([id, name]) => ({ id, name }));
  }, [interestSnapshot]);

  const filteredInterestActivities = useMemo(() => (interestSnapshot?.activities ?? []).filter((activity) => {
    if (interestLogStatus === "completed" && activity.status !== "completed") return false;
    if (interestLogStatus === "failed" && activity.status === "completed") return false;
    if (interestLogPersona !== "all" && (activity.personaCardId || "legacy") !== interestLogPersona) return false;
    return true;
  }), [interestSnapshot, interestLogPersona, interestLogStatus]);
  const interestLogPageCount = Math.max(1, Math.ceil(filteredInterestActivities.length / 6));
  const safeInterestLogPage = Math.min(interestLogPage, interestLogPageCount);
  const pagedInterestActivities = filteredInterestActivities.slice((safeInterestLogPage - 1) * 6, safeInterestLogPage * 6);
  const todayDiaryActivity = interestSnapshot?.activities.find((item) => item.day === interestSnapshot.today.date && item.type === "diary" && item.status === "completed");
  const nextInterestRoutine = interestSnapshot?.routine?.find((item) => item.status !== "completed");
  const completedInterestRoutineCount = interestSnapshot?.routine?.filter((item) => item.status === "completed").length ?? 0;

  useEffect(() => {
    if (!bridge || viewMode !== "settings") return;
    const refreshSchedule = () => {
      setInterestScheduleClock(Date.now());
      void bridge.getInterestSandbox().then(setInterestSnapshot).catch(() => { });
    };
    const timer = window.setInterval(refreshSchedule, 30_000);
    return () => window.clearInterval(timer);
  }, [bridge, viewMode]);

  useEffect(() => {
    if (!bridge || viewMode !== "settings" || interestRuntimeState.status !== "working") return;
    const refresh = () => { void bridge.getInterestSandbox().then(setInterestSnapshot).catch(() => { }); };
    refresh();
    const timer = window.setInterval(refresh, 2500);
    return () => window.clearInterval(timer);
  }, [bridge, interestRuntimeState.status, viewMode]);

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

    if (!isReplyStreaming && !bubbleSegmentTextRef.current && bubbleSegmentQueueRef.current.length > 0) {
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
    stopSpeechLipSync();
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
    let fallbackStarted = false;

    const voiceBridge = bridge;
    const voiceReady = Boolean(
      voiceBridge
      && configDraft?.voice.enabled
      && Date.now() >= automaticVoiceBlockedUntilRef.current
      && (configDraft.voice.provider === "local" || configDraft.voice.provider === "gpt_sovits"
        || (configDraft.voice.apiKey && configDraft.voice.voice && configDraft.voice.model))
    );
    setBubbleSegmentReady(!voiceReady);
    const startTextFallback = () => {
      if (fallbackStarted || cancelled) return;
      fallbackStarted = true;
      setBubbleSegmentReady(true);
      voiceBridge?.reportSpeechSignal?.({
        active: false,
        level: 0,
        phase: "fallback",
        text: bubbleSegmentText,
        durationMs: clampDuration(1400 + Array.from(bubbleSegmentText).length * 72, 2200, 6800),
        mood: lastReplyMeta?.detectedMood,
        faceParams: lastReplyMeta?.faceParams || null
      });
      scheduleTextFallback();
    };

    if (voiceReady && voiceBridge) {
      voiceBridge.synthesizeSpeech(bubbleSegmentText, Boolean(configDraft?.voice.asmrEnabled), configDraft?.voice, true)
        .then((result) => {
          if (cancelled) return;
          if (result.skipped || !result.audioBase64 || !result.mimeType) {
            startTextFallback();
            return;
          }
          const audio = new Audio(`data:${result.mimeType};base64,${result.audioBase64}`);
          bubbleAudioRef.current = audio;
          let stopLipSync = () => { };
          audio.onended = () => {
            stopLipSync();
            voiceBridge.reportSpeechSignal?.({
              active: false,
              level: 0,
              phase: "end",
              text: bubbleSegmentText,
              finalSegment: bubbleSegmentQueueRef.current.length === 0
            });
            if (!cancelled) bubbleSegmentTimerRef.current = window.setTimeout(advance, 320);
          };
          audio.onerror = () => {
            stopLipSync();
            startTextFallback();
          };
          return audio.play().then(() => {
            if (cancelled) {
              audio.pause();
              return;
            }
            setBubbleSegmentReady(true);
            stopLipSync = startSpeechLipSync(audio);
            voiceBridge.reportSpeechSignal?.({
              active: true,
              level: 0,
              phase: "start",
              text: bubbleSegmentText,
              durationMs: Number.isFinite(audio.duration) && audio.duration > 0
                ? Math.round(audio.duration * 1000)
                : estimateSpeechDurationMs(bubbleSegmentText),
              mood: lastReplyMeta?.detectedMood,
              faceParams: lastReplyMeta?.faceParams || null
            });
          });
        })
        .catch((error) => {
          if (cancelled) return;
          automaticVoiceBlockedUntilRef.current = Date.now() + 60_000;
          console.warn("[voice] automatic playback failed; pausing voice retries for 60 seconds:", error);
          startTextFallback();
        });
    } else {
      setBubbleSegmentReady(true);
      scheduleTextFallback();
    }

    return () => {
      cancelled = true;
      clearTimer(bubbleSegmentTimerRef);
      bubbleAudioRef.current?.pause();
      bubbleAudioRef.current = null;
      stopSpeechLipSync();
    };
  }, [bridge, bubbleSegmentText, configDraft?.activePersonaCard?.id, configDraft?.voice.apiKey, configDraft?.voice.asmrEnabled, configDraft?.voice.enabled, configDraft?.voice.gptSovitsProfileId, configDraft?.voice.localPackId, configDraft?.voice.localSpeakerId, configDraft?.voice.model, configDraft?.voice.provider, configDraft?.voice.voice, viewMode]);

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
      chatAutomaticVoiceTokenRef.current += 1;
      chatAutomaticAudioRef.current?.pause();
      chatAutomaticAudioRef.current = null;
      stopSpeechLipSync();
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

  function selectPersonaCard(card: PersonaCard) {
    setPersonaDraft(personaDraftFromCard(card));
    setPersonaMessage("");
  }

  function updatePersonaPayload<K extends keyof PersonaPayload>(key: K, value: PersonaPayload[K]) {
    setPersonaDraft((current) => ({ ...current, payload: { ...current.payload, [key]: value } }));
  }

  async function handleSavePersonaCard() {
    if (!bridge || savingPersona) return;
    setSavingPersona(true);
    setPersonaMessage("");
    try {
      const input = { name: personaDraft.name, payload: personaDraft.payload };
      const result = personaDraft.id
        ? await bridge.updatePersonaCard(personaDraft.id, input)
        : await bridge.createPersonaCard(input);
      setPersonaCards(result.cards);
      setPersonaDraft(personaDraftFromCard(result.card));
      const updatedConfig = (result as { config?: AgentConfig }).config;
      if (updatedConfig) setConfigDraft(updatedConfig);
      setPersonaMessage(personaDraft.id ? "人物卡已保存，并生成了一个新版本。" : "人物卡已创建。需要点击“启用”才会切换人格。");
    } catch (error) {
      setPersonaMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingPersona(false);
    }
  }

  async function handleActivatePersonaCard() {
    if (!bridge || !personaDraft.id) return;
    try {
      chatAutomaticVoiceTokenRef.current += 1;
      chatAutomaticAudioRef.current?.pause();
      bubbleAudioRef.current?.pause();
      messageVoiceTokenRef.current += 1;
      messageVoiceAudioRef.current?.pause();
      stopSpeechLipSync();
      const result = await bridge.activatePersonaCard(personaDraft.id);
      setPersonaCards(result.cards);
      setPersonaDraft(personaDraftFromCard(result.card));
      setConfigDraft(result.config);
      setPersonaMessage(`已切换为“${result.card.name}”，下一次回复立即生效。`);
    } catch (error) {
      setPersonaMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleArchivePersonaCard() {
    if (!bridge || !personaDraft.id) return;
    try {
      const cards = await bridge.archivePersonaCard(personaDraft.id);
      setPersonaCards(cards);
      const next = cards.find((card) => card.isActive) ?? cards[0];
      setPersonaDraft(personaDraftFromCard(next));
      setPersonaMessage("人物卡已归档，历史版本和关联记忆仍会保留。  ");
    } catch (error) {
      setPersonaMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleRestorePersonaCard() {
    if (!bridge || !personaDraft.id) return;
    try {
      const cards = await bridge.restorePersonaCard(personaDraft.id);
      setPersonaCards(cards);
      const restored = cards.find((card) => card.id === personaDraft.id);
      setPersonaDraft(personaDraftFromCard(restored));
      setPersonaMessage("人物卡已恢复，可以继续修改或启用。  ");
    } catch (error) {
      setPersonaMessage(error instanceof Error ? error.message : String(error));
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

      const result = await bridge.chat({
        message,
        codeContext: viewMode === "code"
          ? { mode: codeAgentMode, activeFile: activeCodePath || undefined }
          : undefined
      });
      setMessages(result.messages);
      setKnowledge(result.knowledge);
      setLastReplyMeta(result.lastReplyMeta);
      if (viewMode === "code" && (result.lastReplyMeta?.toolUseCount ?? 0) > 0) {
        const currentPath = activeCodePath;
        const snapshot = await bridge.getCodeWorkspace();
        setCodeWorkspace(snapshot);
        if (currentPath) await openCodeFile(currentPath);
      }
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

  async function handleInstallLocalTtsPack() {
    if (!bridge || !configDraft || installingLocalTts) return;
    setInstallingLocalTts(true);
    setLocalTtsProgress(0);
    setLocalTtsMessage("正在下载安装本地语音包，请保持网络连接。安装完成后即可断网使用。");
    try {
      const installed = await bridge.installLocalTtsPack(configDraft.voice.localPackId);
      setLocalTtsPacks(await bridge.listLocalTtsPacks());
      setLocalTtsMessage(`${installed.name} 已安装，可以直接试听或自动朗读。`);
    } catch (error) {
      setLocalTtsMessage(`安装失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setInstallingLocalTts(false);
    }
  }

  async function handleInstallGptSovitsProfile() {
    if (!bridge || !configDraft || installingGptSovits) return;
    setInstallingGptSovits(true);
    setGptSovitsProgress(0);
    setGptSovitsMessage("正在下载角色权重、SoVITS 权重和参考音频，并执行 SHA-256 校验。");
    try {
      const installed = await bridge.installGptSovitsProfile(configDraft.voice.gptSovitsProfileId);
      setGptSovitsProfiles(await bridge.listGptSovitsProfiles());
      setGptSovitsMessage(`${installed.name} 已安装。请启动 GPT-SoVITS api_v2.py 服务后试听。`);
    } catch (error) {
      setGptSovitsMessage(`安装失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setInstallingGptSovits(false);
    }
  }

  async function handleGeneratePersonaCard(createImmediately = false) {
    if (!bridge || personaAiGenerating) return;
    if (!personaAiPrompt.trim()) {
      setPersonaMessage("先简单描述角色，例如“鸣潮守岸人，温柔神秘，称呼我为漂泊者”。");
      return;
    }
    setPersonaAiGenerating(true);
    setPersonaMessage("");
    try {
      const result = await bridge.generatePersonaCardDraft({
        description: personaAiPrompt,
        useWeb: personaAiUseWeb
      });
      setPersonaAiSources(result.sources);
      const draft = personaDraftFromCard({
        id: "",
        status: "active",
        version: 1,
        createdAt: "",
        updatedAt: "",
        archivedAt: null,
        name: result.draft.name,
        payload: result.draft.payload
      });
      if (createImmediately) {
        const created = await bridge.createPersonaCard({ name: draft.name, payload: draft.payload });
        setPersonaCards(created.cards);
        setPersonaDraft(personaDraftFromCard(created.card));
        setPersonaMessage(`“${created.card.name}”已由 AI 生成并创建。需要点击“启用”才会切换人格。${result.searchWarning ? ` 联网提示：${result.searchWarning}` : ""}`);
      } else {
        setPersonaDraft(draft);
        setPersonaMessage(`AI 已自动填写人物卡；确认后点击“创建人物卡”。${result.searchWarning ? ` 联网提示：${result.searchWarning}` : ""}`);
      }
    } catch (error) {
      setPersonaMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPersonaAiGenerating(false);
    }
  }

  async function handleImportGptSovitsProfile() {
    if (!bridge || importingGptSovits) return;
    setImportingGptSovits(true);
    setGptSovitsMessage("请选择同一声线的一份 .ckpt、一份 .pth 和一份参考音频。");
    try {
      const imported = await bridge.importGptSovitsProfile(gptSovitsImportDraft);
      if (!imported) {
        setGptSovitsMessage("已取消导入。");
        return;
      }
      const profiles = await bridge.listGptSovitsProfiles();
      setGptSovitsProfiles(profiles);
      if (configDraft) {
        setConfigDraft({ ...configDraft, voice: { ...configDraft.voice, gptSovitsProfileId: imported.id } });
      }
      setShowGptSovitsImport(false);
      setGptSovitsMessage(`${imported.name} 已校验并加入语音库，保存“语音与 ASMR”设置后会作为当前回复声线。`);
    } catch (error) {
      setGptSovitsMessage(`导入失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setImportingGptSovits(false);
    }
  }

  async function handleGptSovitsRuntime(action: "start" | "stop") {
    if (!bridge || !configDraft || gptSovitsRuntimeBusy) return;
    setGptSovitsRuntimeBusy(action);
    setGptSovitsMessage(action === "start" ? "正在启动本地语音模型…" : "正在释放本地语音模型与内存…");
    try {
      const nextConfig = action === "stop"
        ? { ...configDraft, voice: { ...configDraft.voice, enabled: false } }
        : configDraft;
      const saved = await bridge.saveConfig(nextConfig);
      setConfigDraft(saved);
      const status = action === "start"
        ? await bridge.startGptSovitsRuntime(saved.voice.gptSovitsBaseUrl)
        : await bridge.stopGptSovitsRuntime(saved.voice.gptSovitsBaseUrl);
      setGptSovitsRuntimeStatus(status);
      automaticVoiceBlockedUntilRef.current = 0;
      setGptSovitsMessage(action === "start"
        ? "GPT-SoVITS 已启动，可以立即试听。"
        : "GPT-SoVITS 已关闭，自动朗读也已关闭，模型占用的内存正在释放。"
      );
    } catch (error) {
      setGptSovitsMessage(`${action === "start" ? "启动" : "关闭"}失败：${error instanceof Error ? error.message : String(error)}`);
      try { setGptSovitsRuntimeStatus(await bridge.getGptSovitsRuntimeStatus(configDraft.voice.gptSovitsBaseUrl)); } catch { }
    } finally {
      setGptSovitsRuntimeBusy(null);
    }
  }

  async function handlePreviewAsmrVoice() {
    if (!bridge || !configDraft) return;
    if (previewingVoice) {
      voicePreviewTokenRef.current += 1;
      voicePreviewAudioRef.current?.pause();
      voicePreviewAudioRef.current = null;
      stopSpeechLipSync();
      setPreviewingVoice(false);
      setAsmrMessage("试听已停止。");
      return;
    }

    const text = asmrScript.trim() || "你好，我是 Vivi。接下来，我会用这个声音陪你说话。";
    const chunks = splitSpeechText(text);
    const token = voicePreviewTokenRef.current + 1;
    voicePreviewTokenRef.current = token;
    setPreviewingVoice(true);
    setAsmrMessage(`正在使用 ${configDraft.voice.provider === "local" ? "本地语音包" : configDraft.voice.provider === "gpt_sovits" ? "GPT-SoVITS 角色声线" : configDraft.voice.model} 合成试听...`);
    try {
      for (const chunk of chunks) {
        if (voicePreviewTokenRef.current !== token) return;
        const result = await bridge.synthesizeSpeech(chunk, true, configDraft.voice);
        if (voicePreviewTokenRef.current !== token) return;
        await new Promise<void>((resolve, reject) => {
          const audio = new Audio(`data:${result.mimeType};base64,${result.audioBase64}`);
          voicePreviewAudioRef.current = audio;
          const stopLipSync = startSpeechLipSync(audio);
          audio.onended = () => { stopLipSync(); resolve(); };
          audio.onerror = () => { stopLipSync(); reject(new Error("音频播放失败。")); };
          audio.play().catch((error) => { stopLipSync(); reject(error); });
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
    if (!bridge || !configDraft || !text.trim()) return;
    const voiceReady = configDraft.voice.provider === "local"
      || configDraft.voice.provider === "gpt_sovits"
      || Boolean(configDraft.voice.apiKey && configDraft.voice.voice && configDraft.voice.model);
    if (!voiceReady) return;
    if (messageVoiceState?.index === index && messageVoiceState.status !== "error") {
      messageVoiceTokenRef.current += 1;
      messageVoiceAudioRef.current?.pause();
      messageVoiceAudioRef.current = null;
      stopSpeechLipSync();
      setMessageVoiceState(null);
      return;
    }

    messageVoiceTokenRef.current += 1;
    const token = messageVoiceTokenRef.current;
    messageVoiceAudioRef.current?.pause();
    stopSpeechLipSync();
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
          const stopLipSync = startSpeechLipSync(audio);
          audio.onended = () => { stopLipSync(); resolve(); };
          audio.onerror = () => { stopLipSync(); reject(new Error("音频播放失败。")); };
          audio.play().catch((error) => { stopLipSync(); reject(error); });
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
    if (codeEditing && codeDraftContent !== activeCodeContent && path !== activeCodePath) {
      const shouldDiscard = window.confirm("当前文件有未保存改动，确定要放弃并打开其他文件吗？");
      if (!shouldDiscard) return;
    }
    setCodeFileLoading(true);
    setCodeWorkspaceError("");
    try {
      const result = await bridge.readCodeFile(path);
      setActiveCodePath(result.path);
      setActiveCodeContent(result.content);
      setCodeDraftContent(result.content);
      setCodeEditing(false);
      setCodeSaveMessage("");
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
    setCodeDraftContent("");
    setCodeEditing(false);
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

  async function handleManagedScan() {
    if (!bridge) return;
    setFileManagerMessage("正在只读扫描...");
    try {
      const scan = await bridge.scanManagedDirectory(managedTarget);
      setManagedScan(scan);
      setOrganizationPreview(null);
      setFileManagerMessage(`扫描完成：${scan.total} 个文件，尚未移动任何内容。`);
    } catch (error) { setFileManagerMessage(error instanceof Error ? error.message : String(error)); }
  }

  async function handleOrganizationPreview(quarantine = false) {
    if (!bridge) return;
    try {
      const preview = await bridge.previewFileOrganization(managedTarget, managedMode, quarantine);
      setOrganizationPreview(preview);
      setFileManagerMessage(`已生成预览：计划移动 ${preview.moves.length} 个文件，请核对后再执行。`);
    } catch (error) { setFileManagerMessage(error instanceof Error ? error.message : String(error)); }
  }

  async function handleExecuteOrganization() {
    if (!bridge || !organizationPreview) return;
    try {
      const operation = await bridge.executeFileOrganization(organizationPreview.id);
      setOrganizationPreview(null);
      setFileOperations(await bridge.listFileOperations());
      setFileManagerMessage(`已安全移动 ${operation.moves.length} 个文件，可从操作日志一键撤销。`);
    } catch (error) { setFileManagerMessage(error instanceof Error ? error.message : String(error)); }
  }

  async function handleUndoFileOperation(operationId?: string) {
    if (!bridge) return;
    try {
      const operation = await bridge.undoFileOperation(operationId);
      setFileOperations(await bridge.listFileOperations());
      setFileManagerMessage(`已恢复 ${operation.moves.length} 个文件到原位置。`);
    } catch (error) { setFileManagerMessage(error instanceof Error ? error.message : String(error)); }
  }

  async function handleInterestActivity(type: InterestActivityType) {
    if (!bridge || !configDraft || interestRunning || interestRuntimeState.status === "working") return;
    setInterestRunning(type);
    setInterestMessage("Vivi 正在独立空间里整理灵感……");
    try {
      const saved = await bridge.saveConfig(configDraft);
      setConfigDraft(saved);
      const result = await bridge.runInterestActivity(type);
      setInterestSnapshot(result.snapshot);
      setInterestMessage(result.playtest
        ? `已完成《${result.activity.title}》并自主试玩。${result.playtest.reflection}`
        : `已完成《${result.activity.title}》，作品只保存在兴趣沙盒中。`);
    } catch (error) {
      setInterestMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setInterestRunning(null);
    }
  }

  async function handleCleanupInterest(mode: "failed_logs" | "game_content" | "all_content") {
    if (!bridge || cleaningInterest) return;
    if (mode === "all_content" && !window.confirm("确认清空私密空间中的全部日记、绘画、小游戏和活动记录？此操作不可撤销。")) return;
    if (mode === "game_content" && !window.confirm("确认清空小游戏文件夹，并同步移除小游戏及其试玩/改进记录？此操作不可撤销。")) return;
    setCleaningInterest(true);
    try {
      const result = await bridge.cleanupInterestSandbox(mode);
      setInterestSnapshot(result.snapshot);
      setInterestLogPage(1);
      setInterestMessage(mode === "failed_logs"
        ? `已清理 ${result.result.removedLogs} 条失败或终止记录，完成作品保持不变。`
        : mode === "game_content"
          ? `已清空游戏文件夹并同步移除 ${result.result.removedLogs} 条游戏记录，释放 ${(result.result.reclaimedBytes / 1024).toFixed(1)} KB。`
          : `已清空私密空间，释放 ${(result.result.reclaimedBytes / 1024 / 1024).toFixed(1)} MB。`);
    } catch (error) {
      setInterestMessage(error instanceof Error ? error.message : String(error));
      try { setInterestSnapshot(await bridge.getInterestSandbox()); } catch { }
    } finally {
      setCleaningInterest(false);
    }
  }

  async function handlePlayInterestGame(activityId: string) {
    if (!bridge || interestRunning || interestRuntimeState.status === "working") return;
    setInterestRunning("mini_game");
    setInterestMessage("正在隔离窗口里自主试玩，结束后会记录分数、截图和感想……");
    try {
      const result = await bridge.playInterestGame(activityId);
      setInterestSnapshot(result.snapshot);
      setInterestMessage(`${result.playtest.reflection}${result.playtest.repairAttempts ? ` 已自动修复并重试 ${result.playtest.repairAttempts} 次。` : ""}`);
    } catch (error) {
      setInterestMessage(error instanceof Error ? error.message : String(error));
      try { setInterestSnapshot(await bridge.getInterestSandbox()); } catch { }
    } finally {
      setInterestRunning(null);
    }
  }

  async function handleInterruptInterestActivity() {
    if (!bridge || interestRuntimeState.status !== "working") return;
    try {
      const result = await bridge.interruptInterestActivity();
      if (result.interrupted) {
        setInterestMessage(`已请求停止${result.label || "当前沙盒活动"}，正在安全收尾……`);
      }
    } catch (error) {
      setInterestMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleRefreshInterestLocation() {
    if (!bridge || !configDraft) return;
    try {
      const saved = await bridge.saveConfig(configDraft);
      setConfigDraft(saved);
      setInterestMessage("正在请求 Windows 定位并识别城市…");
      locationRequestedRef.current = false;
      setLocationRetryNonce((value) => value + 1);
    } catch (error) {
      setInterestMessage(error instanceof Error ? error.message : String(error));
    }
  }

  function changeCodeAgentMode(mode: CodeAgentMode) {
    setCodeAgentMode(mode);
    window.localStorage.setItem("vivi-code-agent-mode", mode);
  }

  async function saveActiveCodeFile() {
    if (!bridge || !activeCodePath || codeSaving || codeDraftContent === activeCodeContent) return;
    setCodeSaving(true);
    setCodeSaveMessage("");
    try {
      const result = await bridge.writeCodeFile(activeCodePath, codeDraftContent, activeCodeContent);
      setActiveCodeContent(codeDraftContent);
      setCodeEditing(false);
      setCodeSaveMessage(result.changed ? "已保存" : "没有变化");
    } catch (error) {
      setCodeSaveMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setCodeSaving(false);
    }
  }

  async function handleTestAstrBot() {
    if (!bridge || !configDraft || testingAstrBot) return;
    setTestingAstrBot(true);
    setAstrBotConnectionMessage("正在连接 AstrBot...");
    try {
      const result = await bridge.testAstrBot(configDraft.astrbot);
      setAstrBotConnectionMessage(result.message);
    } catch (error) {
      setAstrBotConnectionMessage(`AstrBot 连接失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setTestingAstrBot(false);
    }
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

  function handlePetModelLoad(modelStatus: "ready" | "error") {
    if (viewMode !== "pet" || rendererReadyReportedRef.current) return;
    rendererReadyReportedRef.current = true;
    bridge?.notifyRendererReady({ view: "pet", modelStatus });
  }

  if (viewMode === "startup") {
    return <StartupView startupStatus={startupStatus} />;
  }

  if (!ready || !configDraft || !bootstrap) {
    return <div className="loading-shell">V-Manager 正在启动...</div>;
  }

  if (viewMode === "settings") {
    return (
      <SettingsWindowRoot
        statusText={statusText}
        settingsSection={settingsSection}
        setSettingsSection={setSettingsSection}
        handleSave={handleSave}
        saving={saving}
        saveMessage={saveMessage}
        bridge={bridge}
        bootstrap={bootstrap}
        configDraft={configDraft}
        setConfigDraft={setConfigDraft}
        autoLaunchEnabled={autoLaunchEnabled}
        setAutoLaunchEnabled={setAutoLaunchEnabled}
        live2dModels={live2dModels}
        dataPathInfo={dataPathInfo}
        scanningModels={scanningModels}
        refreshLive2DModelList={refreshLive2DModelList}
        personaDraft={personaDraft}
        setPersonaDraft={setPersonaDraft}
        personaMessage={personaMessage}
        setPersonaMessage={setPersonaMessage}
        createPersonaDraft={() => personaDraftFromCard()}
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
        savingPersona={savingPersona}
        handleSavePersonaCard={handleSavePersonaCard}
        handleActivatePersonaCard={handleActivatePersonaCard}
        handleArchivePersonaCard={handleArchivePersonaCard}
        handleRestorePersonaCard={handleRestorePersonaCard}
        relationshipProfile={relationshipProfile}
        relationshipNextStage={relationshipNextStage}
        resettingRelationship={resettingRelationship}
        handleResetRelationship={handleResetRelationship}
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
        handleTestConnection={handleTestConnection}
        testingConnection={testingConnection}
        handleClearMemory={handleClearMemory}
        clearingMemory={clearingMemory}
        connectionMessage={connectionMessage}
        knowledge={knowledge}
        handleTestAstrBot={handleTestAstrBot}
        astrBotConnectionMessage={astrBotConnectionMessage}
        managedTarget={managedTarget}
        setManagedTarget={setManagedTarget}
        managedMode={managedMode}
        setManagedMode={setManagedMode}
        handleManagedScan={handleManagedScan}
        handleOrganizationPreview={handleOrganizationPreview}
        handleUndoFileOperation={handleUndoFileOperation}
        handleExecuteOrganization={handleExecuteOrganization}
        fileManagerMessage={fileManagerMessage}
        managedScan={managedScan}
        organizationPreview={organizationPreview}
        fileOperations={fileOperations}
        setFileOperations={setFileOperations}
        handleRefreshSystemSnapshot={handleRefreshSystemSnapshot}
        loadingSystemSnapshot={loadingSystemSnapshot}
        systemSnapshot={systemSnapshot}
        handleRefreshFileSnapshot={handleRefreshFileSnapshot}
        loadingFileSnapshot={loadingFileSnapshot}
        fileSnapshot={fileSnapshot}
        fileQuery={fileQuery}
        setFileQuery={setFileQuery}
        handleFileSearch={handleFileSearch}
        fileResults={fileResults}
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
        lifeState={lifeState}
        setLifeState={setLifeState}
        companionMemory={companionMemory}
        setCompanionMemory={setCompanionMemory}
        schedules={schedules}
        setSchedules={setSchedules}
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
    );
  }

  const chatLive2dStage = (
    <Suspense fallback={<div className="loading-shell">正在加载 Live2D...</div>}>
      <Live2DPreview
        mood={petMood}
        modelId={selectedLive2DModel?.id ?? "qianqian"}
        modelName={selectedLive2DModel?.label}
        modelDirectory={selectedLive2DModel?.directory}
        modelFileName={selectedLive2DModel?.fileName}
        activeExpressionSet={activeExpressionSet}
        faceParams={faceParams}
        speaking={petSpeaking}
        speechSignalRef={speechSignalRef}
        mouseFollow={configDraft.appearance?.mouseFollow !== false}
        renderFps={configDraft.appearance?.renderFps ?? 30}
        powerSaving={configDraft.appearance?.powerSaving !== false}
      />
    </Suspense>
  );

  if (viewMode === "scale") {
    return (
      <ScaleWindowView
        draftPetScale={draftPetScale}
        petScale={petScale}
        setDraftPetScale={setDraftPetScale}
        applyScale={applyScale}
        clampPetScale={clampPetScale}
      />
    );
  }

  if (viewMode === "composer") {
    return (
      <ComposerWindowView
        lastReplyMeta={lastReplyMeta}
        handleSend={handleSend}
        composerRef={composerRef}
        input={input}
        setInput={setInput}
        handleComposerKeyDown={handleComposerKeyDown}
        voiceInputMessage={voiceInputMessage}
        recordingVoiceInput={recordingVoiceInput}
        transcribingVoiceInput={transcribingVoiceInput}
        startVoiceInput={startVoiceInput}
        openChatWindow={() => bridge?.openChatWindow()}
        sending={sending}
      />
    );
  }

  if (viewMode === "chat") {
    return (
      <ChatWindowView
        lastReplyMeta={lastReplyMeta}
        sending={sending}
        statusText={statusText}
        openCodeWindow={() => bridge?.openCodeWindow()}
        openSettingsWindow={() => bridge?.openSettingsWindow()}
        personaName={configDraft.personaName}
        relationshipEmotionLabel={relationshipProfile.emotion.label}
        petMood={petMood}
        petSpeaking={petSpeaking}
        live2dStage={chatLive2dStage}
        messages={messages}
        setInput={setInput}
        focusComposer={() => composerRef.current?.focus()}
        historyListRef={historyListRef}
        messageVoiceState={messageVoiceState}
        isReplyStreaming={isReplyStreaming}
        voiceEnabled={configDraft.voice.provider === "local" || configDraft.voice.provider === "gpt_sovits" || Boolean(configDraft.voice.apiKey)}
        handleMessageVoice={handleMessageVoice}
        handleSend={handleSend}
        composerRef={composerRef}
        input={input}
        handleComposerKeyDown={handleComposerKeyDown}
        voiceInputMessage={voiceInputMessage}
        recordingVoiceInput={recordingVoiceInput}
        transcribingVoiceInput={transcribingVoiceInput}
        startVoiceInput={startVoiceInput}
      />
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
      <CodeWindowRoot
        codeWorkspaceRoot={codeWorkspace?.root ?? "正在读取工作区..."}
        codeAgentModes={codeAgentModes}
        codeAgentMode={codeAgentMode}
        changeCodeAgentMode={changeCodeAgentMode}
        lastReplyMeta={lastReplyMeta}
        sending={sending}
        refreshCodeWorkspace={refreshCodeWorkspace}
        selectCodeWorkspace={selectCodeWorkspace}
        openChatWindow={() => bridge?.openChatWindow()}
        codeFilter={codeFilter}
        setCodeFilter={setCodeFilter}
        visibleEntries={visibleEntries}
        collapsedCodeDirs={collapsedCodeDirs}
        activeCodePath={activeCodePath}
        toggleCodeDirectory={toggleCodeDirectory}
        openCodeFile={openCodeFile}
        codeSaveMessage={codeSaveMessage}
        codeFileLoading={codeFileLoading}
        codeEditing={codeEditing}
        setCodeDraftContent={setCodeDraftContent}
        setCodeEditing={setCodeEditing}
        setCodeSaveMessage={setCodeSaveMessage}
        activeCodeContent={activeCodeContent}
        codeDraftContent={codeDraftContent}
        codeSaving={codeSaving}
        saveActiveCodeFile={saveActiveCodeFile}
        codeWorkspaceError={codeWorkspaceError}
        codeLines={codeLines}
        personaName={configDraft.personaName}
        messages={messages}
        historyListRef={historyListRef}
        setInput={setInput}
        input={input}
        handleSend={handleSend}
        composerRef={composerRef}
        handleComposerKeyDown={handleComposerKeyDown}
      />
    );
  }

  function handlePetInteractionChange(interactive: boolean) {
    if (dragStateRef.current || petTouchPointerRef.current || !bridge || !configDraft || viewMode !== "pet") return;
    lastPetInteractiveRef.current = interactive;
    const hoverAutoHide = configDraft.appearance?.hoverAutoHide === true;
    setPetHoverHidden(hoverAutoHide && interactive);
    bridge.setPetMousePassthrough(hoverAutoHide || !interactive);
  }

  if (viewMode === "expressions") {
    return (
      <ExpressionsWindowView
        activeExpressionSet={activeExpressionSet}
        clearExpressions={() => bridge?.clearExpressions()}
        triggerExpression={(name) => bridge?.triggerExpression(name)}
      />
    );
  }

  const closeBubble = () => {
    clearBubbleTimers(bubbleTimersRef);
    setBubbleVisible(false);
    setBubbleFading(false);
  };

  if (viewMode === "bubble") {
    return (
      <BubbleWindowView
        bubblePlacement={bubblePlacement}
        bubbleVisible={bubbleVisible}
        bubbleCardRef={bubbleCardRef}
        bubbleFading={bubbleFading}
        personaName={configDraft.personaName}
        lastReplyMeta={lastReplyMeta}
        interestRuntimeState={interestRuntimeState}
        closeBubble={closeBubble}
        handleInterruptInterestActivity={handleInterruptInterestActivity}
        bubbleSegmentReady={bubbleSegmentReady}
        bubbleSegmentText={bubbleSegmentText}
      />
    );
  }

  const petLive2dStage = (
    <Suspense fallback={<div className="loading-shell">正在加载 Live2D...</div>}>
      <Live2DPreview
        mood={petMood}
        modelId={selectedLive2DModel?.id ?? "qianqian"}
        modelName={selectedLive2DModel?.label}
        modelDirectory={selectedLive2DModel?.directory}
        modelFileName={selectedLive2DModel?.fileName}
        activeExpressionSet={activeExpressionSet}
        faceParams={faceParams}
        speaking={petSpeaking}
        speechSignalRef={speechSignalRef}
        mouseFollow={configDraft.appearance?.mouseFollow !== false}
        renderFps={configDraft.appearance?.renderFps ?? 30}
        powerSaving={configDraft.appearance?.powerSaving !== false}
        onInteractionChange={handlePetInteractionChange}
        onLoadStateChange={handlePetModelLoad}
      />
    </Suspense>
  );

  return (
    <PetWindowView
      petHoverHidden={petHoverHidden}
      handleContextMenu={handleContextMenu}
      dragging={dragging}
      handleInteractionPointerDown={handleInteractionPointerDown}
      handleInteractionPointerMove={handleInteractionPointerMove}
      handleInteractionPointerEnd={handleInteractionPointerEnd}
      live2dStage={petLive2dStage}
    />
  );
}

export default RuntimeApp;

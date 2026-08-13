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
import { AlertCircle, CheckCircle2, Code2, LoaderCircle, Mic, RotateCcw, Send, Settings2, Sparkles, Square, Volume2 } from "lucide-react";
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

type WindowView = "startup" | "pet" | "settings" | "scale" | "composer" | "chat" | "bubble" | "expressions" | "code";
type SettingsSection = "appearance" | "persona" | "proactive" | "interests" | "intelligence" | "voice" | "abilities" | "storage";
type AsmrMode = "sleep" | "casual" | "custom";
type VoiceConnectionState = "idle" | "testing" | "success" | "error";

const codeAgentModes: Array<{ id: CodeAgentMode; label: string; hint: string }> = [
  { id: "auto", label: "自动", hint: "自动判断；写入前会先确认" },
  { id: "read", label: "问答", hint: "只读搜索与解释" },
  { id: "plan", label: "规划", hint: "分析并制定方案，不改文件" },
  { id: "agent", label: "Agent", hint: "连续编辑、检查并运行测试" },
  { id: "review", label: "审查", hint: "检查代码和 Git 变更，不改文件" }
];

const settingsSections: Array<{ id: SettingsSection; label: string; description: string }> = [
  { id: "appearance", label: "个性化", description: "主题与窗口外观" },
  { id: "persona", label: "角色与陪伴", description: "称呼、性格和表达方式" },
  { id: "proactive", label: "主动陪伴", description: "工作感知、休息和关怀频率" },
  { id: "interests", label: "Vivi的私密空间", description: "沙盒权限、活动记录与作品查看" },
  { id: "intelligence", label: "模型与记忆", description: "对话模型、知识库和上下文" },
  { id: "voice", label: "语音与 ASMR", description: "语音接口、耳语脚本和音色" },
  { id: "abilities", label: "桌面能力", description: "系统状态、文件和本地工具" },
  { id: "storage", label: "数据与隐私", description: "本地数据位置和管理" }
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

type PersonaDraft = { id: string; name: string; status: "active" | "archived"; payload: PersonaPayload };

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
  if (remainingMinutes <= 0) return `计划 ${clock} · 等待电脑空闲`;
  if (remainingMinutes < 60) return `计划 ${clock} · 还有 ${remainingMinutes} 分钟`;
  const hours = Math.floor(remainingMinutes / 60);
  const minutes = remainingMinutes % 60;
  return `计划 ${clock} · 还有 ${hours} 小时${minutes ? ` ${minutes} 分钟` : ""}`;
}

const deepSeekModelPresets = [
  { value: "deepseek-v4-flash", label: "deepseek-v4-flash", hint: "官方 V4 Flash，偏速度，适合日常对话。" },
  { value: "deepseek-v4-pro", label: "deepseek-v4-pro", hint: "官方 V4 Pro，质量更高，通常更慢也更贵。" }
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
  if (view === "startup" || view === "settings" || view === "scale" || view === "composer" || view === "chat" || view === "bubble" || view === "expressions" || view === "code") {
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
    if (!bridge) return;
    return bridge.onLocalTtsProgress((progress) => setLocalTtsProgress(progress.percent));
  }, [bridge]);

  useEffect(() => {
    if (!bridge) return;
    return bridge.onGptSovitsProgress((progress) => setGptSovitsProgress(progress.percent));
  }, [bridge]);

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
      try { source?.disconnect(); } catch {}
      try { analyser?.disconnect(); } catch {}
      if (context) void context.close().catch(() => {});
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

    bridge?.synthesizeSpeech(replyText, Boolean(configDraft?.voice.asmrEnabled))
      .then((result) => {
        if (token !== chatAutomaticVoiceTokenRef.current || viewMode !== "chat") return;
        const audio = new Audio(`data:${result.mimeType};base64,${result.audioBase64}`);
        chatAutomaticAudioRef.current = audio;
        let stopLipSync = () => {};
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
      if (viewMode === "startup") return;
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
        setPersonaDraft(personaDraftFromCard(result.activePersonaCard ?? result.personaCards?.[0]));
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
        try {
          setLifeState(await bridge.getLifeState());
        } catch { /* preview mode */ }
        try {
          setCompanionMemory(await bridge.getCompanionMemory());
        } catch { /* preview mode */ }
        try {
          setInterestSnapshot(await bridge.getInterestSandbox());
        } catch { /* preview mode */ }
        try {
          setInterestRuntimeState(await bridge.getInterestState());
        } catch { /* preview mode */ }
        try {
          setSchedules(await bridge.listSchedules());
        } catch { /* preview mode */ }
      } catch {
        setBootstrap(previewBootstrap);
        setConfigDraft(previewBootstrap.config);
        setPersonaCards([]);
      }
    }

    bootstrapAgent();
  }, [bridge, viewMode]);

  useEffect(() => {
    return () => {
      clearBubbleTimers(bubbleTimersRef);
      clearTimer(bubbleSegmentTimerRef);
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
    const offLifeState = bridge.onLifeStateUpdated(setLifeState);
    const offSchedules = bridge.onSchedulesUpdated(setSchedules);
    const offInterestState = bridge.onInterestStateUpdated(setInterestRuntimeState);

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

    const offMoodUpdated = bridge.onMoodUpdated?.((payload) => {
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
    });

    const offSpeechSignal = bridge.onSpeechSignalUpdated?.((signal) => {
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
      void bridge.getInterestSandbox().then(setInterestSnapshot).catch(() => {});
    };
    const timer = window.setInterval(refreshSchedule, 30_000);
    return () => window.clearInterval(timer);
  }, [bridge, viewMode]);

  useEffect(() => {
    if (!bridge || viewMode !== "settings" || interestRuntimeState.status !== "working") return;
    const refresh = () => { void bridge.getInterestSandbox().then(setInterestSnapshot).catch(() => {}); };
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
      voiceBridge.synthesizeSpeech(bubbleSegmentText, Boolean(configDraft?.voice.asmrEnabled))
        .then((result) => {
          if (cancelled) return;
          const audio = new Audio(`data:${result.mimeType};base64,${result.audioBase64}`);
          bubbleAudioRef.current = audio;
          let stopLipSync = () => {};
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
      const saved = await bridge.saveConfig(configDraft);
      setConfigDraft(saved);
      const status = action === "start"
        ? await bridge.startGptSovitsRuntime(saved.voice.gptSovitsBaseUrl)
        : await bridge.stopGptSovitsRuntime(saved.voice.gptSovitsBaseUrl);
      setGptSovitsRuntimeStatus(status);
      automaticVoiceBlockedUntilRef.current = 0;
      setGptSovitsMessage(action === "start"
        ? "GPT-SoVITS 已启动，可以立即试听。"
        : "GPT-SoVITS 已关闭，模型占用的内存正在释放。"
      );
    } catch (error) {
      setGptSovitsMessage(`${action === "start" ? "启动" : "关闭"}失败：${error instanceof Error ? error.message : String(error)}`);
      try { setGptSovitsRuntimeStatus(await bridge.getGptSovitsRuntimeStatus(configDraft.voice.gptSovitsBaseUrl)); } catch {}
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

  async function handleCleanupInterest(mode: "failed_logs" | "all_content") {
    if (!bridge || cleaningInterest) return;
    if (mode === "all_content" && !window.confirm("确认清空私密空间中的全部日记、绘画、小游戏和活动记录？此操作不可撤销。")) return;
    setCleaningInterest(true);
    try {
      const result = await bridge.cleanupInterestSandbox(mode);
      setInterestSnapshot(result.snapshot);
      setInterestLogPage(1);
      setInterestMessage(mode === "failed_logs"
        ? `已清理 ${result.result.removedLogs} 条失败或终止记录，完成作品保持不变。`
        : `已清空私密空间，释放 ${(result.result.reclaimedBytes / 1024 / 1024).toFixed(1)} MB。`);
    } catch (error) {
      setInterestMessage(error instanceof Error ? error.message : String(error));
      try { setInterestSnapshot(await bridge.getInterestSandbox()); } catch {}
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
      try { setInterestSnapshot(await bridge.getInterestSandbox()); } catch {}
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
    return (
      <main className="startup-shell drag-region">
        <div className="startup-glow startup-glow-one" aria-hidden="true" />
        <div className="startup-glow startup-glow-two" aria-hidden="true" />
        <section className="startup-card">
          <div className="startup-brand-row">
            <span className="startup-mark"><Sparkles size={24} /></span>
            <div>
              <p>V-MANAGER</p>
              <h1>Vivi 正在醒来</h1>
            </div>
          </div>
          <div className="startup-status-copy">
            <strong>{startupStatus.title}</strong>
            <span>{startupStatus.detail}</span>
          </div>
          <div className="startup-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={startupStatus.progress}>
            <span style={{ width: `${Math.max(4, Math.min(100, startupStatus.progress))}%` }} />
          </div>
          <div className="startup-footer-row">
            <span>{Math.round(startupStatus.progress)}%</span>
            <span>{startupStatus.phase === "voice" ? "本地语音模型可能需要几十秒" : "所有数据都保存在本机"}</span>
          </div>
          {startupStatus.warning ? <p className="startup-warning no-drag"><AlertCircle size={15} />{startupStatus.warning}</p> : null}
        </section>
      </main>
    );
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
                  setPersonaDraft(personaDraftFromCard());
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
              {personaAiSources.length ? <div className="persona-ai-sources"><span>本次参考来源：</span>{personaAiSources.map((source) => <button className="link-button" type="button" key={source.url} title={source.snippet} onClick={() => void bridge?.openExternal(source.url)}>{source.title}</button>)}</div> : null}
            </div>
            <div className="persona-list-toolbar">
              <input
                value={personaSearch}
                placeholder="搜索卡面、身份或性格…"
                onChange={(event) => setPersonaSearch(event.target.value)}
              />
              <select value={personaListFilter} onChange={(event) => setPersonaListFilter(event.target.value as typeof personaListFilter)}>
                <option value="all">全部人物卡</option>
                <option value="active">可用人物卡</option>
                <option value="archived">已归档</option>
              </select>
              <span>{visiblePersonaCards.length} / {personaCards.length}</span>
            </div>
            <div className="persona-card-picker">
              {visiblePersonaCards.map((card) => (
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
              <label>绑定 Live2D 模型<select value={personaDraft.payload.live2dModelId} disabled={personaDraft.status === "archived"} onChange={(event) => updatePersonaPayload("live2dModelId", event.target.value)}><option value="">跟随全局设置</option>{live2dModels.map((model) => <option value={model.id} key={model.id}>{model.label}</option>)}</select></label>
            </div>
            <div className="persona-card-actions">
              {personaDraft.status === "archived" ? <button className="ghost-button" type="button" onClick={() => void handleRestorePersonaCard()}>恢复人物卡</button> : <>
                <button className="primary-button" type="button" disabled={savingPersona} onClick={() => void handleSavePersonaCard()}>{savingPersona ? "保存中..." : personaDraft.id ? "保存新版本" : "创建人物卡"}</button>
                <button className="ghost-button" type="button" disabled={!personaDraft.id || personaCards.some((card) => card.id === personaDraft.id && card.isActive)} onClick={() => void handleActivatePersonaCard()}>启用这张卡</button>
                <button className="ghost-button danger" type="button" disabled={!personaDraft.id || personaCards.some((card) => card.id === personaDraft.id && card.isActive)} onClick={() => void handleArchivePersonaCard()}>归档</button>
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
                placeholder="deepseek-v4-flash"
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

          <section className="panel-block settings-panel-abilities">
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

          <section className="panel-block settings-panel-abilities">
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

          <section className="panel-block settings-panel-intelligence">
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

          <section className="panel-block voice-settings-panel settings-panel-voice">
            <div className="section-header-row voice-section-header">
              <div>
                <p className="eyebrow">语音与 ASMR</p>
                <p className="settings-section-description">默认使用免费的本地离线语音，也可切换 ElevenLabs。回复气泡会等待当前语音播放结束，再继续下一段。</p>
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

            <div className="voice-provider-selector" role="radiogroup" aria-label="语音提供方式">
              <button className={configDraft.voice.provider === "local" ? "is-active" : ""} type="button" onClick={() => setConfigDraft({ ...configDraft, voice: { ...configDraft.voice, provider: "local" } })}>
                <strong>本地离线语音</strong><span>免费 · 安装后无需联网 · 推荐日常使用</span>
              </button>
              <button className={configDraft.voice.provider === "gpt_sovits" ? "is-active" : ""} type="button" onClick={() => setConfigDraft({ ...configDraft, voice: { ...configDraft.voice, provider: "gpt_sovits" } })}>
                <strong>GPT-SoVITS 角色声线</strong><span>本机高质量推理 · 支持达妮娅模型 · 需要独立运行时</span>
              </button>
              <button className={configDraft.voice.provider === "elevenlabs" ? "is-active" : ""} type="button" onClick={() => setConfigDraft({ ...configDraft, voice: { ...configDraft.voice, provider: "elevenlabs" } })}>
                <strong>ElevenLabs API</strong><span>情感表现更强 · 消耗 API 额度</span>
              </button>
            </div>

            {configDraft.voice.provider === "local" ? <div className="local-tts-settings">
              <div className="asmr-workspace-heading">
                <div><strong>本地语音包</strong><span>Sherpa-ONNX 在本机 CPU 推理；语音文本不会发送到外部服务。</span></div>
                <span className={`local-stt-status ${localTtsPacks.find((pack) => pack.id === configDraft.voice.localPackId)?.installed ? "is-ready" : ""}`}>
                  {localTtsPacks.find((pack) => pack.id === configDraft.voice.localPackId)?.installed ? "已安装" : "未安装"}
                </span>
              </div>
              <div className="voice-config-grid">
                <label>语音包<select value={configDraft.voice.localPackId} onChange={(event) => setConfigDraft({ ...configDraft, voice: { ...configDraft.voice, localPackId: event.target.value, localSpeakerId: 0 } })}>
                  {localTtsPacks.length ? localTtsPacks.map((pack) => <option value={pack.id} key={pack.id}>{pack.name} · 约 {pack.modelSizeMB} MB</option>) : <><option value="sherpa-zh-ll">中文多音色 · Zh-LL</option><option value="sherpa-melo-zh-en">中英双语 · MeloTTS</option></>}
                </select></label>
                <label>人物音色<select value={configDraft.voice.localSpeakerId} onChange={(event) => setConfigDraft({ ...configDraft, voice: { ...configDraft.voice, localSpeakerId: Number(event.target.value) } })}>
                  {(localTtsPacks.find((pack) => pack.id === configDraft.voice.localPackId)?.speakers ?? [{ id: 0, name: "默认音色" }]).map((speaker) => <option value={speaker.id} key={speaker.id}>{speaker.name}</option>)}
                </select></label>
                <label className="voice-speed-control"><span>本地语速 <strong>{configDraft.voice.localSpeed.toFixed(2)}x</strong></span><input type="range" min="0.7" max="1.3" step="0.05" value={configDraft.voice.localSpeed} onChange={(event) => setConfigDraft({ ...configDraft, voice: { ...configDraft.voice, localSpeed: Number(event.target.value) } })} /></label>
                <label className="voice-speed-control"><span>句间停顿 <strong>{Math.round(configDraft.voice.localSilenceScale * 100)}%</strong></span><input type="range" min="0" max="1" step="0.05" value={configDraft.voice.localSilenceScale} onChange={(event) => setConfigDraft({ ...configDraft, voice: { ...configDraft.voice, localSilenceScale: Number(event.target.value) } })} /></label>
              </div>
              <div className="asmr-actions">
                <button className="primary-button" type="button" disabled={installingLocalTts || localTtsPacks.find((pack) => pack.id === configDraft.voice.localPackId)?.installed} onClick={() => void handleInstallLocalTtsPack()}>
                  {installingLocalTts ? `下载语音包 ${localTtsProgress}%` : localTtsPacks.find((pack) => pack.id === configDraft.voice.localPackId)?.installed ? "语音包已安装" : "下载安装语音包"}
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
                  const profile = gptSovitsProfiles.find((item) => item.id === event.target.value);
                  setConfigDraft({ ...configDraft, voice: { ...configDraft.voice, gptSovitsProfileId: event.target.value, gptSovitsSpeed: profile?.recommendedSpeed ?? configDraft.voice.gptSovitsSpeed } });
                }}>
                  {gptSovitsProfiles.length ? gptSovitsProfiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.name} · {profile.version}</option>) : <option value="dania-v2-pro-plus">达妮娅 · v2ProPlus</option>}
                </select></label>
                <label>本机 API 地址<input value={configDraft.voice.gptSovitsBaseUrl} onChange={(event) => setConfigDraft({ ...configDraft, voice: { ...configDraft.voice, gptSovitsBaseUrl: event.target.value } })} placeholder="http://127.0.0.1:9880" /></label>
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
              <div className="asmr-actions">
                <button className="primary-button" type="button" disabled={installingGptSovits || gptSovitsProfiles.find((profile) => profile.id === configDraft.voice.gptSovitsProfileId)?.installed || gptSovitsProfiles.find((profile) => profile.id === configDraft.voice.gptSovitsProfileId)?.downloadable === false} onClick={() => void handleInstallGptSovitsProfile()}>
                  {installingGptSovits ? `下载角色声线 ${gptSovitsProgress}%` : gptSovitsProfiles.find((profile) => profile.id === configDraft.voice.gptSovitsProfileId)?.installed ? "角色声线已安装" : `下载${gptSovitsProfiles.find((profile) => profile.id === configDraft.voice.gptSovitsProfileId)?.name || "角色声线"}`}
                </button>
                <button className="ghost-button compact" type="button" onClick={() => void bridge?.openLocalTtsFolder()}>打开声线目录</button>
                <button className="ghost-button compact" type="button" disabled={!gptSovitsProfiles.find((profile) => profile.id === configDraft.voice.gptSovitsProfileId)?.sourceUrl} onClick={() => {
                  const sourceUrl = gptSovitsProfiles.find((profile) => profile.id === configDraft.voice.gptSovitsProfileId)?.sourceUrl;
                  if (sourceUrl) void bridge?.openExternal(sourceUrl);
                }}>打开模型网页</button>
                <button className="ghost-button compact" type="button" onClick={() => setShowGptSovitsImport((value) => !value)}>{showGptSovitsImport ? "收起导入" : "导入本地声线"}</button>
              </div>
              {gptSovitsProfiles.find((profile) => profile.id === configDraft.voice.gptSovitsProfileId) ? <div className="power-safety-note">
                <strong>{gptSovitsProfiles.find((profile) => profile.id === configDraft.voice.gptSovitsProfileId)!.author}</strong>
                <span>{gptSovitsProfiles.find((profile) => profile.id === configDraft.voice.gptSovitsProfileId)!.description}</span>
                <small>{gptSovitsProfiles.find((profile) => profile.id === configDraft.voice.gptSovitsProfileId)!.license}</small>
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

          <section className="panel-block proactive-settings-panel settings-panel-proactive">
            <p className="eyebrow">主动陪伴</p>
            <p className="settings-section-description">
              Vivi 只依据本地时间和 Windows 空闲状态判断是否适合提醒；不会读取键入内容或后台截图。
            </p>

            <div className="proactive-status-card">
              <div>
                <span>主人状态</span>
                <strong>{lifeState?.ownerStatus === "away" ? "暂时离开" : "正在使用电脑"}</strong>
              </div>
              <div>
                <span>连续工作</span>
                <strong>{Math.round(lifeState?.activeMinutes ?? 0)} 分钟</strong>
              </div>
              <div>
                <span>Vivi 精力</span>
                <strong>{Math.round(lifeState?.energy ?? 100)}%</strong>
              </div>
              <div>
                <span>上次主动问候</span>
                <strong>{lifeState?.lastProactiveAt ? new Date(lifeState.lastProactiveAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }) : "今天还没有"}</strong>
              </div>
            </div>

            <details className="settings-fold companion-memory-summary">
              <summary>
                <span>长期陪伴记忆</span>
                <small>事实 {companionMemory?.facts.length ?? 0} · 经历 {companionMemory?.episodes.length ?? 0} · 习惯 {companionMemory?.habits.length ?? 0} · 待跟进 {companionMemory?.commitments.filter((item) => item.status === "open").length ?? 0}</small>
              </summary>
              <div className="section-header-row">
                <div>
                  <strong>深层陪伴记忆</strong>
                  <span>事实、经历、习惯与承诺均保存在本机；未完成承诺可触发自然回访。</span>
                </div>
                <button className="ghost-button compact" type="button" disabled={!bridge} onClick={async () => setCompanionMemory(await bridge!.getCompanionMemory())}>刷新</button>
              </div>
              <div className="stats-grid">
                <article className="stat-card"><span>事实</span><strong>{companionMemory?.facts.length ?? 0}</strong></article>
                <article className="stat-card"><span>近期经历</span><strong>{companionMemory?.episodes.length ?? 0}</strong></article>
                <article className="stat-card"><span>习惯</span><strong>{companionMemory?.habits.length ?? 0}</strong></article>
                <article className="stat-card"><span>未完成承诺</span><strong>{companionMemory?.commitments.filter((item) => item.status === "open").length ?? 0}</strong></article>
              </div>
              <div className="memory-category-list">
                {([
                  ["事实", companionMemory?.facts],
                  ["近期经历", companionMemory?.episodes],
                  ["习惯", companionMemory?.habits],
                  ["未完成承诺", companionMemory?.commitments.filter((item) => item.status === "open")]
                ] as const).map(([label, items]) => (
                  <details key={label}>
                    <summary>{label}<span>{items?.length ?? 0}</span></summary>
                    {items?.length ? <ul>{items.slice(-8).reverse().map((item) => <li key={item.id}>{item.content}</li>)}</ul> : <p>暂无记录</p>}
                  </details>
                ))}
              </div>
              <p className="knowledge-hint">
                当前打扰评分：{Math.round((companionMemory?.feedback.interruptionScore ?? 0.1) * 100)}% ·
                忽略 {companionMemory?.feedback.ignored ?? 0} / 稍后 {companionMemory?.feedback.later ?? 0} / 喜欢 {companionMemory?.feedback.liked ?? 0}
              </p>
            </details>

            <div className="relationship-switches proactive-switches">
              <label className="voice-switch">
                <input
                  type="checkbox"
                  checked={configDraft.proactive.enabled}
                  onChange={(event) => setConfigDraft({
                    ...configDraft,
                    proactive: { ...configDraft.proactive, enabled: event.target.checked }
                  })}
                />
                启用主动陪伴
              </label>
              <label className="voice-switch">
                <input
                  type="checkbox"
                  checked={configDraft.proactive.healthReminders}
                  onChange={(event) => setConfigDraft({
                    ...configDraft,
                    proactive: { ...configDraft.proactive, healthReminders: event.target.checked }
                  })}
                />
                工作与健康提醒
              </label>
              <label className="voice-switch">
                <input
                  type="checkbox"
                  checked={configDraft.proactive.socialCheckins}
                  onChange={(event) => setConfigDraft({
                    ...configDraft,
                    proactive: { ...configDraft.proactive, socialCheckins: event.target.checked }
                  })}
                />
                拟人化主动问候
              </label>
              <label className="voice-switch">
                <input
                  type="checkbox"
                  checked={configDraft.proactive.lateNightCare}
                  onChange={(event) => setConfigDraft({
                    ...configDraft,
                    proactive: { ...configDraft.proactive, lateNightCare: event.target.checked }
                  })}
                />
                深夜收尾关怀
              </label>
              <label className="voice-switch">
                <input
                  type="checkbox"
                  checked={configDraft.proactive.systemNotifications}
                  onChange={(event) => setConfigDraft({
                    ...configDraft,
                    proactive: { ...configDraft.proactive, systemNotifications: event.target.checked }
                  })}
                />
                同时显示 Windows 通知
              </label>
            </div>

            <details className="settings-fold">
              <summary><span>频率与时间设置</span><small>提醒间隔、休息时间和安静时段</small></summary>
              <div className="inline-grid proactive-number-grid">
              <label>
                连续工作多久后提醒
                <select
                  value={configDraft.proactive.workMinutes}
                  onChange={(event) => setConfigDraft({ ...configDraft, proactive: { ...configDraft.proactive, workMinutes: Number(event.target.value) } })}
                >
                  <option value={30}>30 分钟</option>
                  <option value={45}>45 分钟</option>
                  <option value={60}>60 分钟</option>
                  <option value={90}>90 分钟</option>
                  <option value={120}>120 分钟</option>
                </select>
              </label>
              <label>
                两次提醒至少间隔
                <select
                  value={configDraft.proactive.reminderCooldownMinutes}
                  onChange={(event) => setConfigDraft({ ...configDraft, proactive: { ...configDraft.proactive, reminderCooldownMinutes: Number(event.target.value) } })}
                >
                  <option value={30}>30 分钟</option>
                  <option value={60}>60 分钟</option>
                  <option value={90}>90 分钟</option>
                  <option value={120}>120 分钟</option>
                  <option value={180}>180 分钟</option>
                </select>
              </label>
              <label>
                主动问候最短间隔
                <select
                  value={configDraft.proactive.minimumIntervalMinutes}
                  onChange={(event) => setConfigDraft({ ...configDraft, proactive: { ...configDraft.proactive, minimumIntervalMinutes: Number(event.target.value) } })}
                >
                  <option value={30}>30 分钟</option>
                  <option value={60}>1 小时</option>
                  <option value={90}>1.5 小时</option>
                  <option value={120}>2 小时</option>
                  <option value={180}>3 小时</option>
                  <option value={240}>4 小时</option>
                </select>
              </label>
              <label>
                离开多久重置工作时长
                <select
                  value={configDraft.proactive.idleResetMinutes}
                  onChange={(event) => setConfigDraft({ ...configDraft, proactive: { ...configDraft.proactive, idleResetMinutes: Number(event.target.value) } })}
                >
                  <option value={5}>5 分钟</option>
                  <option value={10}>10 分钟</option>
                  <option value={15}>15 分钟</option>
                  <option value={30}>30 分钟</option>
                </select>
              </label>
              <label>
                Vivi 工作多久后休息
                <select
                  value={configDraft.proactive.viviRestAfterMinutes}
                  onChange={(event) => setConfigDraft({ ...configDraft, proactive: { ...configDraft.proactive, viviRestAfterMinutes: Number(event.target.value) } })}
                >
                  <option value={60}>60 分钟</option>
                  <option value={90}>90 分钟</option>
                  <option value={120}>120 分钟</option>
                  <option value={180}>180 分钟</option>
                </select>
              </label>
              <label>
                深夜关怀开始时间
                <select
                  value={configDraft.proactive.lateNightHour}
                  onChange={(event) => setConfigDraft({ ...configDraft, proactive: { ...configDraft.proactive, lateNightHour: Number(event.target.value) } })}
                >
                  <option value={22}>22:00</option>
                  <option value={23}>23:00</option>
                </select>
              </label>
              <label>
                安静时段开始
                <input type="time" value={configDraft.proactive.quietStart} onChange={(event) => setConfigDraft({ ...configDraft, proactive: { ...configDraft.proactive, quietStart: event.target.value } })} />
              </label>
              <label>
                安静时段结束
                <input type="time" value={configDraft.proactive.quietEnd} onChange={(event) => setConfigDraft({ ...configDraft, proactive: { ...configDraft.proactive, quietEnd: event.target.value } })} />
              </label>
              </div>
            </details>

            <div className="relationship-actions proactive-actions">
              <span>{lifeState?.pausedUntil && new Date(lifeState.pausedUntil) > new Date() ? "今天已暂停主动提醒" : "状态每 30 秒在本地更新"}</span>
              <div>
                <button className="ghost-button compact" type="button" onClick={async () => setLifeState(await bridge!.pauseProactiveToday())} disabled={!bridge}>
                  今天不要再提醒
                </button>
                <button className="ghost-button compact" type="button" onClick={async () => setLifeState(await bridge!.resetWorkSession())} disabled={!bridge}>
                  我已经休息过了
                </button>
              </div>
            </div>

            <details className="settings-fold schedule-manager">
              <summary><span>本地日程与电源计划</span><small>{schedules.length} 项计划</small></summary>
              <div className="section-header-row">
                <div>
                  <p className="eyebrow">本地日程与电源计划</p>
                  <span>可以说：“8 月 20 日下午 3 点提醒我复诊”或“今晚 12 点关机”。</span>
                </div>
                <button className="ghost-button compact" type="button" onClick={async () => setSchedules(await bridge!.listSchedules())} disabled={!bridge}>
                  刷新
                </button>
              </div>
              <div className="power-safety-note">
                定时关机和重启创建后不会立即生效，必须再单独发送“确认定时关机”或“确认定时重启”。执行前还有约 60 秒取消时间，请先保存文档。
              </div>
              <div className="schedule-integration-summary">
                <div>
                  <span>Windows 后台托管</span>
                  <strong>已启用</strong>
                  <small>完全退出后由任务计划程序唤醒提醒</small>
                </div>
                <div>
                  <span>本地日程表</span>
                  <strong>长期保存</strong>
                  <small>启动时自动检查今日事项，退出和重启不会丢失</small>
                </div>
              </div>
              <div className="schedule-list">
                {schedules.length ? schedules.map((item) => (
                  <div className={`schedule-card is-${item.type}`} key={item.id}>
                    <div>
                      <strong>{item.title}</strong>
                      <span>{new Date(item.dueAt).toLocaleString("zh-CN", { hour12: false })}</span>
                      {item.message ? <small>{item.message}</small> : null}
                      <small>
                        Windows：{item.integration?.windows?.status === "registered" ? "已托管" : item.status === "pending_confirmation" ? "确认后注册" : item.integration?.windows?.status || "等待同步"}
                      </small>
                    </div>
                    <div className="schedule-card-actions">
                      <span>{item.status === "pending_confirmation" ? "等待确认" : item.status === "executing" ? "60 秒倒计时" : "已计划"}</span>
                      <button
                        className="ghost-button compact"
                        type="button"
                        onClick={async () => {
                          await bridge!.cancelSchedule(item.id);
                          setSchedules(await bridge!.listSchedules());
                        }}
                        disabled={!bridge}
                      >
                        取消
                      </button>
                    </div>
                  </div>
                )) : <p className="schedule-empty">本地日程表中目前没有等待执行的事项。</p>}
              </div>
            </details>
          </section>
          <section className="panel-block interest-sandbox-panel settings-panel-interests">
            <div className="section-header-row">
              <div>
                <p className="eyebrow">Vivi的私密空间</p>
                <span>日记、绘画和小游戏只会写入独立目录；默认关闭，不接触你的普通文件。</span>
              </div>
              <button className="ghost-button compact" type="button" disabled={!bridge} onClick={() => void bridge?.openInterestSandbox()}>
                打开私密空间
              </button>
            </div>

            <div className="power-safety-note">
              {configDraft.interests.permissionLevel === "autonomous"
                ? "自主生活模式会按下方时间窗生成每日虚拟生活日程；到达日程且电脑空闲后开始活动，不要求主人先完成任务。仍只写入 vivi-sandbox，其他本地文件、外链和系统操作继续受限。"
                : "普通创作只会在主人交代的任务完成、没有其他任务运行且电脑达到设定空闲时间后开始。每日日记会在设定时间之后、电脑空闲时写入。"}
            </div>

            <div className="schedule-integration-summary">
              <div>
                <span>当前创作状态</span>
                <strong>{interestRuntimeState.status === "working" ? "创作中" : "空闲"}</strong>
                <small>{interestRuntimeState.status === "working" ? interestRuntimeState.label : interestSnapshot?.session.pendingActivity ? `待续作：${interestSnapshot.session.pendingActivity === "diary" ? "今日日记" : interestSnapshot.session.pendingActivity === "drawing" ? "绘画" : "离线小游戏"}` : interestRuntimeState.label}</small>
              </div>
              <div>
                <span>今日单篇日记</span>
                <strong>{interestSnapshot?.today.diaryWritten ? "已写入" : "等待写入"}</strong>
                <small>{todayDiaryActivity
                  ? `完成于 ${new Date(todayDiaryActivity.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}`
                  : formatDiarySchedule(interestSnapshot?.session.diaryDueAt, interestScheduleClock)}</small>
              </div>
              <div>
                <span>下一项生活日程</span>
                <strong>{nextInterestRoutine ? interestActivityLabel(nextInterestRoutine.type) : interestSnapshot?.routine?.length ? "今日计划已完成" : configDraft.interests.virtualScheduleEnabled ? "暂无可排活动" : "虚拟日程未启用"}</strong>
                <small>{nextInterestRoutine
                  ? `${new Date(nextInterestRoutine.dueAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })} · ${nextInterestRoutine.status === "due" ? "等待电脑空闲" : "尚未到时间"}`
                  : interestSnapshot?.routine?.length ? `已完成 ${completedInterestRoutineCount} / ${interestSnapshot.routine.length} 项` : "开启自主生活和虚拟日程后生成"}</small>
              </div>
            </div>

            {interestRuntimeState.status === "working" && interestRuntimeState.logs?.length ? (
              <div className="interest-live-log">
                <div><strong>实时活动日志</strong><span>{interestRuntimeState.progress?.actions != null ? `${interestRuntimeState.progress.actions} 次操作` : interestRuntimeState.phase}</span></div>
                {interestRuntimeState.logs.slice(-6).map((entry, index) => (
                  <p key={`${entry.at}-${index}`}><time>{new Date(entry.at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}</time><span>{entry.label}</span>{entry.highestScore != null ? <em>{entry.highestScore} 分</em> : null}</p>
                ))}
              </div>
            ) : null}

            {interestSnapshot?.routine?.length ? (
              <div className="interest-routine-panel">
                <div className="interest-routine-heading">
                  <strong>今日虚拟生活日程</strong>
                  <small>每 5 分钟检查一次；需到达计划时间、电脑空闲、未超出 Token/任务/磁盘上限，且没有其他任务运行。</small>
                </div>
                <div className="interest-routine-list">
                  {interestSnapshot.routine.map((item) => (
                    <div className={`interest-routine-item is-${item.status}`} key={item.id}>
                      <time>{new Date(item.dueAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}</time>
                      <div>
                        <strong>{item.title || interestActivityLabel(item.type)}</strong>
                        <small>{item.title ? interestActivityLabel(item.type) : `${interestCategoryLabel(item.category)} · ${item.status === "due" ? "已到时间，等待触发" : item.status === "missed" ? "时间已过，本次跳过" : "计划活动"}`}</small>
                      </div>
                      <span>{item.status === "completed" ? "已完成" : item.status === "due" ? "等待空闲" : item.status === "missed" ? "已错过" : "未到时间"}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="relationship-switches proactive-switches">
              <label className="voice-switch">
                <input type="checkbox" checked={configDraft.interests.enabled} onChange={(event) => setConfigDraft({ ...configDraft, interests: { ...configDraft.interests, enabled: event.target.checked } })} />
                启用私密空间（允许手动创作）
              </label>
              <label className="voice-switch">
                <input type="checkbox" checked={configDraft.interests.autonomousLifeEnabled} onChange={(event) => setConfigDraft({ ...configDraft, interests: { ...configDraft.interests, autonomousLifeEnabled: event.target.checked } })} />
                启用完整自主生活模块
              </label>
              <span className="switch-group-divider">创作与试玩</span>
              <label className="voice-switch">
                <input type="checkbox" checked={configDraft.interests.activities.diary} onChange={(event) => setConfigDraft({ ...configDraft, interests: { ...configDraft.interests, activities: { ...configDraft.interests.activities, diary: event.target.checked } } })} />
                写每日日记
              </label>
              <label className="voice-switch">
                <input type="checkbox" disabled={configDraft.interests.permissionLevel === "diary_only" || configDraft.interests.permissionLevel === "off"} checked={configDraft.interests.activities.drawing} onChange={(event) => setConfigDraft({ ...configDraft, interests: { ...configDraft.interests, activities: { ...configDraft.interests.activities, drawing: event.target.checked } } })} />
                创作 SVG 绘画
              </label>
              <label className="voice-switch">
                <input type="checkbox" disabled={configDraft.interests.permissionLevel === "diary_only" || configDraft.interests.permissionLevel === "off"} checked={configDraft.interests.activities.miniGames} onChange={(event) => setConfigDraft({ ...configDraft, interests: { ...configDraft.interests, activities: { ...configDraft.interests.activities, miniGames: event.target.checked } } })} />
                创建离线小游戏
              </label>
              <label className="voice-switch">
                <input type="checkbox" disabled={!configDraft.interests.activities.miniGames} checked={configDraft.interests.selfPlayGames} onChange={(event) => setConfigDraft({ ...configDraft, interests: { ...configDraft.interests, selfPlayGames: event.target.checked } })} />
                游戏完成后自主试玩并记录
              </label>
              <label className="voice-switch">
                <input type="checkbox" disabled={configDraft.interests.permissionLevel !== "autonomous"} checked={configDraft.interests.virtualScheduleEnabled} onChange={(event) => setConfigDraft({ ...configDraft, interests: { ...configDraft.interests, virtualScheduleEnabled: event.target.checked } })} />
                启用人物虚拟生活日程
              </label>
            </div>

            <details className="settings-fold">
              <summary><span>权限、预算与时间</span><small>高级设置，通常无需频繁调整</small></summary>
              <div className="inline-grid proactive-number-grid">
              <label>
                权限等级
                <select value={configDraft.interests.permissionLevel} onChange={(event) => {
                  const permissionLevel = event.target.value as AgentConfig["interests"]["permissionLevel"];
                  setConfigDraft({ ...configDraft, interests: {
                    ...configDraft.interests,
                    permissionLevel,
                    dailyTokenBudget: permissionLevel === "autonomous" ? 2_000_000 : configDraft.interests.dailyTokenBudget,
                    minimumHoursBetweenTasks: permissionLevel === "autonomous" ? Math.min(1, configDraft.interests.minimumHoursBetweenTasks) : configDraft.interests.minimumHoursBetweenTasks
                  } });
                }}>
                  <option value="off">关闭：不允许任何活动</option>
                  <option value="diary_only">日记：仅写本地日记</option>
                  <option value="create">创作：允许生成作品但不自动打开</option>
                  <option value="preview">预览：创作后可自动打开作品</option>
                  <option value="autonomous">自主生活：按日程在沙盒内自由运转</option>
                </select>
              </label>
              <label>
                外部信息权限
                <select value={configDraft.interests.networkAccess} onChange={(event) => setConfigDraft({ ...configDraft, interests: { ...configDraft.interests, networkAccess: event.target.value as AgentConfig["interests"]["networkAccess"] } })}>
                  <option value="off">关闭：仅使用本地记录</option>
                  <option value="weather">只读天气</option>
                  <option value="weather_news">只读天气 + 内置领域资讯</option>
                </select>
              </label>
              <label>每日创作任务上限<input type="number" min={1} max={48} value={configDraft.interests.dailyTaskLimit} onChange={(event) => setConfigDraft({ ...configDraft, interests: { ...configDraft.interests, dailyTaskLimit: Number(event.target.value) } })} /></label>
              <label>自主生活每日 Token 总预算<input type="number" min={500} max={2000000} step={500} value={configDraft.interests.dailyTokenBudget} onChange={(event) => setConfigDraft({ ...configDraft, interests: { ...configDraft.interests, dailyTokenBudget: Number(event.target.value) } })} /></label>
              <label>每日生活日程项数<input type="number" min={3} max={24} value={configDraft.interests.autonomousRoutineLimit} onChange={(event) => setConfigDraft({ ...configDraft, interests: { ...configDraft.interests, autonomousRoutineLimit: Number(event.target.value) } })} /></label>
              <label>每日娱乐上限<input type="number" min={0} max={12} value={configDraft.interests.entertainmentDailyLimit} onChange={(event) => setConfigDraft({ ...configDraft, interests: { ...configDraft.interests, entertainmentDailyLimit: Number(event.target.value) } })} /></label>
              <label>单次最长时间（分钟）<input type="number" min={1} max={60} value={configDraft.interests.maxTaskMinutes} onChange={(event) => setConfigDraft({ ...configDraft, interests: { ...configDraft.interests, maxTaskMinutes: Number(event.target.value) } })} /></label>
              <label>磁盘上限（MB）<input type="number" min={10} max={2048} value={configDraft.interests.maxDiskMB} onChange={(event) => setConfigDraft({ ...configDraft, interests: { ...configDraft.interests, maxDiskMB: Number(event.target.value) } })} /></label>
              <label>电脑空闲多久后可活动（分钟）<input type="number" min={5} max={240} value={configDraft.interests.idleMinutes} onChange={(event) => setConfigDraft({ ...configDraft, interests: { ...configDraft.interests, idleMinutes: Number(event.target.value) } })} /></label>
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

            <label className="voice-switch">
              <input type="checkbox" disabled={configDraft.interests.permissionLevel !== "preview"} checked={configDraft.interests.autoOpenPreview} onChange={(event) => setConfigDraft({ ...configDraft, interests: { ...configDraft.interests, autoOpenPreview: event.target.checked } })} />
              完成后自动打开作品（仅“预览”权限可用）
            </label>
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
                <select value={interestLogStatus} onChange={(event) => { setInterestLogStatus(event.target.value as typeof interestLogStatus); setInterestLogPage(1); }}>
                  <option value="all">全部状态</option><option value="completed">仅完成</option><option value="failed">失败 / 终止</option>
                </select>
                <select value={interestLogPersona} onChange={(event) => { setInterestLogPersona(event.target.value); setInterestLogPage(1); }}>
                  <option value="all">全部人物卡</option>{interestPersonaOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </div>
              {pagedInterestActivities.length ? <table className="interest-log-table">
                <thead><tr><th>作品</th><th>类型 / 状态</th><th>人物卡</th><th>时间</th><th>操作</th></tr></thead>
                <tbody>{pagedInterestActivities.map((activity) => (
                  <tr key={activity.id} className={activity.status !== "completed" ? "is-failed" : ""}>
                    <td><strong>{activity.title}</strong><small title={activity.summary}>{activity.summary}</small>{activity.playtest ? <em title={`${activity.playtest.reflection}${activity.playtest.timeline?.length ? `\n${activity.playtest.timeline.map((entry) => entry.label).join(" → ")}` : ""}`}>自主试玩 · {activity.playtest.outcome === "cancelled" ? "已中止" : activity.playtest.outcome === "won" ? "胜利" : activity.playtest.outcome === "lost" ? "结束" : activity.playtest.ok ? "已运行" : "失败"}{activity.playtest.highestScore != null ? ` · ${activity.playtest.highestScore} 分` : ""}</em> : activity.relatedActivityIds?.length && ["diary", "drawing"].includes(activity.type) ? <em>已关联当天的{activity.type === "diary" ? "画作" : "日记"}</em> : null}</td>
                    <td><span>{interestActivityLabel(activity.type)}</span><small>{interestCategoryLabel(activity.category)} · {activity.status === "completed" ? activity.action === "updated" ? "已更新" : "已完成" : activity.status === "cancelled" ? "已终止" : "失败"}</small></td>
                    <td><span>{activity.personaName || "旧记录"}</span><small>{activity.personaVersion ? `v${activity.personaVersion}` : "未标注"}</small></td>
                    <td>{new Date(activity.createdAt).toLocaleString("zh-CN", { hour12: false })}</td>
                    <td><div className="interest-row-actions"><button className="ghost-button compact" type="button" disabled={!activity.artifactPath} onClick={() => void bridge?.openInterestArtifact(activity.artifactPath)}>查看</button>{activity.type === "mini_game" && activity.status === "completed" ? <button className="ghost-button compact" type="button" disabled={Boolean(interestRunning) || interestRuntimeState.status === "working"} onClick={() => void handlePlayInterestGame(activity.id)}>试玩</button> : null}{activity.playtest?.screenshotPath ? <button className="ghost-button compact" type="button" onClick={() => void bridge?.openInterestArtifact(activity.playtest!.screenshotPath)}>截图</button> : null}</div></td>
                  </tr>
                ))}</tbody>
              </table> : <p className="knowledge-hint">当前筛选条件下没有活动记录。</p>}
              <div className="interest-log-pagination">
                <button className="ghost-button compact" type="button" disabled={safeInterestLogPage <= 1} onClick={() => setInterestLogPage((page) => Math.max(1, page - 1))}>上一页</button>
                <span>第 {safeInterestLogPage} / {interestLogPageCount} 页</span>
                <button className="ghost-button compact" type="button" disabled={safeInterestLogPage >= interestLogPageCount} onClick={() => setInterestLogPage((page) => Math.min(interestLogPageCount, page + 1))}>下一页</button>
              </div>
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
        <header className="chat-companion-topbar drag-region">
          <div className="chat-companion-brand">
            <span className="chat-brand-mark"><Sparkles size={17} /></span>
            <div>
              <strong>Vivi Companion</strong>
              <span>你的桌面搭档</span>
            </div>
          </div>
          <div className="chat-topbar-actions no-drag">
            <span className={`runtime-badge ${lastReplyMeta?.responseMode ?? "fallback_local"}`}>
              <i />{sending ? "正在回应" : lastReplyMeta?.sourceLabel ?? statusText}
            </span>
            <button type="button" title="代码工作台" aria-label="打开代码工作台" onClick={() => void bridge?.openCodeWindow()}><Code2 size={17} /></button>
            <button type="button" title="设置" aria-label="打开设置" onClick={() => void bridge?.openSettingsWindow()}><Settings2 size={17} /></button>
          </div>
        </header>

        <main className="chat-companion-layout">
          <aside className="companion-stage-card">
            <div className="stage-ambient stage-ambient-one" aria-hidden="true" />
            <div className="stage-ambient stage-ambient-two" aria-hidden="true" />
            <div className="stage-stars" aria-hidden="true"><span>✦</span><span>·</span><span>✧</span><span>·</span></div>
            <div className="companion-stage-heading">
              <span className="companion-online-dot" />
              <div>
                <strong>{configDraft.personaName}</strong>
                <span>{relationshipProfile.emotion.label} · {petMood === "thinking" ? "正在思考" : petSpeaking ? "正在说话" : "陪伴中"}</span>
              </div>
            </div>
            <div className="chat-live2d-stage no-drag">
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
            </div>
          </aside>

          <section className="chat-window-panel">
            <div className="chat-conversation-heading">
              <div>
                <p className="eyebrow">COMPANION CHAT</p>
                <h1>今天想一起做什么？</h1>
              </div>
              <span>{messages.length} 条消息</span>
            </div>

            <div className="chat-quick-prompts" aria-label="快捷提问">
              {["陪我聊聊今天", "整理一下待办", "看看电脑状态"].map((prompt) => (
                <button key={prompt} type="button" onClick={() => { setInput(prompt); window.setTimeout(() => composerRef.current?.focus(), 0); }}>
                  {prompt}
                </button>
              ))}
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
                      disabled={!(configDraft.voice.provider === "local" || configDraft.voice.provider === "gpt_sovits" || configDraft.voice.apiKey) || !message.content.trim() || replyStillStreaming}
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
              placeholder={`和 ${configDraft.personaName} 说点什么...`}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              rows={4}
            />
            {voiceInputMessage ? <p className="voice-input-feedback">{voiceInputMessage}</p> : null}
              <div className="chat-composer-footer">
                <span>Enter 发送 · Shift + Enter 换行</span>
                <div className="chat-composer-actions">
              <button
                className={`voice-input-button ${recordingVoiceInput ? "is-recording" : ""}`}
                type="button"
                title={recordingVoiceInput ? "停止录音" : "语音输入"}
                aria-label={recordingVoiceInput ? "停止录音" : "语音输入"}
                disabled={transcribingVoiceInput}
                onClick={() => void startVoiceInput()}
              >
                {transcribingVoiceInput ? <LoaderCircle size={17} /> : recordingVoiceInput ? <Square size={15} /> : <Mic size={18} />}
                    <span>{transcribingVoiceInput ? "识别中" : recordingVoiceInput ? "停止" : "语音"}</span>
              </button>
                  <button className="chat-send-button" type="submit" disabled={sending || !input.trim()}>
                    <Send size={16} />{sending ? "思考中" : "发送"}
              </button>
                </div>
            </div>
          </form>
          </section>
        </main>
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
            <label className="code-mode-picker" title={codeAgentModes.find((mode) => mode.id === codeAgentMode)?.hint}>
              <span>工作模式</span>
              <select value={codeAgentMode} onChange={(event) => changeCodeAgentMode(event.target.value as CodeAgentMode)}>
                {codeAgentModes.map((mode) => <option value={mode.id} key={mode.id}>{mode.label}</option>)}
              </select>
            </label>
            <span className={`runtime-badge ${lastReplyMeta?.responseMode ?? "fallback_local"}`} title="最近一次运行状态，不是按钮">
              {sending ? "状态：Vivi 正在处理" : `状态：${lastReplyMeta?.sourceLabel ?? "代码会话就绪"}`}
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
              <div className="code-editor-actions">
                {codeSaveMessage ? <small>{codeSaveMessage}</small> : null}
                {activeCodePath && !codeFileLoading ? (
                  codeEditing ? (
                    <>
                      <button type="button" onClick={() => { setCodeDraftContent(activeCodeContent); setCodeEditing(false); setCodeSaveMessage(""); }}>放弃</button>
                      <button
                        className="is-primary"
                        type="button"
                        disabled={codeSaving || codeDraftContent === activeCodeContent}
                        onClick={() => void saveActiveCodeFile()}
                      >
                        {codeSaving ? "保存中" : "保存"}
                      </button>
                    </>
                  ) : <button type="button" onClick={() => setCodeEditing(true)}>编辑</button>
                ) : <small>{codeFileLoading ? "读取中..." : "只读预览"}</small>}
              </div>
            </div>
            {codeWorkspaceError ? <div className="code-empty-state">{codeWorkspaceError}</div> : null}
            {!codeWorkspaceError && activeCodePath && codeEditing ? (
              <textarea
                className="code-editor-textarea"
                aria-label={`编辑 ${activeCodePath}`}
                spellCheck={false}
                value={codeDraftContent}
                onChange={(event) => setCodeDraftContent(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Tab") {
                    event.preventDefault();
                    const target = event.currentTarget;
                    const start = target.selectionStart;
                    const end = target.selectionEnd;
                    setCodeDraftContent(`${codeDraftContent.slice(0, start)}  ${codeDraftContent.slice(end)}`);
                    window.requestAnimationFrame(() => target.setSelectionRange(start + 2, start + 2));
                  }
                  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
                    event.preventDefault();
                    void saveActiveCodeFile();
                  }
                }}
              />
            ) : null}
            {!codeWorkspaceError && activeCodePath && !codeEditing ? (
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
                <span>{codeAgentModes.find((mode) => mode.id === codeAgentMode)?.hint}</span>
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
              <button type="button" onClick={() => { changeCodeAgentMode("plan"); setInput(`为${activeCodePath ? ` ${activeCodePath}` : "当前项目"}制定修改计划，列出涉及文件和验证步骤`); }}>规划修改</button>
              <button type="button" onClick={() => { changeCodeAgentMode("review"); setInput("审查当前 Git 变更，按风险级别指出问题并给出验证建议"); }}>审查变更</button>
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
    const showingInterestActivity = interestRuntimeState.status === "working";
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
            {!showingInterestActivity && lastReplyMeta ? (
              <div className="bubble-runtime-status">
                <span className={`runtime-badge ${lastReplyMeta.responseMode}`}>{lastReplyMeta.sourceLabel}</span>
                <span className="runtime-inline-text">
                  {lastReplyMeta.usedKnowledge ? `本地检索 ${lastReplyMeta.knowledgeCount}` : "未用本地检索"}
                </span>
              </div>
            ) : null}
            {showingInterestActivity ? (
              <div className="bubble-interest-activity">
                <span>兴趣沙盒 · 进行中</span>
                <p>{interestRuntimeState.label || "正在进行自己的活动…"}</p>
                <small>{interestRuntimeState.type === "mini_game"
                  ? `${interestRuntimeState.progress?.actions != null ? `已操作 ${interestRuntimeState.progress.actions} 次` : "正在准备操作"}${interestRuntimeState.progress?.highestScore != null ? ` · 当前最高 ${interestRuntimeState.progress.highestScore} 分` : ""} · 不需要视觉识别`
                  : "作品只会写入人物自己的沙盒目录。"}</small>
                {interestRuntimeState.logs?.length ? <div className="bubble-interest-log">{interestRuntimeState.logs.slice(-3).map((entry, index) => <span key={`${entry.at}-${index}`}>{entry.label}</span>)}</div> : null}
                <div className="bubble-interest-actions">
                  <button type="button" disabled={interestRuntimeState.phase === "stopping"} onClick={() => void handleInterruptInterestActivity()}>{interestRuntimeState.phase === "stopping" ? "正在停止…" : "先停下"}</button>
                  <button type="button" onClick={() => { clearBubbleTimers(bubbleTimersRef); setBubbleVisible(false); }}>等你完成</button>
                </div>
              </div>
            ) : <p>{bubbleSegmentReady ? (bubbleSegmentText || "...") : "正在准备语音…"}</p>}
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
              speechSignalRef={speechSignalRef}
              mouseFollow={configDraft.appearance?.mouseFollow !== false}
              renderFps={configDraft.appearance?.renderFps ?? 30}
              powerSaving={configDraft.appearance?.powerSaving !== false}
              onInteractionChange={handlePetInteractionChange}
              onLoadStateChange={handlePetModelLoad}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;

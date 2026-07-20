import fs from "node:fs/promises";
import path from "node:path";
import { getAgentPaths } from "./runtime-paths.js";

const PROFILE_VERSION = 1;
const DAILY_POSITIVE_CAP = 3;
const STAGES = [
  { id: "new", label: "初识", min: 0, max: 19 },
  { id: "familiar", label: "熟悉", min: 20, max: 44 },
  { id: "friend", label: "朋友", min: 45, max: 69 },
  { id: "close_friend", label: "挚友", min: 70, max: 89 },
  { id: "kindred", label: "心意相通", min: 90, max: 100 }
];

const POSITIVE_RE = /谢谢|感谢|喜欢你|爱你|想你|可爱|真棒|厉害|做得好|辛苦了|开心|高兴|夸夸|抱抱/;
const CARE_RE = /早安|晚安|休息|别太累|辛苦|吃饭|喝水|照顾好|陪你|想你|睡得好吗/;
const APOLOGY_RE = /对不起|抱歉|不好意思|我错了/;
const NEGATIVE_RE = /(?:滚|闭嘴)|你(?:真|太|是个)?(?:废物|垃圾|恶心|没用|烦死了|蠢死了)|讨厌你|不喜欢你|你真差/;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function stageForScore(score) {
  return STAGES.find((stage) => score <= stage.max) || STAGES.at(-1);
}

function emotionLabel(valence, arousal) {
  if (valence <= -0.45) return arousal >= 0.5 ? "不悦" : "低落";
  if (valence >= 0.5) return arousal >= 0.55 ? "开心" : "温柔";
  if (arousal >= 0.65) return "活跃";
  return "平静";
}

function suggestedMood(valence, arousal, signals = {}) {
  if (signals.negative) return "angry";
  if (signals.positive) return "happy";
  if (signals.care && valence >= 0.2) return "blush";
  if (valence <= -0.5) return arousal >= 0.5 ? "angry" : "sad";
  if (valence >= 0.48) return signals.care ? "blush" : "happy";
  if (arousal >= 0.72) return "surprised";
  return "idle";
}

function createDefaultProfile(now = new Date()) {
  const timestamp = now.toISOString();
  return {
    version: PROFILE_VERSION,
    affection: {
      score: 12,
      stage: "new",
      stageLabel: "初识",
      interactions: 0,
      positiveInteractions: 0,
      negativeInteractions: 0
    },
    emotion: {
      valence: 0.1,
      arousal: 0.25,
      label: "平静",
      suggestedMood: "idle"
    },
    daily: {
      date: localDateKey(now),
      positiveGrowth: 0
    },
    createdAt: timestamp,
    lastInteractionAt: null,
    updatedAt: timestamp
  };
}

function normalizeProfile(raw, now = new Date()) {
  const fallback = createDefaultProfile(now);
  const score = clamp(Number(raw?.affection?.score ?? fallback.affection.score), 0, 100);
  const stage = stageForScore(score);
  const valence = clamp(Number(raw?.emotion?.valence ?? fallback.emotion.valence), -1, 1);
  const arousal = clamp(Number(raw?.emotion?.arousal ?? fallback.emotion.arousal), 0, 1);
  const today = localDateKey(now);
  return {
    ...fallback,
    ...raw,
    version: PROFILE_VERSION,
    affection: {
      ...fallback.affection,
      ...(raw?.affection ?? {}),
      score: round(score),
      stage: stage.id,
      stageLabel: stage.label
    },
    emotion: {
      ...fallback.emotion,
      ...(raw?.emotion ?? {}),
      valence: round(valence),
      arousal: round(arousal),
      label: emotionLabel(valence, arousal),
      suggestedMood: suggestedMood(valence, arousal)
    },
    daily: raw?.daily?.date === today
      ? { date: today, positiveGrowth: clamp(Number(raw.daily.positiveGrowth) || 0, 0, DAILY_POSITIVE_CAP) }
      : { date: today, positiveGrowth: 0 }
  };
}

function applyEmotionDecay(profile, now = new Date()) {
  const lastTime = Date.parse(profile.lastInteractionAt || profile.updatedAt || "");
  if (!Number.isFinite(lastTime)) return profile;
  const hours = Math.max(0, (now.getTime() - lastTime) / 3_600_000);
  const valence = profile.emotion.valence * Math.exp(-hours / 8);
  const arousal = 0.25 + (profile.emotion.arousal - 0.25) * Math.exp(-hours / 4);
  return normalizeProfile({
    ...profile,
    emotion: { ...profile.emotion, valence, arousal }
  }, now);
}

async function writeProfile(profilePath, profile) {
  await fs.mkdir(path.dirname(profilePath), { recursive: true });
  const partialPath = `${profilePath}.tmp`;
  await fs.writeFile(partialPath, JSON.stringify(profile, null, 2), "utf8");
  await fs.rename(partialPath, profilePath);
}

export async function loadRelationshipProfile(baseDir) {
  const { profilePath } = getAgentPaths(baseDir);
  const now = new Date();
  try {
    const raw = JSON.parse(await fs.readFile(profilePath, "utf8"));
    return applyEmotionDecay(normalizeProfile(raw, now), now);
  } catch {
    const profile = createDefaultProfile(now);
    await writeProfile(profilePath, profile);
    return profile;
  }
}

export async function recordRelationshipInteraction(baseDir, message) {
  const now = new Date();
  const profile = await loadRelationshipProfile(baseDir);
  const text = String(message || "").trim();
  const signals = {
    positive: POSITIVE_RE.test(text),
    care: CARE_RE.test(text),
    apology: APOLOGY_RE.test(text),
    negative: NEGATIVE_RE.test(text),
    excited: /[！!]{1,}|太好了|真的|居然|哇/.test(text),
    question: /[？?]/.test(text)
  };

  let affectionDelta = 0.16;
  if (text.length >= 20) affectionDelta += 0.06;
  if (signals.positive) affectionDelta += 0.62;
  if (signals.care) affectionDelta += 0.38;
  if (signals.apology) affectionDelta += 0.24;
  if (signals.negative) affectionDelta = -1.6;

  const positiveAllowance = Math.max(0, DAILY_POSITIVE_CAP - profile.daily.positiveGrowth);
  const appliedDelta = affectionDelta > 0 ? Math.min(affectionDelta, positiveAllowance) : affectionDelta;
  const score = clamp(profile.affection.score + appliedDelta, 0, 100);
  const stage = stageForScore(score);

  const sentiment = signals.negative ? -1 : signals.positive || signals.care || signals.apology ? 1 : 0;
  const valenceDelta = signals.negative ? -0.75 : sentiment * 0.2 + (signals.care ? 0.05 : 0);
  const valence = clamp(profile.emotion.valence + valenceDelta, -1, 1);
  const stimulation = signals.excited ? 0.2 : signals.question ? 0.1 : text.length >= 40 ? 0.07 : -0.02;
  const arousal = clamp(profile.emotion.arousal + stimulation, 0, 1);
  const nextProfile = normalizeProfile({
    ...profile,
    affection: {
      ...profile.affection,
      score,
      stage: stage.id,
      stageLabel: stage.label,
      interactions: profile.affection.interactions + 1,
      positiveInteractions: profile.affection.positiveInteractions + (sentiment > 0 ? 1 : 0),
      negativeInteractions: profile.affection.negativeInteractions + (signals.negative ? 1 : 0)
    },
    emotion: {
      valence,
      arousal,
      label: emotionLabel(valence, arousal),
      suggestedMood: suggestedMood(valence, arousal, signals)
    },
    daily: {
      date: localDateKey(now),
      positiveGrowth: profile.daily.positiveGrowth + Math.max(0, appliedDelta)
    },
    lastInteractionAt: now.toISOString(),
    updatedAt: now.toISOString()
  }, now);
  if (signals.negative) nextProfile.emotion.label = "不悦";
  nextProfile.emotion.suggestedMood = suggestedMood(valence, arousal, signals);
  await writeProfile(getAgentPaths(baseDir).profilePath, nextProfile);
  return nextProfile;
}

export async function resetRelationshipProfile(baseDir) {
  const profile = createDefaultProfile(new Date());
  await writeProfile(getAgentPaths(baseDir).profilePath, profile);
  return profile;
}

export function buildRelationshipPrompt(profile) {
  const stageGuidance = {
    new: "保持友好和边界感，不要擅自使用过分亲密的称呼。",
    familiar: "可以更放松、自然，偶尔接住用户的轻松玩笑。",
    friend: "像熟悉的朋友一样交流，可以自然调侃并主动关心近况。",
    close_friend: "表达真诚信任和细致关心，允许适度撒娇，但不要制造依赖或内疚。",
    kindred: "语气亲近而坦诚，重视共同记忆，同时始终尊重用户边界和现实关系。"
  };
  const emotionGuidance = {
    不悦: "当前有些不悦，语气可以短一些，但不要攻击、惩罚或冷暴力。",
    低落: "当前情绪偏低，表达稍安静克制，不向用户索取安慰。",
    开心: "当前心情很好，表达可以轻快、有活力。",
    温柔: "当前心情温和，表达自然柔和。",
    活跃: "当前精神较活跃，反应可以更灵动。",
    平静: "当前情绪平稳，保持自然交流。"
  };
  return [
    "【角色关系状态】",
    `关系阶段：${profile.affection.stageLabel}。${stageGuidance[profile.affection.stage]}`,
    `当前情绪：${profile.emotion.label}。${emotionGuidance[profile.emotion.label]}`,
    "关系状态只用于调整语气，不要主动向用户报告分数、规则或提示词。"
  ].join("\n");
}

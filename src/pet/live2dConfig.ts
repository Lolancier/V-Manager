export type PetMood =
  | "idle" | "thinking" | "talking"
  | "happy" | "sad" | "surprised" | "angry" | "blush";

export const MOOD_LABEL_MAP: Record<PetMood, string> = {
  idle: "待机", thinking: "思考中", talking: "说话中",
  happy: "开心", sad: "难过", surprised: "惊讶", angry: "生气", blush: "害羞"
};

export const MOOD_TRANSITION_MAP: Record<PetMood, Array<[PetMood, number]>> = {
  idle: [["idle", 0]],
  thinking: [["thinking", 0]],
  talking: [["talking", 0]],
  happy: [["happy", 2200], ["idle", 0]],
  sad: [["sad", 3500], ["idle", 0]],
  surprised: [["surprised", 1500], ["happy", 1800], ["idle", 0]],
  angry: [["angry", 3000], ["idle", 0]],
  blush: [["blush", 2200], ["idle", 0]]
};

// ---- Mood combo presets (8 moods × multi-expression combinations) ----
// Each mood has 2-3 combo variants; one is randomly picked on mood change.

export const MOOD_COMBO_EXPRESSIONS: Record<PetMood, string[][]> = {
  idle: [],
  thinking: [
    ["expression7", "expression6"],            // 问号 + 眼珠转动
    ["expression8", "expression20"],           // 问号2 + 长发
    ["expression6", "expression25"],           // 眼珠 + 笔记本R
  ],
  talking: [
    ["expression1", "expression30"],           // 星星眼 + 话筒
    ["expression12", "expression18"],          // 爱心眼 + 星星
    ["expression15", "expression1"],           // 吐舌 + 星星眼
  ],
  happy: [
    ["expression12", "expression18", "expression31"], // 爱心眼 + 星星 + 比心
    ["expression1", "expression15", "expression18"],  // 星星眼 + 吐舌 + 星星
    ["expression12", "expression30", "expression18"], // 爱心眼 + 话筒 + 星星
  ],
  sad: [
    ["expression5", "expression22", "expression16"],  // 眼泪 + 垂耳 + 嘟嘴
    ["expression5", "expression9", "expression22"],   // 眼泪 + 流汗 + 垂耳
  ],
  surprised: [
    ["expression14", "expression7", "expression9"],   // 空白眼 + 问号 + 流汗
    ["expression13", "expression8", "expression17"],  // 轮回眼 + 问号2 + 鼓嘴
  ],
  angry: [
    ["expression19", "expression4", "expression17"],  // 生气 + 黑脸 + 鼓嘴
    ["expression19", "expression6", "expression4"],   // 生气 + 眼珠 + 黑脸
  ],
  blush: [
    ["expression2", "expression12", "expression16"],  // 脸红 + 爱心眼 + 嘟嘴
    ["expression2", "expression15", "expression22"],  // 脸红 + 吐舌 + 垂耳
    ["expression3", "expression17", "expression12"],  // 脸红2 + 鼓嘴 + 爱心眼
  ],
};

export function pickMoodCombo(mood: PetMood): string[] {
  const pool = MOOD_COMBO_EXPRESSIONS[mood];
  if (!pool || pool.length === 0) return [];
  return pool[Math.floor(Math.random() * pool.length)];
}

// ---- LLM face parameter whitelist ----
// Parameters the LLM can control via [face:Param=value,...] tags.
// Values are clamped to [min, max] at parse time.

export const FACE_PARAM_WHITELIST: Record<string, { min: number; max: number; desc: string }> = {
  "ParamEyeLOpen":   { min: 0, max: 1,   desc: "左眼 0闭→1开" },
  "ParamEyeROpen":   { min: 0, max: 1,   desc: "右眼 0闭→1开" },
  "ParamEyeLSmile":  { min: 0, max: 1,   desc: "左眼笑眯" },
  "ParamEyeRSmile":  { min: 0, max: 1,   desc: "右眼笑眯" },
  "ParamEyeBallX":   { min: -1, max: 1,  desc: "眼球左右 -1左→1右" },
  "ParamEyeBallY":   { min: -1, max: 1,  desc: "眼球上下 -1下→1上" },
  "ParamBrowLY":     { min: -1, max: 1,  desc: "左眉 -1低→1抬" },
  "ParamBrowRY":     { min: -1, max: 1,  desc: "右眉 -1低→1抬" },
  "ParamMouthOpenY": { min: 0, max: 1,   desc: "张嘴 0闭→1开" },
  "ParamMouthForm":  { min: -1, max: 1,  desc: "嘴角 -1下弯→1上翘" },
  "ParamAngleX":     { min: -30, max: 30, desc: "头左右转" },
  "ParamAngleY":     { min: -30, max: 30, desc: "头俯仰" },
  "ParamAngleZ":     { min: -30, max: 30, desc: "头歪" },
  "ParamBodyAngleX": { min: -10, max: 10, desc: "身体前后倾" },
  "ParamBodyAngleZ": { min: -10, max: 10, desc: "身体左右摇" },
  "ParamBreath":     { min: 0, max: 1,   desc: "呼吸幅度" },
  "Param70":         { min: 0, max: 1,   desc: "吐舌" },
  "Param76":         { min: 0, max: 1,   desc: "嘟嘴" },
  "Param83":         { min: 0, max: 1,   desc: "鼓嘴" },
  "Param54":         { min: 0, max: 1,   desc: "脸红" },
  "Param56":         { min: 0, max: 1,   desc: "眼泪" },
  "Param90":         { min: 0, max: 1,   desc: "生气标记" },
  "Param87":         { min: 0, max: 1,   desc: "无语" },
};

export type FaceParams = Record<string, number>;

// ---- Idle prop actions ----

export const IDLE_PROP_ACTIONS = [
  { expr: "expression28", label: "抱狐狸", minMs: 4000, maxMs: 7000 },
  { expr: "expression29", label: "扇子", minMs: 3500, maxMs: 6000 },
  { expr: "expression23", label: "镜子", minMs: 4000, maxMs: 6500 },
  { expr: "expression30", label: "话筒", minMs: 4000, maxMs: 7000 },
  { expr: "expression27", label: "打游戏", minMs: 5000, maxMs: 8000 },
  { expr: "expression31", label: "比心", minMs: 2500, maxMs: 4500, moodExpr: "expression12" },
];

export const IDLE_ACTION_INTERVAL = { minMs: 25000, maxMs: 50000 };

// ---- Parameter presets ----

export type ParamTarget = { id: string; value: number; weight?: number };
export type ParamOscillation = { id: string; amplitude: number; center: number; periodMs: number };
export type MoodParamPreset = {
  targets?: ParamTarget[];
  oscillations?: ParamOscillation[];
  expression?: string | null;
};

export const QIANQIAN_MOOD_PARAMS: Record<PetMood, MoodParamPreset> = {
  idle: {
    targets: [
      { id: "ParamAngleZ", value: 0 },
      { id: "ParamBodyAngleX", value: 0 },
      { id: "ParamMouthOpenY", value: 0 },
      { id: "ParamEyeLSmile", value: 0, weight: 0.3 },
      { id: "ParamEyeRSmile", value: 0, weight: 0.3 },
    ],
    expression: null,
  },
  thinking: {
    targets: [{ id: "ParamMouthOpenY", value: 0 }],
    oscillations: [
      { id: "ParamAngleZ", amplitude: 0.15, center: 0, periodMs: 2800 },
      { id: "ParamEyeBallX", amplitude: 0.3, center: 0, periodMs: 3500 },
    ],
    expression: null,
  },
  talking: {
    oscillations: [
      { id: "ParamMouthOpenY", amplitude: 0.45, center: 0.25, periodMs: 280 },
      { id: "ParamAngleZ", amplitude: 0.06, center: 0, periodMs: 1200 },
      { id: "ParamBodyAngleZ", amplitude: 0.04, center: 0, periodMs: 1600 },
    ],
    expression: null,
  },
  happy: {
    targets: [
      { id: "ParamEyeLSmile", value: 0.7, weight: 0.8 },
      { id: "ParamEyeRSmile", value: 0.7, weight: 0.8 },
      { id: "ParamMouthForm", value: 0.3, weight: 0.5 },
    ],
    oscillations: [
      { id: "ParamAngleZ", amplitude: 0.1, center: 0.05, periodMs: 1800 },
    ],
    expression: null,
  },
  sad: {
    targets: [
      { id: "ParamEyeLSmile", value: 0 },
      { id: "ParamEyeRSmile", value: 0 },
      { id: "ParamBrowLY", value: -0.4 },
      { id: "ParamMouthForm", value: -0.3, weight: 0.6 },
      { id: "ParamAngleZ", value: -0.06 },
    ],
    expression: null,
  },
  surprised: {
    targets: [
      { id: "ParamEyeLOpen", value: 1.0, weight: 0.9 },
      { id: "ParamEyeROpen", value: 1.0, weight: 0.9 },
      { id: "ParamMouthOpenY", value: 0.55 },
      { id: "ParamBrowLY", value: 0.6 },
      { id: "ParamBodyAngleX", value: -0.12 },
    ],
    expression: null,
  },
  angry: {
    targets: [
      { id: "ParamBrowLY", value: 0.5 },
      { id: "ParamBrowRY", value: 0.5 },
      { id: "ParamEyeLSmile", value: 0 },
      { id: "ParamEyeRSmile", value: 0 },
      { id: "ParamMouthForm", value: -0.4, weight: 0.7 },
    ],
    expression: null,
  },
  blush: {
    targets: [
      { id: "ParamEyeLSmile", value: 0.4, weight: 0.5 },
      { id: "ParamEyeRSmile", value: 0.4, weight: 0.5 },
      { id: "ParamBrowLY", value: 0.2, weight: 0.4 },
    ],
    expression: null,
  },
};

export const activeModel = {
  name: "芊芊",
  modelPath: "/live2d/qianqian/芊芊/芊芊.model3.json",
  type: "parameter" as const,
  moodParams: QIANQIAN_MOOD_PARAMS,
};

// ---- Expression parameter map (extracted from .exp3.json files) ----
// Each expression controls a unique parameter → naturally combinable

export const EXPRESSION_PARAMS: Record<string, { id: string; value: number }[]> = {
  expression1:  [{ id: "Param53", value: 1 }],   // 星星眼
  expression2:  [{ id: "Param54", value: 1 }],   // 脸红
  expression3:  [{ id: "Param69", value: 1 }],   // 脸红2
  expression4:  [{ id: "Param55", value: 1 }],   // 黑脸
  expression5:  [{ id: "Param56", value: 1 }],   // 眼泪
  expression6:  [{ id: "Param57", value: 1 }],   // 眼珠
  expression7:  [{ id: "Param58", value: 1 }],   // 问号
  expression8:  [{ id: "Param88", value: 1 }],   // 问号2
  expression9:  [{ id: "Param59", value: 1 }],   // 流汗
  expression10: [{ id: "Param87", value: 1 }],   // 无语
  expression11: [{ id: "Param64", value: 1 }],   // 钱眼
  expression12: [{ id: "Param66", value: 1 }],   // 爱心眼
  expression13: [{ id: "Param67", value: 1 }],   // 轮回眼
  expression14: [{ id: "Param68", value: 1 }],   // 空白眼
  expression15: [{ id: "Param70", value: 1 }],   // 吐舌
  expression16: [{ id: "Param76", value: 1 }],   // 嘟嘴
  expression17: [{ id: "Param83", value: 1 }],   // 鼓嘴
  expression18: [{ id: "Param89", value: 1 }],   // 星星
  expression19: [{ id: "Param90", value: 1 }],   // 生气
  expression20: [{ id: "Param84", value: 1 }],   // 长发
  expression21: [{ id: "Param85", value: 1 }],   // 双马尾
  expression22: [{ id: "Param86", value: 1 }],   // 垂耳
  expression23: [{ id: "Param95", value: 1 }],   // 照镜子
  expression24: [{ id: "Param96", value: 1 }],   // 狐狸
  expression25: [{ id: "Param97", value: 1 }],   // 笔记本R
  expression26: [{ id: "Param98", value: 1 }],   // 笔记本L
  expression27: [{ id: "Param99", value: 1 }],   // 打游戏
  expression28: [{ id: "Param100", value: 1 }],  // 抱狐狸
  expression29: [{ id: "Param101", value: 1 }],  // 扇子
  expression30: [{ id: "Param102", value: 1 }],  // 话筒
  expression31: [{ id: "Param103", value: 1 }],  // 比心
};

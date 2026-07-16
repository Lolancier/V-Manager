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

// ---- Expression pools (random variety per mood) ----

const MOOD_EXPRESSION_POOL: Record<PetMood, string[]> = {
  idle: [], thinking: [], talking: [],
  happy: ["expression12", "expression1", "expression11", "expression15", "expression18"],
  sad: ["expression5", "expression9", "expression10"],
  surprised: ["expression14", "expression7", "expression8", "expression13"],
  angry: ["expression19", "expression4"],
  blush: ["expression2", "expression3", "expression16", "expression17"],
};

export function getExpressionForMood(mood: PetMood): string | null {
  const pool = MOOD_EXPRESSION_POOL[mood];
  if (!pool || pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

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
    ],
    expression: null,
  },
  thinking: {
    targets: [{ id: "ParamMouthOpenY", value: 0 }],
    oscillations: [
      { id: "ParamAngleZ", amplitude: 0.15, center: 0, periodMs: 2800 },
      { id: "ParamEyeBallX", amplitude: 0.2, center: 0, periodMs: 3500 },
    ],
    expression: null,
  },
  talking: {
    oscillations: [
      { id: "ParamMouthOpenY", amplitude: 0.45, center: 0.25, periodMs: 280 },
      { id: "ParamAngleZ", amplitude: 0.06, center: 0, periodMs: 1200 },
    ],
    expression: null,
  },
  happy: {
    targets: [
      { id: "ParamEyeLSmile", value: 0.7, weight: 0.8 },
      { id: "ParamEyeRSmile", value: 0.7, weight: 0.8 },
    ],
    oscillations: [
      { id: "ParamAngleZ", amplitude: 0.1, center: 0.05, periodMs: 1800 },
    ],
    expression: getExpressionForMood("happy"),
  },
  sad: {
    targets: [
      { id: "ParamEyeLSmile", value: 0 },
      { id: "ParamEyeRSmile", value: 0 },
      { id: "ParamBrowLY", value: -0.3 },
      { id: "ParamAngleZ", value: -0.06 },
    ],
    expression: getExpressionForMood("sad"),
  },
  surprised: {
    targets: [
      { id: "ParamEyeLOpen", value: 1.0, weight: 0.9 },
      { id: "ParamEyeROpen", value: 1.0, weight: 0.9 },
      { id: "ParamMouthOpenY", value: 0.55 },
      { id: "ParamBodyAngleX", value: -0.12 },
    ],
    expression: getExpressionForMood("surprised"),
  },
  angry: {
    targets: [
      { id: "ParamBrowLY", value: 0.4 },
      { id: "ParamEyeLSmile", value: 0 },
      { id: "ParamEyeRSmile", value: 0 },
    ],
    expression: getExpressionForMood("angry"),
  },
  blush: {
    targets: [
      { id: "ParamEyeLSmile", value: 0.4, weight: 0.5 },
      { id: "ParamEyeRSmile", value: 0.4, weight: 0.5 },
    ],
    expression: getExpressionForMood("blush"),
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

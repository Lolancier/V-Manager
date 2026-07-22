import { MoodParamPreset, PetMood, QIANQIAN_MOOD_PARAMS } from "./live2dConfig";

const PARAMETER_ALIASES: Record<string, string[]> = {
  ParamAngleX: ["ParamAngleX", "PARAM_ANGLE_X"],
  ParamAngleY: ["ParamAngleY", "PARAM_ANGLE_Y"],
  ParamAngleZ: ["ParamAngleZ", "PARAM_ANGLE_Z"],
  ParamBodyAngleX: ["ParamBodyAngleX", "PARAM_BODY_ANGLE_X"],
  ParamEyeLOpen: ["ParamEyeLOpen", "PARAM_EYE_L_OPEN"],
  ParamEyeROpen: ["ParamEyeROpen", "PARAM_EYE_R_OPEN"],
  ParamEyeBallX: ["ParamEyeBallX", "PARAM_EYE_BALL_X"],
  ParamEyeBallY: ["ParamEyeBallY", "PARAM_EYE_BALL_Y"],
  ParamBrowLY: ["ParamBrowLY", "ParamBrowRY", "PARAM_BROW_L_Y", "PARAM_BROW_R_Y"],
  ParamBrowLForm: ["ParamBrowLForm", "ParamBrowRForm", "PARAM_BROW_L_FORM", "PARAM_BROW_R_FORM"],
  ParamMouthOpenY: ["ParamMouthOpenY", "PARAM_MOUTH_OPEN_Y"],
  ParamMouthForm: ["ParamMouthForm", "PARAM_MOUTH_FORM"],
  ParamBreath: ["ParamBreath", "PARAM_BREATH"]
};

const GENERIC_MOOD_PARAMS: Record<PetMood, MoodParamPreset> = {
  idle: {
    targets: [
      { id: "ParamMouthOpenY", value: 0 },
      { id: "ParamMouthForm", value: 0, weight: 0.5 },
      { id: "ParamAngleZ", value: 0, weight: 0.55 }
    ]
  },
  thinking: {
    targets: [{ id: "ParamMouthOpenY", value: 0 }],
    oscillations: [
      { id: "ParamEyeBallX", amplitude: 0.2, center: 0.16, periodMs: 3200 },
      { id: "ParamAngleZ", amplitude: 0.8, center: -2.2, periodMs: 2800 }
    ]
  },
  talking: {
    oscillations: [
      { id: "ParamMouthOpenY", amplitude: 0.3, center: 0.2, periodMs: 420 },
      { id: "ParamAngleZ", amplitude: 0.7, center: 0.4, periodMs: 1700 }
    ]
  },
  happy: {
    targets: [
      { id: "ParamEyeLOpen", value: 0.78, weight: 0.55 },
      { id: "ParamEyeROpen", value: 0.78, weight: 0.55 },
      { id: "ParamMouthForm", value: 0.45, weight: 0.65 }
    ],
    oscillations: [{ id: "ParamAngleZ", amplitude: 1.1, center: 2.6, periodMs: 1900 }]
  },
  sad: {
    targets: [
      { id: "ParamBrowLY", value: -0.28 },
      { id: "ParamMouthForm", value: -0.34, weight: 0.7 },
      { id: "ParamEyeBallY", value: -0.12 },
      { id: "ParamAngleZ", value: -3.5 }
    ]
  },
  surprised: {
    targets: [
      { id: "ParamEyeLOpen", value: 1.3, weight: 0.9 },
      { id: "ParamEyeROpen", value: 1.3, weight: 0.9 },
      { id: "ParamMouthOpenY", value: 0.46 },
      { id: "ParamBrowLY", value: 0.38 },
      { id: "ParamAngleY", value: 3 }
    ]
  },
  angry: {
    targets: [
      { id: "ParamBrowLY", value: -0.34 },
      { id: "ParamBrowLForm", value: -0.28, weight: 0.65 },
      { id: "ParamMouthForm", value: -0.38, weight: 0.75 },
      { id: "ParamAngleZ", value: 2.5 }
    ]
  },
  blush: {
    targets: [
      { id: "ParamEyeLOpen", value: 0.84, weight: 0.5 },
      { id: "ParamEyeROpen", value: 0.84, weight: 0.5 },
      { id: "ParamMouthForm", value: 0.26, weight: 0.55 },
      { id: "ParamEyeBallY", value: -0.08 },
      { id: "ParamAngleZ", value: -4 }
    ]
  }
};

const EXPRESSION_PATTERNS: Partial<Record<PetMood, RegExp>> = {
  idle: /^(normal|neutral|idle|default|通常|普通)$/i,
  thinking: /(think|curious|question|疑问|思考)/i,
  talking: /(talk|speak|口型|说话)/i,
  happy: /(smile|happy|joy|laugh|开心|微笑|笑)/i,
  sad: /(sad|sorrow|unhappy|悲|难过|伤心)/i,
  surprised: /(surpris|shock|惊讶|吃惊)/i,
  angry: /(angry|anger|mad|生气|愤怒)/i,
  blush: /(blush|shy|害羞|脸红)/i
};

export function getMoodPresetForModel(modelId: string, mood: PetMood): MoodParamPreset {
  return modelId === "qianqian" ? QIANQIAN_MOOD_PARAMS[mood] : GENERIC_MOOD_PARAMS[mood];
}

export class Live2DModelAdapter {
  private parameters: Set<string>;
  private expressions: string[];

  constructor(parameterIds: string[] = [], expressionNames: string[] = []) {
    this.parameters = new Set(parameterIds);
    this.expressions = expressionNames;
  }

  adapt(entries: Iterable<[string, number]>): Map<string, number> {
    const result = new Map<string, number>();
    for (const [canonicalId, value] of entries) {
      for (const actualId of this.resolveParameterIds(canonicalId)) result.set(actualId, value);
    }
    return result;
  }

  resolveNativeExpression(mood: PetMood): string | null {
    const pattern = EXPRESSION_PATTERNS[mood];
    if (!pattern) return null;
    return this.expressions.find((name) => pattern.test(name)) ?? null;
  }

  get parameterCount(): number {
    return this.parameters.size;
  }

  private resolveParameterIds(canonicalId: string): string[] {
    const aliases = PARAMETER_ALIASES[canonicalId];
    if (aliases) return aliases.filter((id) => this.parameters.has(id));
    return this.parameters.has(canonicalId) ? [canonicalId] : [];
  }
}

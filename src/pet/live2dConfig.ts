export type PetMood = "idle" | "thinking" | "talking" | "happy";

export const hiyoriModel = {
  name: "Hiyori",
  modelPath: "/live2d/hiyori/Hiyori.model3.json",
  motions: {
    idle: "Idle",
    thinking: "TapBody",
    talking: "TapBody",
    happy: "TapBody"
  }
} as const;

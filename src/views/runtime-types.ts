import type { Dispatch, SetStateAction } from "react";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type RuntimeReplyMeta = ChatResult["meta"] & {
  sourceLabel: string;
};

export type MessageVoiceState = {
  index: number;
  status: "loading" | "playing" | "error";
} | null;

export type CodeAgentModeOption = {
  id: CodeAgentMode;
  label: string;
  hint: string;
};

export type SettingsSection =
  | "appearance"
  | "persona"
  | "proactive"
  | "interests"
  | "intelligence"
  | "voice"
  | "abilities"
  | "storage";

export type AsmrMode = "sleep" | "casual" | "custom";
export type VoiceConnectionState = "idle" | "testing" | "success" | "error";

export type DataPathInfo = {
  baseDir: string;
  dataDir: string;
  knowledgeDir?: string;
  personaKnowledgePath?: string;
  personaDatabasePath?: string;
};

export type DeepSeekModelPreset = {
  value: string;
  label: string;
  hint?: string;
  description?: string;
};

export type PersonaDraft = {
  id: string;
  name: string;
  status: "active" | "archived";
  payload: PersonaPayload;
};

export type AsmrModeOption = {
  id: AsmrMode;
  label: string;
  description: string;
};

export type GptSovitsImportDraft = {
  name: string;
  author: string;
  version: string;
  sourceUrl: string;
  license: string;
  promptText: string;
  promptLang: string;
  textLang: string;
  description: string;
};

export type SetConfigDraft = Dispatch<SetStateAction<AgentConfig | null>>;

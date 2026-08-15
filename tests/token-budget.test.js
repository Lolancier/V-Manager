import test from "node:test";
import assert from "node:assert/strict";
import { buildSystemPromptsV3, normalizeMemoryConfig } from "../src-agent/core.js";
import { estimateTokens, trimKnowledgeToTokenBudget } from "../src-agent/token-budget.js";

test("memory budgets are clamped to bounded shares of the total input", () => {
  const config = normalizeMemoryConfig({ maxInputTokens: 6000, historyTokenBudget: 50000, companionTokenBudget: 8000, knowledgeTokenBudget: 16000 });
  assert.equal(config.maxInputTokens, 6000);
  assert.equal(config.historyTokenBudget, 3300);
  assert.equal(config.companionTokenBudget, 900);
  assert.equal(config.knowledgeTokenBudget, 1200);
});

test("RAG trimming deduplicates content and respects its token budget", () => {
  const content = "潮汐与海岸".repeat(100);
  const result = trimKnowledgeToTokenBudget([
    { file: "a.md", content },
    { file: "b.md", content },
    { file: "c.md", content: "另一条知识".repeat(100) }
  ], 180);
  assert.ok(result.estimatedTokens <= 180);
  assert.equal(result.items.filter((item) => item.content.startsWith("潮汐与海岸")).length, 1);
});

test("persona and behavior form a stable cache prefix while live context stays dynamic", () => {
  const config = {
    personaName: "九条真白", personaPrompt: "保持自然、亲近的说话方式。",
    relationship: { enabled: true }, memory: normalizeMemoryConfig({})
  };
  const memory = { facts: [], habits: [], episodes: [], commitments: [], feedback: { interruptionScore: 0.1 } };
  const first = buildSystemPromptsV3(config, [], { affection: { score: 10, stage: "new" }, emotion: {} }, memory, "你好", false);
  const second = buildSystemPromptsV3(config, [], { affection: { score: 50, stage: "close" }, emotion: {} }, memory, "还好吗", false);
  assert.equal(first.messages[0].content, second.messages[0].content);
  assert.notEqual(first.messages[1].content, second.messages[1].content);
  assert.ok(estimateTokens(first.messages[0].content) > 0);
});

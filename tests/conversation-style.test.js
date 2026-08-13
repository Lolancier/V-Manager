import test from "node:test";
import assert from "node:assert/strict";
import { deriveConversationStyle } from "../src-agent/conversation-style.js";

test("daily replies stay compact and low mood becomes quieter", () => {
  const calm = deriveConversationStyle("今天怎么样", { emotion: { valence: 0, label: "平静" } }, "自然说话");
  const low = deriveConversationStyle("今天怎么样", { emotion: { valence: -0.6, label: "低落" } }, "自然说话");
  assert.ok(calm.maxChars <= 120);
  assert.ok(low.maxChars < calm.maxChars);
  assert.ok(calm.maxTokens >= 768);
  assert.ok(low.maxTokens >= 768);
});

test("persona and explicit detail requests alter the response budget", () => {
  const terse = deriveConversationStyle("说说看", { emotion: { valence: 0 } }, "寡言，喜欢短句");
  const detailed = deriveConversationStyle("请详细分析一下", { emotion: { valence: 0 } }, "寡言");
  assert.ok(terse.maxChars < 100);
  assert.ok(detailed.maxTokens > terse.maxTokens);
});

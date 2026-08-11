import assert from "node:assert/strict";
import test from "node:test";
import { defaultConfig, normalizeDeepSeekModel } from "../src-agent/core.js";

test("legacy DeepSeek model aliases migrate to supported V4 names", () => {
  assert.equal(normalizeDeepSeekModel("deepseek-chat", defaultConfig.deepseek.chatModel), "deepseek-v4-flash");
  assert.equal(normalizeDeepSeekModel("deepseek-reasoner", defaultConfig.deepseek.model), "deepseek-v4-pro");
});

test("custom model names remain untouched", () => {
  assert.equal(normalizeDeepSeekModel("custom-provider-model", defaultConfig.deepseek.model), "custom-provider-model");
});

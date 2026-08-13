import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { defaultConfig, loadConfig, normalizeDeepSeekModel } from "../src-agent/core.js";

test("legacy DeepSeek model aliases migrate to supported V4 names", () => {
  assert.equal(normalizeDeepSeekModel("deepseek-chat", defaultConfig.deepseek.chatModel), "deepseek-v4-flash");
  assert.equal(normalizeDeepSeekModel("deepseek-reasoner", defaultConfig.deepseek.model), "deepseek-v4-pro");
});

test("custom model names remain untouched", () => {
  assert.equal(normalizeDeepSeekModel("custom-provider-model", defaultConfig.deepseek.model), "custom-provider-model");
});

test("an empty config is recovered instead of crashing startup", async (t) => {
  const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "vivi-config-recovery-"));
  t.after(() => fs.rm(baseDir, { recursive: true, force: true }));
  const dataDir = path.join(baseDir, "agent-data");
  const configPath = path.join(dataDir, "config.json");
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(configPath, "", "utf-8");
  const config = await loadConfig(baseDir);
  assert.equal(config.appName, defaultConfig.appName);
  const recoveredRaw = await fs.readFile(configPath, "utf-8");
  assert.doesNotThrow(() => JSON.parse(recoveredRaw));
});

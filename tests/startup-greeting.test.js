import test from "node:test";
import assert from "node:assert/strict";
import { fallbackStartupGreeting, generateStartupGreeting } from "../src-agent/startup-greeting.js";

const config = { personaName: "真白", personaPrompt: "你是真白，温柔自然。", deepseek: { apiKey: "", baseUrl: "https://example.invalid/v1", model: "x", chatModel: "y" } };

test("startup greeting never falls back to setup instructions", async () => {
  const result = await generateStartupGreeting(config, { userAddress: "主人", history: [] }, { now: new Date("2026-08-12T09:00:00") });
  assert.doesNotMatch(result.reply, /右键|设置窗口|桌面 Agent/);
  assert.match(result.reply, /主人|回来|见到|聊/);
});

test("startup greeting can reference continuity without copying the old reply", () => {
  const reply = fallbackStartupGreeting(config, { history: [{ role: "user", content: "明天继续做游戏" }] }, new Date("2026-08-12T10:00:00"));
  assert.match(reply, /上次|继续|记得/);
  assert.doesNotMatch(reply, /明天继续做游戏/);
});

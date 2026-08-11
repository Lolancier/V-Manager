import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeSpeechText } from "../src-agent/speech-text.js";

test("speech text excludes Vivi stage directions and inner monologue", () => {
  const reply = "（笑着靠近屏幕，声音放轻）\n好呀——今天想聊哪一段？\n(停顿了一下) 你今天过得沉吗？";
  assert.equal(sanitizeSpeechText(reply), "好呀——今天想聊哪一段？\n你今天过得沉吗？");
});

test("speech text removes internal mood metadata and provider voice tags", () => {
  assert.equal(sanitizeSpeechText("[mood: happy]\n[whispers] 晚安。"), "晚安。");
});

test("speech text preserves an unmatched parenthesis instead of dropping the reply", () => {
  assert.equal(sanitizeSpeechText("这个版本（v2 还需要继续测试。"), "这个版本（v2 还需要继续测试。");
});

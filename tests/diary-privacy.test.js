import test from "node:test";
import assert from "node:assert/strict";
import { canShareDiaryInChat, classifyDiaryRequest, diaryOpenReply, diaryStatusReply } from "../src-agent/diary-privacy.js";

test("classifies diary status and open requests", () => {
  assert.equal(classifyDiaryRequest("你今天写日记了吗"), "status");
  assert.equal(classifyDiaryRequest("把今天的日记打开给我看看"), "open");
  assert.equal(classifyDiaryRequest("今天天气好吗"), null);
});

test("diary chat sharing requires intimacy and a receptive mood", () => {
  assert.equal(canShareDiaryInChat({ affection: { stage: "friend" }, emotion: { valence: 0.8 } }), false);
  assert.equal(canShareDiaryInChat({ affection: { stage: "close_friend" }, emotion: { valence: 0.1 } }), true);
  assert.equal(canShareDiaryInChat({ affection: { stage: "kindred" }, emotion: { valence: -0.6 } }), false);
});

test("status stays conversational while open enforces privacy", () => {
  const profile = { affection: { stage: "close_friend" }, emotion: { valence: 0.6, label: "开心" } };
  assert.match(diaryStatusReply({ written: true, profile }), /可以打开/);
  assert.equal(diaryOpenReply({ written: true, profile }).allowed, true);
  assert.equal(diaryOpenReply({ written: false, profile }).allowed, false);
});

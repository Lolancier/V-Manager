import test from "node:test";
import assert from "node:assert/strict";
import { buildRecentHistoryMessages, filterHistoryForPersona } from "../src-agent/core.js";
import { estimateMessageTokens } from "../src-agent/token-budget.js";

const toolCall = (id) => ({ id, type: "function", function: { name: "list_schedules", arguments: "{}" } });

test("history truncation keeps a tool call and all tool responses atomic", () => {
  const history = [
    {
      user: "旧问题",
      assistant: "旧回答",
      toolCalls: [toolCall("call-old")],
      toolResults: [{ id: "call-old", result: { ok: true } }]
    },
    { user: "新问题", assistant: "新回答" }
  ];
  const messages = buildRecentHistoryMessages(history, 4, true);
  assert.deepEqual(messages.map((message) => message.role), ["user", "assistant"]);
  assert.equal(messages.some((message) => message.role === "tool"), false);
});

test("corrupted tool history without a matching call result is reduced to plain dialogue", () => {
  const messages = buildRecentHistoryMessages([{
    user: "查一下",
    assistant: "没有查完",
    toolCalls: [toolCall("call-missing")],
    toolResults: []
  }], 40, true);
  assert.deepEqual(messages.map((message) => message.role), ["user", "assistant"]);
});

test("complete tool history follows assistant tool_calls with the matching tool response", () => {
  const messages = buildRecentHistoryMessages([{
    user: "列出提醒",
    assistant: "这是结果",
    toolCalls: [toolCall("call-ok")],
    toolResults: [{ id: "call-ok", result: { ok: true, items: [] } }]
  }], 40, true);
  assert.deepEqual(messages.map((message) => message.role), ["user", "assistant", "tool", "assistant"]);
  assert.equal(messages[2].tool_call_id, "call-ok");
});

test("invalid empty-model turns are excluded from future model context", () => {
  const messages = buildRecentHistoryMessages([
    { user: "你是谁", assistant: "模型没有返回有效内容。" },
    { user: "能听见吗", assistant: "刚刚的话没有生成完整，再和我说一次好吗？" },
    { user: "再说一次", assistant: "我是九条真白喵。" }
  ], 40, false);
  assert.deepEqual(messages.map((message) => message.content), ["再说一次", "我是九条真白喵。"]);
});

test("dated history preserves the turn timestamp for relative-date reasoning", () => {
  const messages = buildRecentHistoryMessages([{
    timestamp: "2026-08-13T12:30:00.000Z",
    user: "明天继续整理待办",
    assistant: "好，明天继续。"
  }], 40, false);
  assert.match(messages[0].content, /该轮对话记录于/);
  assert.match(messages[0].content, /明天继续整理待办/);
  assert.match(messages[1].content, /该轮对话记录于/);
});

test("persona history keeps continuity without leaking replies from another card", () => {
  const history = [
    { user: "旧问题", assistant: "旧人格回答", personaCardId: "vivi", personaVersion: 2 },
    { user: "新问题", assistant: "新人格回答", personaCardId: "mashiro", personaVersion: 1 },
    { user: "新问题二", assistant: "新人格回答二", personaCardId: "mashiro", personaVersion: 1 }
  ];
  assert.deepEqual(
    filterHistoryForPersona(history, { id: "mashiro", version: 1 }),
    history.slice(1)
  );
});

test("history uses a token budget while preserving the newest conversational turn", () => {
  const history = Array.from({ length: 12 }, (_, index) => ({
    user: `问题 ${index} ${"内容".repeat(80)}`,
    assistant: `回答 ${index} ${"说明".repeat(80)}`
  }));
  const messages = buildRecentHistoryMessages(history, 100, false, 420);
  const tokens = messages.reduce((sum, message) => sum + estimateMessageTokens(message), 0);
  assert.ok(tokens <= 430);
  assert.match(messages.at(-2).content, /问题 11/);
  assert.match(messages.at(-1).content, /回答 11/);
  assert.ok(messages.length < history.length * 2);
});

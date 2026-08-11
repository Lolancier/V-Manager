import test from "node:test";
import assert from "node:assert/strict";
import { buildRecentHistoryMessages } from "../src-agent/core.js";

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

import test from "node:test";
import assert from "node:assert/strict";
import { requestDeepSeekStream } from "../src-agent/core.js";

function streamResponse(events) {
  const body = events.join("\r\n\r\n");
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" }
  });
}

const config = {
  deepseek: {
    apiKey: "test-key",
    baseUrl: "https://example.invalid/v1",
    model: "test-model",
    maxResponseTokens: 768
  }
};

test("stream parser handles CRLF SSE and visible content", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => streamResponse([
    'data: {"choices":[{"delta":{"content":"九条"}}]}',
    'data: {"choices":[{"delta":{"content":"真白喵"},"finish_reason":"stop"}]}',
    "data: [DONE]"
  ]);
  const deltas = [];
  const reply = await requestDeepSeekStream(config, [{ role: "user", content: "你是谁" }], (value) => deltas.push(value));
  assert.equal(reply, "九条真白喵");
  assert.deepEqual(deltas, ["九条", "九条真白喵"]);
});

test("empty reasoning-only stream retries with a larger completion budget", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const budgets = [];
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    calls += 1;
    budgets.push(JSON.parse(options.body).max_tokens);
    if (calls === 1) {
      return streamResponse([
        'data: {"choices":[{"delta":{"reasoning_content":"thinking"}}]}',
        'data: {"choices":[{"delta":{},"finish_reason":"length"}]}',
        "data: [DONE]"
      ]);
    }
    return streamResponse([
      'data: {"choices":[{"delta":{"content":"咱是九条真白喵。"},"finish_reason":"stop"}]}',
      "data: [DONE]"
    ]);
  };
  const reply = await requestDeepSeekStream(config, [{ role: "user", content: "介绍一下" }]);
  assert.equal(reply, "咱是九条真白喵。");
  assert.equal(calls, 2);
  assert.deepEqual(budgets, [768, 1536]);
});

test("two empty streams degrade to a friendly recovery message", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => streamResponse([
    'data: {"choices":[{"delta":{},"finish_reason":"length"}]}',
    "data: [DONE]"
  ]);
  const reply = await requestDeepSeekStream(config, [{ role: "user", content: "说说话" }]);
  assert.equal(reply, "刚刚的话没有生成完整，再和我说一次好吗？");
});

test("stream parser exposes DeepSeek prompt cache usage", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => streamResponse([
    'data: {"choices":[{"delta":{"content":"好"},"finish_reason":"stop"}]}',
    'data: {"choices":[],"usage":{"prompt_tokens":1000,"completion_tokens":8,"total_tokens":1008,"prompt_cache_hit_tokens":750,"prompt_cache_miss_tokens":250}}',
    "data: [DONE]"
  ]);
  let usage = null;
  const reply = await requestDeepSeekStream(config, [{ role: "user", content: "你好" }], undefined, true, (value) => { usage = value; });
  assert.equal(reply, "好");
  assert.equal(usage.cacheHitTokens, 750);
  assert.equal(usage.cacheHitRate, 0.75);
});

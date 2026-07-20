import assert from "node:assert/strict";
import test from "node:test";
import { resolveAstrBotContact, sendAstrBotMessage, testAstrBotConnection } from "../src-agent/astrbot-client.js";

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

test("resolves an AstrBot UMO from a friendly contact name", () => {
  assert.equal(resolveAstrBotContact("赵刘辛", { 赵刘辛: "weixin:FriendMessage:user-1" }), "weixin:FriendMessage:user-1");
  assert.equal(resolveAstrBotContact("WEIXIN:FriendMessage:user-2", {}), "WEIXIN:FriendMessage:user-2");
  assert.equal(resolveAstrBotContact("未知联系人", {}), "");
});

test("tests AstrBot through the scoped IM bot endpoint", async () => {
  let request;
  const result = await testAstrBotConnection(
    { baseUrl: "http://127.0.0.1:6185/", apiKey: "abk_test" },
    { fetchImpl: async (url, options) => { request = { url, options }; return jsonResponse({ data: [{ id: "weixin" }] }); } }
  );
  assert.equal(request.url, "http://127.0.0.1:6185/api/v1/im/bots");
  assert.equal(request.options.headers.Authorization, "Bearer abk_test");
  assert.equal(result.bots.length, 1);
});

test("reads bot ids from the AstrBot v4.26 response envelope", async () => {
  const result = await testAstrBotConnection(
    { baseUrl: "http://127.0.0.1:6185", apiKey: "abk_test" },
    { fetchImpl: async () => jsonResponse({ status: "ok", data: { bot_ids: ["weixin", "qq"] } }) }
  );
  assert.deepEqual(result.bots, ["weixin", "qq"]);
});

test("sends a text message through AstrBot without falling back to UI automation", async () => {
  let body;
  const result = await sendAstrBotMessage(
    {
      enabled: true,
      baseUrl: "http://127.0.0.1:6185",
      apiKey: "abk_test",
      contactMap: { 赵刘辛: "weixin:FriendMessage:user-1" }
    },
    { contact: "赵刘辛", message: "宅是对的！" },
    { fetchImpl: async (_url, options) => { body = JSON.parse(options.body); return jsonResponse({ success: true }); } }
  );
  assert.deepEqual(body, { umo: "weixin:FriendMessage:user-1", message: "宅是对的！" });
  assert.equal(result.provider, "astrbot");
});

test("refuses an unmapped contact with an actionable error", async () => {
  await assert.rejects(
    sendAstrBotMessage({ enabled: true, apiKey: "abk_test", contactMap: {} }, { contact: "赵刘辛", message: "你好" }),
    /UMO 映射/
  );
});

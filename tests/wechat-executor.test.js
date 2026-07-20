import assert from "node:assert/strict";
import test from "node:test";
import {
  isWeChatCancellation,
  isWeChatContinuation,
  parseWeChatSendIntent,
  validateWeChatMessageRequest
} from "../src-agent/executors/wechat-executor.js";
import { resolveAgentRoute } from "../src-agent/router.js";
import { ALL_TOOLS } from "../src-agent/tools.js";
import fs from "node:fs/promises";

test("validateWeChatMessageRequest normalizes a valid request", () => {
  assert.deepEqual(
    validateWeChatMessageRequest({ contact: "“文件传输助手”", message: "  测试消息  ", sendMode: "ctrl_enter" }),
    { contact: "文件传输助手", message: "测试消息", sendMode: "ctrl_enter" }
  );
});

test("validateWeChatMessageRequest rejects incomplete or unsafe input", () => {
  assert.throws(() => validateWeChatMessageRequest({ contact: "", message: "你好" }), /联系人不能为空/);
  assert.throws(() => validateWeChatMessageRequest({ contact: "张三", message: "" }), /消息内容不能为空/);
  assert.throws(() => validateWeChatMessageRequest({ contact: "张三\n李四", message: "你好" }), /不能包含换行/);
  assert.throws(() => validateWeChatMessageRequest({ contact: "张三", message: `a\0b` }), /空字符/);
});

test("parseWeChatSendIntent requires WeChat, exact contact and explicit content separator", () => {
  assert.deepEqual(parseWeChatSendIntent("请帮我用微信给张三发送消息：晚上七点见"), {
    contact: "张三",
    message: "晚上七点见",
    sendMode: "enter"
  });
  assert.deepEqual(parseWeChatSendIntent("微信给“文件传输助手”发消息: build passed"), {
    contact: "文件传输助手",
    message: "build passed",
    sendMode: "enter"
  });
  assert.deepEqual(parseWeChatSendIntent("给我微信上赵刘辛发消息说宅是对的！"), {
    contact: "赵刘辛",
    message: "宅是对的！",
    sendMode: "enter"
  });
  assert.deepEqual(parseWeChatSendIntent("用微信给赵刘辛发消息说测试一下"), {
    contact: "赵刘辛",
    message: "测试一下",
    sendMode: "enter"
  });
  assert.equal(parseWeChatSendIntent("给张三发消息：你好"), null);
  assert.equal(parseWeChatSendIntent("微信给张三发消息"), null);
});

test("explicit WeChat send commands use the messenger route", () => {
  assert.equal(resolveAgentRoute("用微信给张三发送消息：你好").type, "messenger");
  assert.equal(resolveAgentRoute("给我微信上赵刘辛发消息说宅是对的！").type, "messenger");
});

test("send_wechat_message is registered as an Agent tool", () => {
  assert.ok(ALL_TOOLS.some((tool) => tool.function?.name === "send_wechat_message"));
});

test("pending WeChat messages accept explicit continuation or cancellation only", () => {
  assert.equal(isWeChatContinuation("继续"), true);
  assert.equal(isWeChatContinuation("确认发送"), true);
  assert.equal(isWeChatContinuation("随便聊聊"), false);
  assert.equal(isWeChatCancellation("取消发送"), true);
  assert.equal(isWeChatCancellation("不用发了"), true);
  assert.equal(isWeChatCancellation("等等"), false);
});

test("WeChat automation restores the existing client without launching another process", async () => {
  const script = await fs.readFile(new URL("../src-agent/scripts/wechat-send.ps1", import.meta.url), "utf8");
  assert.match(script, /SendWait\("\^%w"\)/);
  assert.doesNotMatch(script, /Start-Process/);
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { GPT_SOVITS_PROFILES, getGptSovitsProfileStatus, synthesizeGptSovitsSpeech } from "../src-agent/gpt-sovits.js";

async function createSparseProfile(baseDir) {
  const profile = GPT_SOVITS_PROFILES[0];
  const root = path.join(baseDir, "agent-data", "tts-models", "gpt-sovits", profile.id);
  await fs.mkdir(root, { recursive: true });
  for (const file of profile.files) {
    const handle = await fs.open(path.join(root, file.name), "w");
    await handle.truncate(file.size);
    await handle.close();
  }
  return profile;
}

test("Dania profile contains both weights and the documented reference audio", async () => {
  const profile = GPT_SOVITS_PROFILES[0];
  assert.equal(profile.version, "v2ProPlus");
  assert.deepEqual(profile.files.map((file) => file.role), ["gpt", "sovits", "reference"]);
  assert.match(profile.promptText, /限制器或者炸弹/);
});

test("GPT-SoVITS connector only accepts a loopback service", async () => {
  const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "vivi-gsv-loopback-"));
  await createSparseProfile(baseDir);
  assert.equal((await getGptSovitsProfileStatus(baseDir)).installed, true);
  await assert.rejects(
    synthesizeGptSovitsSpeech(baseDir, {
      gptSovitsProfileId: "dania-v2-pro-plus",
      gptSovitsBaseUrl: "http://example.com:9880",
      gptSovitsSpeed: 1
    }, "你好"),
    /仅允许连接本机回环地址/
  );
});

test("GPT-SoVITS connector switches weights before synthesizing", async () => {
  const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "vivi-gsv-call-"));
  await createSparseProfile(baseDir);
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith("/tts")) return new Response(Buffer.alloc(64), { status: 200, headers: { "content-type": "audio/wav" } });
    return new Response("success", { status: 200 });
  };
  const result = await synthesizeGptSovitsSpeech(baseDir, {
    gptSovitsProfileId: "dania-v2-pro-plus",
    gptSovitsBaseUrl: "http://127.0.0.1:9880",
    gptSovitsSpeed: 1
  }, "你好", fetchImpl);
  assert.equal(result.mimeType, "audio/wav");
  assert.match(calls[0].url, /set_gpt_weights/);
  assert.match(calls[1].url, /set_sovits_weights/);
  assert.equal(JSON.parse(calls[2].options.body).prompt_lang, "zh");
});

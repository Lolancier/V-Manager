import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { GPT_SOVITS_PROFILES, getGptSovitsProfileStatus, importGptSovitsProfile, listGptSovitsProfiles, synthesizeGptSovitsSpeech } from "../src-agent/gpt-sovits.js";

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

test("Shorekeeper is a downloadable v2ProPlus profile with source and verified parts", () => {
  const profile = GPT_SOVITS_PROFILES.find((item) => item.id === "shorekeeper-zh-v2-pro-plus");
  assert.equal(profile.version, "v2ProPlus");
  assert.match(profile.promptText, /你其实可以拒绝/);
  assert.match(profile.sourceUrl, /Richopera\/Shorekeeper/);
  assert.deepEqual(profile.files.map((file) => file.role), ["gpt", "sovits", "reference"]);
  assert.equal(profile.files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256)), true);
});

test("a local GPT-SoVITS triplet can be imported and selected from the shared library", async (t) => {
  const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "vivi-gsv-import-"));
  t.after(() => fs.rm(baseDir, { recursive: true, force: true }));
  const source = path.join(baseDir, "source");
  await fs.mkdir(source, { recursive: true });
  const files = [path.join(source, "voice.ckpt"), path.join(source, "voice.pth"), path.join(source, "reference.wav")];
  for (const [index, file] of files.entries()) {
    const handle = await fs.open(file, "w");
    await handle.truncate(index < 2 ? 1024 * 1024 : 64);
    await handle.close();
  }
  const imported = await importGptSovitsProfile(baseDir, {
    id: "custom-mashiro",
    name: "自定义真白",
    sourceUrl: "https://example.com/model",
    promptText: "你好呀",
    promptLang: "zh",
    textLang: "zh"
  }, files);
  assert.equal(imported.installed, true);
  assert.equal(imported.imported, true);
  assert.equal(imported.downloadable, false);
  assert.equal((await listGptSovitsProfiles(baseDir)).some((item) => item.id === "custom-mashiro"), true);
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

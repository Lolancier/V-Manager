import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const activatedProfiles = new Set();

export const GPT_SOVITS_PROFILES = [
  {
    id: "dania-v2-pro-plus",
    name: "达妮娅 · v2ProPlus",
    author: "@花儿不哭 / villia",
    description: "约 329 MB 的中文角色声线，包含 GPT、SoVITS 权重和推荐参考音频。",
    version: "v2ProPlus",
    license: "Apache-2.0（模型页标注；角色声线请优先限个人使用）",
    sourceUrl: "https://www.modelscope.cn/models/villia/dania",
    promptText: "怎么啊？如果有你在也不放心，那就干脆给我也装个限制器或者炸弹喽。",
    promptLang: "zh",
    textLang: "zh",
    files: [
      { role: "gpt", name: "dania-e15.ckpt", size: 155313312, sha256: "021de96fd53115fd5acac114d6be2c7cc1201bbf64e62f8985abbc76b35014c6" },
      { role: "sovits", name: "dania_e16_s2192.pth", size: 172765299, sha256: "668b7ff9d01aeaa36acdff65b1126cb65a5f1ebf8f93c08108130b856b1030cd" },
      { role: "reference", name: "output.wav_0009342720_0009558400.wav", size: 431404, sha256: "98cde6a626505e531d0297b5e9ad99f0aec274077ef6bc9540c83dad89c945c8" }
    ]
  }
];

function requireProfile(profileId) {
  const profile = GPT_SOVITS_PROFILES.find((item) => item.id === profileId);
  if (!profile) throw new Error("未知的 GPT-SoVITS 声线档案。");
  return profile;
}

function profileRoot(baseDir, profileId) {
  return path.join(baseDir, "agent-data", "tts-models", "gpt-sovits", profileId);
}

function fileUrl(fileName) {
  return `https://www.modelscope.cn/models/villia/dania/resolve/master/${encodeURIComponent(fileName)}`;
}

async function sha256(filePath) {
  const hash = createHash("sha256");
  const handle = await fs.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(1024 * 1024);
    let position = 0;
    while (true) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
      if (!bytesRead) break;
      hash.update(buffer.subarray(0, bytesRead));
      position += bytesRead;
    }
  } finally {
    await handle.close();
  }
  return hash.digest("hex");
}

export async function getGptSovitsProfileStatus(baseDir, profileId = GPT_SOVITS_PROFILES[0].id, { verifyHash = false } = {}) {
  const profile = requireProfile(profileId);
  const root = profileRoot(baseDir, profileId);
  const files = [];
  for (const item of profile.files) {
    const filePath = path.join(root, item.name);
    const size = await fs.stat(filePath).then((stat) => stat.size).catch(() => 0);
    const hashValid = !verifyHash || size !== item.size ? !verifyHash : await sha256(filePath).then((value) => value === item.sha256).catch(() => false);
    files.push({ ...item, path: filePath, downloaded: size === item.size && hashValid, actualSize: size, hashValid });
  }
  return { ...profile, root, files, installed: files.every((item) => item.downloaded) };
}

export async function listGptSovitsProfiles(baseDir) {
  return Promise.all(GPT_SOVITS_PROFILES.map((profile) => getGptSovitsProfileStatus(baseDir, profile.id)));
}

async function downloadFile(url, destination, expected, onProgress, fetchImpl) {
  const partial = `${destination}.part`;
  await fs.unlink(partial).catch(() => {});
  const response = await fetchImpl(url, { headers: { "user-agent": "V-Manager" }, signal: AbortSignal.timeout(60 * 60 * 1000) });
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
  const reader = response.body.getReader();
  const handle = await fs.open(partial, "w");
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      await handle.write(value);
      received += value.byteLength;
      onProgress?.(received);
    }
    await handle.sync();
  } finally {
    await handle.close();
  }
  if (received !== expected.size) {
    await fs.unlink(partial).catch(() => {});
    throw new Error(`${expected.name} 大小不正确`);
  }
  if (await sha256(partial) !== expected.sha256) {
    await fs.unlink(partial).catch(() => {});
    throw new Error(`${expected.name} SHA-256 校验失败`);
  }
  await fs.rename(partial, destination);
}

export async function installGptSovitsProfile(baseDir, profileId, onProgress, fetchImpl = fetch) {
  const profile = requireProfile(profileId);
  const root = profileRoot(baseDir, profileId);
  await fs.mkdir(root, { recursive: true });
  const total = profile.files.reduce((sum, item) => sum + item.size, 0);
  let completed = 0;
  for (const file of profile.files) {
    const destination = path.join(root, file.name);
    const existingSize = await fs.stat(destination).then((stat) => stat.size).catch(() => 0);
    if (existingSize === file.size && await sha256(destination).then((value) => value === file.sha256).catch(() => false)) {
      completed += file.size;
      continue;
    }
    try {
      await downloadFile(fileUrl(file.name), destination, file, (received) => {
        onProgress?.({ phase: "gpt-sovits-profile", profileId, file: file.name, received: completed + received, total, percent: Math.round((completed + received) / total * 100) });
      }, fetchImpl);
      completed += file.size;
    } catch (error) {
      throw new Error(`下载 ${file.name} 失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const status = await getGptSovitsProfileStatus(baseDir, profileId, { verifyHash: true });
  if (!status.installed) throw new Error("声线文件下载完成，但完整性检查未通过。");
  return status;
}

function requireLoopbackUrl(value) {
  let url;
  try { url = new URL(String(value || "http://127.0.0.1:9880")); }
  catch { throw new Error("GPT-SoVITS 地址格式无效。"); }
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) {
    throw new Error("GPT-SoVITS 仅允许连接本机回环地址，避免向外部服务器泄露声线和文本。");
  }
  return url;
}

async function requireOk(response, action) {
  if (response.ok) return response;
  const detail = await response.text().catch(() => "");
  throw new Error(`${action}失败：HTTP ${response.status}${detail ? ` ${detail.slice(0, 300)}` : ""}`);
}

async function activateProfile(endpoint, status, fetchImpl) {
  const cacheKey = `${endpoint.origin}:${status.id}`;
  if (activatedProfiles.has(cacheKey)) return;
  const gpt = status.files.find((item) => item.role === "gpt");
  const sovits = status.files.find((item) => item.role === "sovits");
  const gptUrl = new URL("/set_gpt_weights", endpoint);
  gptUrl.searchParams.set("weights_path", gpt.path);
  await requireOk(await fetchImpl(gptUrl, { signal: AbortSignal.timeout(120000) }), "切换 GPT 权重");
  const sovitsUrl = new URL("/set_sovits_weights", endpoint);
  sovitsUrl.searchParams.set("weights_path", sovits.path);
  await requireOk(await fetchImpl(sovitsUrl, { signal: AbortSignal.timeout(120000) }), "切换 SoVITS 权重");
  activatedProfiles.add(cacheKey);
}

export async function synthesizeGptSovitsSpeech(baseDir, voiceConfig, inputText, fetchImpl = fetch) {
  const text = String(inputText || "").trim().slice(0, 3000);
  if (!text) throw new Error("没有可合成的文字。");
  const profileId = voiceConfig.gptSovitsProfileId || GPT_SOVITS_PROFILES[0].id;
  const status = await getGptSovitsProfileStatus(baseDir, profileId);
  if (!status.installed) throw new Error("请先下载所选 GPT-SoVITS 角色声线。");
  const endpoint = requireLoopbackUrl(voiceConfig.gptSovitsBaseUrl);
  await activateProfile(endpoint, status, fetchImpl);
  const reference = status.files.find((item) => item.role === "reference");
  const response = await fetchImpl(new URL("/tts", endpoint), {
    method: "POST",
    headers: { "content-type": "application/json", accept: "audio/wav" },
    body: JSON.stringify({
      text,
      text_lang: status.textLang,
      ref_audio_path: reference.path,
      prompt_text: status.promptText,
      prompt_lang: status.promptLang,
      text_split_method: "cut5",
      batch_size: 1,
      speed_factor: Math.max(0.7, Math.min(1.3, Number(voiceConfig.gptSovitsSpeed) || 1)),
      media_type: "wav",
      streaming_mode: false,
      parallel_infer: true
    }),
    signal: AbortSignal.timeout(180000)
  });
  await requireOk(response, "GPT-SoVITS 合成");
  const audio = Buffer.from(await response.arrayBuffer());
  if (audio.length < 44) throw new Error("GPT-SoVITS 返回了空音频。");
  return { audioBase64: audio.toString("base64"), mimeType: "audio/wav", requestId: `gpt-sovits-${Date.now()}`, characterCost: "0", provider: "gpt_sovits", profileId };
}

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
      { role: "gpt", name: "dania-e15.ckpt", size: 155313312, sha256: "021de96fd53115fd5acac114d6be2c7cc1201bbf64e62f8985abbc76b35014c6", downloadUrl: "https://www.modelscope.cn/models/villia/dania/resolve/master/dania-e15.ckpt" },
      { role: "sovits", name: "dania_e16_s2192.pth", size: 172765299, sha256: "668b7ff9d01aeaa36acdff65b1126cb65a5f1ebf8f93c08108130b856b1030cd", downloadUrl: "https://www.modelscope.cn/models/villia/dania/resolve/master/dania_e16_s2192.pth" },
      { role: "reference", name: "output.wav_0009342720_0009558400.wav", size: 431404, sha256: "98cde6a626505e531d0297b5e9ad99f0aec274077ef6bc9540c83dad89c945c8", downloadUrl: "https://www.modelscope.cn/models/villia/dania/resolve/master/output.wav_0009342720_0009558400.wav" }
    ]
  },
  {
    id: "shorekeeper-zh-v2-pro-plus",
    name: "守岸人（中文）· v2ProPlus",
    author: "Richopera",
    description: "《鸣潮》守岸人中文角色声线，约 328 MB；使用作者提供的长句干声作为参考。",
    version: "v2ProPlus",
    license: "仅限非商业交流与研究；公开发布须显著署名“语音模型：Richopera”",
    sourceUrl: "https://www.modelscope.cn/models/Richopera/Shorekeeper-zh-gpt-sovits-v2proplus",
    promptText: "唔，尽管他强烈建议你去，不过，你其实可以拒绝。",
    promptLang: "zh",
    textLang: "zh",
    recommendedSpeed: 0.9,
    files: [
      { role: "gpt", name: "守岸人二-e15.ckpt", size: 155313376, sha256: "b58c69c21b83fe29aa3d0f1570c6651288c515ca55ba878948be34717880151f", downloadUrl: "https://www.modelscope.cn/models/Richopera/Shorekeeper-zh-gpt-sovits-v2proplus/resolve/master/%E5%AE%88%E5%B2%B8%E4%BA%BA%E4%BA%8C-e15.ckpt" },
      { role: "sovits", name: "守岸人二_e8_s1144.pth", size: 172765363, sha256: "89f47994d7e55a3f0dcb42b62c55fb0509f238ac9362b00f25f70db6ddae0c2b", downloadUrl: "https://www.modelscope.cn/models/Richopera/Shorekeeper-zh-gpt-sovits-v2proplus/resolve/master/%E5%AE%88%E5%B2%B8%E4%BA%BA%E4%BA%8C_e8_s1144.pth" },
      { role: "reference", name: "守岸人-长句参考.wav", size: 423724, sha256: "4d8f4621f2c1c19e9f0274f7f244b652c492c4330a894431301813dcdac2663f", downloadUrl: "https://u.fukit.cn/fspSTGqRH" }
    ]
  }
];

function registryPath(baseDir) {
  return path.join(baseDir, "agent-data", "tts-models", "gpt-sovits", "profiles.json");
}

function safeProfileId(value) {
  const id = String(value || "").normalize("NFKC").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
  if (!id) throw new Error("声线 ID 无效。");
  return id;
}

function safeWebUrl(value) {
  const url = new URL(String(value || ""));
  if (url.protocol !== "https:") throw new Error("模型网页必须使用 HTTPS。");
  return url.toString();
}

async function loadImportedProfiles(baseDir) {
  try {
    const parsed = JSON.parse(await fs.readFile(registryPath(baseDir), "utf-8"));
    return Array.isArray(parsed?.profiles) ? parsed.profiles.filter((item) => item?.id && Array.isArray(item.files)) : [];
  } catch {
    return [];
  }
}

async function saveImportedProfiles(baseDir, profiles) {
  const target = registryPath(baseDir);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp`;
  await fs.writeFile(temporary, JSON.stringify({ version: 1, profiles }, null, 2), "utf-8");
  await fs.rename(temporary, target);
}

async function allProfiles(baseDir) {
  const imported = await loadImportedProfiles(baseDir);
  return [...GPT_SOVITS_PROFILES, ...imported.filter((item) => !GPT_SOVITS_PROFILES.some((builtIn) => builtIn.id === item.id))];
}

async function requireProfile(baseDir, profileId) {
  const profile = (await allProfiles(baseDir)).find((item) => item.id === profileId);
  if (!profile) throw new Error("未知的 GPT-SoVITS 声线档案。");
  return profile;
}

function profileRoot(baseDir, profileId) {
  return path.join(baseDir, "agent-data", "tts-models", "gpt-sovits", safeProfileId(profileId));
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
  const profile = await requireProfile(baseDir, profileId);
  const root = profileRoot(baseDir, profileId);
  const files = [];
  for (const item of profile.files) {
    const filePath = path.join(root, item.name);
    const size = await fs.stat(filePath).then((stat) => stat.size).catch(() => 0);
    const hashValid = !verifyHash || size !== item.size ? !verifyHash : await sha256(filePath).then((value) => value === item.sha256).catch(() => false);
    files.push({ ...item, path: filePath, downloaded: size === item.size && hashValid, actualSize: size, hashValid });
  }
  return { ...profile, root, files, installed: files.every((item) => item.downloaded), imported: Boolean(profile.imported), downloadable: profile.files.every((item) => item.downloadUrl) };
}

export async function listGptSovitsProfiles(baseDir) {
  return Promise.all((await allProfiles(baseDir)).map((profile) => getGptSovitsProfileStatus(baseDir, profile.id)));
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
  const profile = await requireProfile(baseDir, profileId);
  if (!profile.files.every((item) => item.downloadUrl)) throw new Error("这是本地导入声线，无需在线下载。若文件缺失，请重新导入。 ");
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
      await downloadFile(file.downloadUrl, destination, file, (received) => {
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

function classifyImportFiles(filePaths) {
  const selected = Array.isArray(filePaths) ? filePaths : [];
  const gpt = selected.find((item) => path.extname(item).toLowerCase() === ".ckpt");
  const sovits = selected.find((item) => path.extname(item).toLowerCase() === ".pth");
  const reference = selected.find((item) => [".wav", ".mp3", ".flac", ".ogg", ".m4a"].includes(path.extname(item).toLowerCase()));
  if (!gpt || !sovits || !reference) throw new Error("请选择一份 .ckpt、一份 .pth 和一份参考音频。");
  return { gpt, sovits, reference };
}

async function assertRegularFile(filePath, minimumBytes) {
  const stat = await fs.lstat(filePath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < minimumBytes) throw new Error(`导入文件无效：${path.basename(filePath)}`);
  return stat;
}

export async function importGptSovitsProfile(baseDir, input = {}, filePaths = []) {
  const selected = classifyImportFiles(filePaths);
  const id = safeProfileId(input.id || input.name);
  if (GPT_SOVITS_PROFILES.some((item) => item.id === id)) throw new Error("不能覆盖内置声线。");
  const name = String(input.name || "").trim().slice(0, 80);
  const promptText = String(input.promptText || "").trim().slice(0, 500);
  if (!name || !promptText) throw new Error("请填写声线名称和与参考音频完全一致的文字。");
  const sourceUrl = safeWebUrl(input.sourceUrl);
  const entries = [
    { role: "gpt", source: selected.gpt, name: "gpt.ckpt", minimum: 1024 * 1024 },
    { role: "sovits", source: selected.sovits, name: "sovits.pth", minimum: 1024 * 1024 },
    { role: "reference", source: selected.reference, name: `reference${path.extname(selected.reference).toLowerCase()}`, minimum: 44 }
  ];
  const root = profileRoot(baseDir, id);
  await fs.mkdir(root, { recursive: true });
  const files = [];
  for (const entry of entries) {
    const stat = await assertRegularFile(entry.source, entry.minimum);
    const destination = path.join(root, entry.name);
    await fs.copyFile(entry.source, destination);
    files.push({ role: entry.role, name: entry.name, size: stat.size, sha256: await sha256(destination) });
  }
  const profile = {
    id,
    name,
    author: String(input.author || "用户导入").trim().slice(0, 80),
    description: String(input.description || "从本地文件导入的 GPT-SoVITS 角色声线。 ").trim().slice(0, 400),
    version: String(input.version || "v2ProPlus").trim().slice(0, 40),
    license: String(input.license || "请以来源网页标注为准").trim().slice(0, 300),
    sourceUrl,
    promptText,
    promptLang: ["zh", "ja", "en", "ko", "yue"].includes(input.promptLang) ? input.promptLang : "zh",
    textLang: ["zh", "ja", "en", "ko", "yue", "auto"].includes(input.textLang) ? input.textLang : "zh",
    imported: true,
    files
  };
  const profiles = await loadImportedProfiles(baseDir);
  const next = [...profiles.filter((item) => item.id !== id), profile];
  await saveImportedProfiles(baseDir, next);
  return getGptSovitsProfileStatus(baseDir, id, { verifyHash: true });
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

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { promisify } from "node:util";

const require = createRequire(import.meta.url);
const execFileAsync = promisify(execFile);
const loadedEngines = new Map();

export const LOCAL_VOICE_PACKS = [
  {
    id: "sherpa-zh-ll",
    name: "中文多音色 · Zh-LL",
    description: "5 个可切换中文音色，完全离线，适合日常短回复。",
    language: "zh-CN",
    engine: "sherpa-onnx-vits",
    archiveName: "sherpa-onnx-vits-zh-ll.tar.bz2",
    directoryName: "sherpa-onnx-vits-zh-ll",
    downloadUrl: "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/sherpa-onnx-vits-zh-ll.tar.bz2",
    modelSizeMB: 115,
    downloadSizeMB: 106,
    license: "模型包内 LICENSE 为准",
    sourceUrl: "https://k2-fsa.github.io/sherpa/onnx/tts/pretrained_models/vits.html",
    speakers: [
      { id: 0, name: "音色 1" },
      { id: 1, name: "音色 2" },
      { id: 2, name: "音色 3" },
      { id: 3, name: "音色 4" },
      { id: 4, name: "音色 5" }
    ]
  },
  {
    id: "sherpa-melo-zh-en",
    name: "中英双语 · MeloTTS",
    description: "单音色中英双语模型，英文仅覆盖词典中的词。",
    language: "zh-CN/en",
    engine: "sherpa-onnx-vits",
    archiveName: "vits-melo-tts-zh_en.tar.bz2",
    directoryName: "vits-melo-tts-zh_en",
    downloadUrl: "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-melo-tts-zh_en.tar.bz2",
    modelSizeMB: 163,
    downloadSizeMB: 155,
    license: "模型包内 LICENSE 为准",
    sourceUrl: "https://k2-fsa.github.io/sherpa/onnx/tts/pretrained_models/vits.html",
    speakers: [{ id: 0, name: "默认音色" }]
  }
];

function requirePack(packId) {
  const pack = LOCAL_VOICE_PACKS.find((item) => item.id === packId);
  if (!pack) throw new Error("未知的本地语音包。");
  return pack;
}

function getPaths(baseDir, pack) {
  const root = path.join(baseDir, "agent-data", "tts-models");
  const packDir = path.join(root, pack.directoryName);
  return {
    root,
    packDir,
    archivePath: path.join(root, pack.archiveName),
    model: path.join(packDir, "model.onnx"),
    tokens: path.join(packDir, "tokens.txt"),
    lexicon: path.join(packDir, "lexicon.txt"),
    dateFst: path.join(packDir, "date.fst"),
    phoneFst: path.join(packDir, "phone.fst"),
    numberFst: path.join(packDir, "number.fst")
  };
}

async function fileSize(file) {
  return fs.stat(file).then((stat) => stat.size).catch(() => 0);
}

export async function getLocalTtsStatus(baseDir, packId = LOCAL_VOICE_PACKS[0].id) {
  const pack = requirePack(packId);
  const paths = getPaths(baseDir, pack);
  const [modelSize, tokensSize, lexiconSize] = await Promise.all([
    fileSize(paths.model), fileSize(paths.tokens), fileSize(paths.lexicon)
  ]);
  const installed = modelSize >= pack.modelSizeMB * 0.9 * 1024 * 1024 && tokensSize > 100 && lexiconSize > 1000;
  return { ...pack, installed, modelSize, root: paths.root, packDir: paths.packDir };
}

export async function listLocalTtsPacks(baseDir) {
  return Promise.all(LOCAL_VOICE_PACKS.map((pack) => getLocalTtsStatus(baseDir, pack.id)));
}

function describeDownloadError(error) {
  if (error?.cause?.code === "UND_ERR_CONNECT_TIMEOUT") return "连接服务器超时";
  if (error?.name === "TimeoutError" || error?.name === "AbortError") return "下载超时";
  return error instanceof Error ? error.message : String(error);
}

async function downloadFile(url, destination, onProgress, fetchImpl) {
  const partial = `${destination}.part`;
  await fs.unlink(partial).catch(() => {});
  try {
    const response = await fetchImpl(url, {
      headers: { "user-agent": "V-Manager" },
      signal: AbortSignal.timeout(45 * 60 * 1000)
    });
    if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
    const total = Number(response.headers.get("content-length")) || 0;
    const reader = response.body.getReader();
    const handle = await fs.open(partial, "w");
    let received = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await handle.write(value);
        received += value.byteLength;
        onProgress?.({ phase: "voice-pack", packId: "", received, total, percent: total ? Math.round(received / total * 100) : 0 });
      }
      await handle.sync();
    } finally {
      await handle.close();
    }
    if (total && total !== received) throw new Error(`下载不完整：应为 ${total} 字节，实际为 ${received} 字节`);
    await fs.rename(partial, destination);
  } catch (error) {
    await fs.unlink(partial).catch(() => {});
    throw error;
  }
}

export async function installLocalTtsPack(baseDir, packId, onProgress, fetchImpl = fetch, extractImpl = null) {
  if (process.platform !== "win32" && !extractImpl) throw new Error("当前自动安装仅支持 Windows。");
  const pack = requirePack(packId);
  const paths = getPaths(baseDir, pack);
  const current = await getLocalTtsStatus(baseDir, packId);
  if (current.installed) return current;
  await fs.mkdir(paths.root, { recursive: true });
  onProgress?.({ phase: "voice-pack", packId, received: 0, total: 0, percent: 0 });
  try {
    await downloadFile(pack.downloadUrl, paths.archivePath, (progress) => onProgress?.({ ...progress, packId }), fetchImpl);
    if (extractImpl) {
      await extractImpl(paths.archivePath, paths.root, pack);
    } else {
      await execFileAsync("tar.exe", ["-xjf", paths.archivePath, "-C", paths.root], {
        windowsHide: true,
        timeout: 5 * 60 * 1000,
        maxBuffer: 2 * 1024 * 1024
      });
    }
  } catch (error) {
    throw new Error(`本地语音包安装失败：${describeDownloadError(error)}。可手动下载 ${pack.archiveName} 后解压到 ${paths.root}。`);
  } finally {
    await fs.unlink(paths.archivePath).catch(() => {});
  }
  const status = await getLocalTtsStatus(baseDir, packId);
  if (!status.installed) throw new Error("语音包解压完成，但模型文件未通过完整性检查。");
  return status;
}

function toWav(samples, sampleRate) {
  const pcmBytes = samples.length * 2;
  const wav = Buffer.alloc(44 + pcmBytes);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + pcmBytes, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(pcmBytes, 40);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, Number(samples[index]) || 0));
    wav.writeInt16LE(sample < 0 ? Math.round(sample * 32768) : Math.round(sample * 32767), 44 + index * 2);
  }
  return wav;
}

async function getEngine(baseDir, packId) {
  const status = await getLocalTtsStatus(baseDir, packId);
  if (!status.installed) throw new Error("请先在语音设置中安装所选本地语音包。");
  const cacheKey = `${path.resolve(baseDir)}:${packId}`;
  if (loadedEngines.has(cacheKey)) return loadedEngines.get(cacheKey);
  const paths = getPaths(baseDir, status);
  const promise = (async () => {
    const sherpa = require("sherpa-onnx-node");
    const ruleFsts = [paths.dateFst, paths.phoneFst, paths.numberFst]
      .filter((file) => file)
      .join(",");
    const engine = await sherpa.OfflineTts.createAsync({
      model: {
        vits: { model: paths.model, tokens: paths.tokens, lexicon: paths.lexicon },
        debug: false,
        numThreads: Math.max(1, Math.min(4, Number(process.env.NUMBER_OF_PROCESSORS) || 2)),
        provider: "cpu"
      },
      maxNumSentences: 1,
      ruleFsts
    });
    return { engine, sherpa };
  })();
  loadedEngines.set(cacheKey, promise);
  try { return await promise; }
  catch (error) { loadedEngines.delete(cacheKey); throw error; }
}

export async function synthesizeLocalSpeech(baseDir, voiceConfig, inputText) {
  const text = String(inputText || "")
    .replace(/\[(?:whispers?|laughs?|sighs?|excited|sad|angry|curious|surprised)\]/gi, "")
    .trim()
    .slice(0, 2000);
  if (!text) throw new Error("没有可合成的文字。");
  const packId = voiceConfig.localPackId || LOCAL_VOICE_PACKS[0].id;
  const status = await getLocalTtsStatus(baseDir, packId);
  const speakerId = Math.max(0, Math.min(status.speakers.length - 1, Number(voiceConfig.localSpeakerId) || 0));
  const speed = Math.max(0.7, Math.min(1.3, Number(voiceConfig.localSpeed) || 1));
  const silenceScale = Math.max(0, Math.min(1, Number(voiceConfig.localSilenceScale) || 0.2));
  const { engine, sherpa } = await getEngine(baseDir, packId);
  const audio = await engine.generateAsync({
    text,
    enableExternalBuffer: true,
    generationConfig: new sherpa.GenerationConfig({ sid: speakerId, speed, silenceScale })
  });
  if (!audio?.samples?.length) throw new Error("本地语音模型没有生成有效音频。");
  const wav = toWav(audio.samples, audio.sampleRate);
  return {
    audioBase64: wav.toString("base64"),
    mimeType: "audio/wav",
    requestId: `local-${Date.now()}`,
    characterCost: "0",
    provider: "local",
    packId,
    speakerId
  };
}

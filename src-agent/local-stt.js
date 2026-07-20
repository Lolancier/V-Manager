import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const RELEASE_API = "https://api.github.com/repos/ggml-org/whisper.cpp/releases/latest";
const MODEL_FILES = {
  "base-q5_1": "ggml-base-q5_1.bin",
  "small-q5_1": "ggml-small-q5_1.bin"
};
const MODEL_MIN_BYTES = {
  "base-q5_1": 40 * 1024 * 1024,
  "small-q5_1": 120 * 1024 * 1024
};

function getSttPaths(baseDir, modelId = "small-q5_1") {
  const root = path.join(baseDir, "agent-data", "stt-models");
  return {
    root,
    runtimeDir: path.join(root, "whisper.cpp"),
    modelPath: path.join(root, MODEL_FILES[modelId] || MODEL_FILES["small-q5_1"]),
    tempDir: path.join(baseDir, "agent-data", "temp", "stt")
  };
}

async function findFile(directory, fileName, depth = 0) {
  if (depth > 4) return "";
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === fileName.toLowerCase()) return target;
    if (entry.isDirectory()) {
      const nested = await findFile(target, fileName, depth + 1);
      if (nested) return nested;
    }
  }
  return "";
}

function describeDownloadError(error) {
  if (error?.cause?.code === "UND_ERR_CONNECT_TIMEOUT") return "连接服务器超时";
  if (error?.name === "TimeoutError" || error?.name === "AbortError") return "下载超时";
  return error instanceof Error ? error.message : String(error);
}

async function downloadFile(url, destination, onProgress, phase, fetchImpl = fetch) {
  const partialPath = `${destination}.part`;
  await fs.unlink(partialPath).catch(() => {});
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(30 * 60 * 1000) });
    if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
    const total = Number(response.headers.get("content-length")) || 0;
    const reader = response.body.getReader();
    const handle = await fs.open(partialPath, "w");
    let received = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await handle.write(value);
        received += value.byteLength;
        onProgress?.({ phase, received, total, percent: total ? Math.round((received / total) * 100) : 0 });
      }
      await handle.sync();
    } finally {
      await handle.close();
    }
    if (total && received !== total) {
      throw new Error(`下载不完整：应为 ${total} 字节，实际收到 ${received} 字节`);
    }
    await fs.rename(partialPath, destination);
  } catch (error) {
    await fs.unlink(partialPath).catch(() => {});
    throw error;
  }
}

async function downloadFromSources(urls, destination, onProgress, phase, fetchImpl) {
  const failures = [];
  for (const url of urls) {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        await downloadFile(url, destination, onProgress, phase, fetchImpl);
        return;
      } catch (error) {
        failures.push(describeDownloadError(error));
        console.warn(`[local-stt] download attempt ${attempt} failed for ${new URL(url).host}:`, error);
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1200));
      }
    }
  }
  throw new Error(`所有下载源均连接失败：${failures.at(-1) || "未知网络错误"}`);
}

async function downloadWhisperRuntime(paths, onProgress, fetchImpl) {
  await fs.mkdir(paths.root, { recursive: true });
  const archivePath = path.join(paths.root, "whisper-bin-x64.zip");
  const archiveExists = await fs.access(archivePath).then(() => true).catch(() => false);
  if (!archiveExists) {
    const release = await fetchImpl(RELEASE_API, {
      headers: { accept: "application/vnd.github+json", "user-agent": "V-Manager" },
      signal: AbortSignal.timeout(30000)
    });
    if (!release.ok) throw new Error(`无法读取 whisper.cpp 版本：HTTP ${release.status}`);
    const data = await release.json();
    const asset = data.assets?.find((item) => item.name === "whisper-bin-x64.zip");
    if (!asset?.browser_download_url) throw new Error("whisper.cpp 未提供 Windows x64 运行包。");
    await downloadFromSources([asset.browser_download_url], archivePath, onProgress, "runtime", fetchImpl);
  }
  await fs.mkdir(paths.runtimeDir, { recursive: true });
  const quotePowerShellLiteral = (value) => `'${String(value).replaceAll("'", "''")}'`;
  const extractCommand = [
    "Expand-Archive",
    `-LiteralPath ${quotePowerShellLiteral(archivePath)}`,
    `-DestinationPath ${quotePowerShellLiteral(paths.runtimeDir)}`,
    "-Force"
  ].join(" ");
  try {
    await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      extractCommand
    ], { windowsHide: true, timeout: 120000 });
    await fs.unlink(archivePath).catch(() => {});
  } catch (error) {
    await fs.unlink(archivePath).catch(() => {});
    console.error("[local-stt] whisper.cpp runtime extraction failed:", error);
    throw new Error("whisper.cpp 运行时解压失败，已清理损坏的安装包，请重试安装。");
  }
}

export async function getLocalSttStatus(baseDir, modelId = "small-q5_1") {
  const paths = getSttPaths(baseDir, modelId);
  const executablePath = await findFile(paths.runtimeDir, "whisper-cli.exe");
  const modelSize = await fs.stat(paths.modelPath).then((stat) => stat.size).catch(() => 0);
  const modelInstalled = modelSize >= (MODEL_MIN_BYTES[modelId] || MODEL_MIN_BYTES["small-q5_1"]);
  return {
    installed: Boolean(executablePath && modelInstalled),
    runtimeInstalled: Boolean(executablePath),
    modelInstalled,
    modelSize,
    executablePath,
    modelPath: paths.modelPath,
    root: paths.root,
    modelId
  };
}

export async function installLocalStt(baseDir, modelId = "small-q5_1", onProgress, fetchImpl = fetch) {
  const paths = getSttPaths(baseDir, modelId);
  await fs.mkdir(paths.root, { recursive: true });
  let status = await getLocalSttStatus(baseDir, modelId);
  if (!status.runtimeInstalled) {
    onProgress?.({ phase: "runtime", received: 0, total: 0, percent: 0 });
    await downloadWhisperRuntime(paths, onProgress, fetchImpl);
  }
  if (!status.modelInstalled) {
    const modelFile = MODEL_FILES[modelId] || MODEL_FILES["small-q5_1"];
    const modelUrls = [
      `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${modelFile}?download=true`,
      `https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/${modelFile}?download=true`
    ];
    onProgress?.({ phase: "model", received: 0, total: 0, percent: 0 });
    try {
      await downloadFromSources(modelUrls, paths.modelPath, onProgress, "model", fetchImpl);
    } catch (error) {
      throw new Error(
        `模型下载失败：${describeDownloadError(error)}。也可以手动下载 ${modelFile}，放入 ${paths.root} 后再次点击安装。`
      );
    }
  }
  status = await getLocalSttStatus(baseDir, modelId);
  if (!status.installed) throw new Error("本地语音模型安装后未通过完整性检查。");
  return status;
}

export async function transcribeLocalSpeech(baseDir, audioBytes, { modelId = "small-q5_1", language = "zh" } = {}) {
  if (process.platform !== "win32") throw new Error("当前本地语音输入仅支持 Windows。");
  const status = await getLocalSttStatus(baseDir, modelId);
  if (!status.installed) throw new Error("请先在语音设置中安装本地 Whisper 模型。");
  if (!audioBytes?.byteLength) throw new Error("没有收到有效录音。");
  if (audioBytes.byteLength > 30 * 1024 * 1024) throw new Error("单次录音过长，请控制在 60 秒以内。");

  const paths = getSttPaths(baseDir, modelId);
  await fs.mkdir(paths.tempDir, { recursive: true });
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const audioPath = path.join(paths.tempDir, `${id}.wav`);
  const outputBase = path.join(paths.tempDir, id);
  const outputPath = `${outputBase}.txt`;
  await fs.writeFile(audioPath, Buffer.from(audioBytes));
  try {
    await execFileAsync(status.executablePath, [
      "-m", status.modelPath,
      "-f", audioPath,
      "-l", language,
      "-otxt",
      "-of", outputBase,
      "-np",
      "-nt"
    ], { windowsHide: true, timeout: 180000, maxBuffer: 4 * 1024 * 1024 });
    const text = (await fs.readFile(outputPath, "utf8")).trim();
    if (!text) throw new Error("没有识别到清晰语音，请靠近麦克风后重试。");
    return { text, modelId, language };
  } finally {
    await Promise.all([
      fs.unlink(audioPath).catch(() => {}),
      fs.unlink(outputPath).catch(() => {})
    ]);
  }
}

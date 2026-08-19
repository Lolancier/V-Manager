import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const starts = new Map();
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(moduleDir, "..");

function endpointUrl(value) {
  const endpoint = new URL(String(value || "http://127.0.0.1:9880"));
  if (endpoint.protocol !== "http:" || !["127.0.0.1", "localhost", "::1", "[::1]"].includes(endpoint.hostname)) {
    throw new Error("GPT-SoVITS 只能自动启动本机回环地址。");
  }
  return endpoint;
}

export async function isGptSovitsServiceReady(baseUrl, fetchImpl = fetch) {
  try {
    const response = await fetchImpl(new URL("/docs", endpointUrl(baseUrl)), {
      signal: AbortSignal.timeout(2_000)
    });
    return response.ok;
  } catch {
    return false;
  }
}

// Resolve a usable GPT-SoVITS runtime root by auto-discovery. `roots` is an
// ordered candidate list (e.g. the dev project root, a configured override, or
// app.getAppPath()); the first candidate that contains a usable runtime wins.
//
// A usable runtime requires both the start script and the bundled conda python:
//   <root>/scripts/start-gpt-sovits.ps1
//   <root>/third_party/GPT-SoVITS/.conda/python.exe
//
// Each candidate may be either a project root itself or any descendant such as
// the GPT-SoVITS checkout folder (D:\V-Manager\third_party\GPT-SoVITS, or a
// self-contained <target>/third_party/GPT-SoVITS): we walk up a few levels to
// find the ancestor carrying scripts/ + third_party/GPT-SoVITS.
export async function resolveRuntimeRoot(roots) {
  const seen = new Set();
  for (const root of roots ?? []) {
    const value = root && String(root).trim();
    if (!value) continue;
    for (let current = path.resolve(value), depth = 0; depth <= 4; depth += 1, current = path.dirname(current)) {
      if (seen.has(current)) break;
      seen.add(current);
      if (await isUsableRuntime(current)) return current;
      const parent = path.dirname(current);
      if (parent === current) break; // reached the drive root
    }
  }
  return null;
}

async function isUsableRuntime(root) {
  try {
    const [script, python] = await Promise.all([
      fs.stat(path.join(root, "scripts", "start-gpt-sovits.ps1")).then((s) => s.isFile()).catch(() => false),
      fs.stat(path.join(root, "third_party", "GPT-SoVITS", ".conda", "python.exe")).then((s) => s.isFile()).catch(() => false)
    ]);
    return script && python;
  } catch {
    return false;
  }
}

async function startWorkspaceRuntime(_endpoint, runtimeRoot, candidates) {
  if (process.platform !== "win32") throw new Error("当前自动启动脚本仅支持 Windows。");
  const root = await resolveRuntimeRoot([projectRoot, runtimeRoot, ...(Array.isArray(candidates) ? candidates : [])]);
  if (!root) {
    throw new Error(
      "没有找到已准备好的 GPT-SoVITS 本地运行环境。"
      + "请在“语音与 ASMR → GPT-SoVITS 角色声线”的 GPT-SoVITS 运行目录中填写含 third_party/GPT-SoVITS 的项目根，"
      + "或直接指向 GPT-SoVITS 本体目录（如 …\\third_party\\GPT-SoVITS），"
      + "或先在项目目录运行 npm run tts:gpt-sovits:start。"
    );
  }
  const runtimeDir = path.join(root, "third_party", "GPT-SoVITS");
  const scriptPath = path.join(root, "scripts", "start-gpt-sovits.ps1");
  const runtimePython = path.join(runtimeDir, ".conda", "python.exe");
  if (!await fs.stat(scriptPath).then((stat) => stat.isFile()).catch(() => false)
    || !await fs.stat(runtimePython).then((stat) => stat.isFile()).catch(() => false)) {
    throw new Error(
      "没有找到已准备好的 GPT-SoVITS 本地运行环境。"
      + "本机会先自动查找已安装的 GPT-SoVITS；如果确实没有，请在“语音与 ASMR → GPT-SoVITS 角色声线”的 GPT-SoVITS 运行目录中指向项目根或其 GPT-SoVITS 本体目录，"
      + "或先在项目目录运行 npm run tts:gpt-sovits:start。"
    );
  }

  await new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", [
      "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath
    ], { cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    const append = (chunk) => { output = `${output}${chunk}`.slice(-4_000); };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("GPT-SoVITS 启动超过 135 秒仍未就绪。"));
    }, 135_000);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(`GPT-SoVITS 启动失败（退出码 ${code}）${output.trim() ? `：${output.trim()}` : ""}`));
    });
  });
  return root;
}

export async function ensureGptSovitsService(baseUrl, { fetchImpl = fetch, startImpl = startWorkspaceRuntime, runtimeRoot, candidates } = {}) {
  const endpoint = endpointUrl(baseUrl);
  if (await isGptSovitsServiceReady(endpoint, fetchImpl)) return { ready: true, started: false };

  const key = `${endpoint.origin}|${runtimeRoot || "auto"}|${(candidates || []).join(",")}`;
  if (!starts.has(key)) {
    const task = (async () => {
      const resolved = await startImpl(endpoint, runtimeRoot, candidates);
      if (!await isGptSovitsServiceReady(endpoint, fetchImpl)) {
        throw new Error(`GPT-SoVITS 已执行启动脚本，但 ${endpoint.origin} 仍无法访问。`);
      }
      return { ready: true, started: true, runtimeRoot: resolved ?? null };
    })().finally(() => starts.delete(key));
    starts.set(key, task);
  }
  return starts.get(key);
}

// Directories not carried over when a run is duplicated to a fresh target. The
// .git history is unnecessary for a runtime, logs are disposable, and bytecode/
// caches are regenerated on first run.
const RUNTIME_INSTALL_IGNORED = new Set([
  ".git",
  "__pycache__",
  ".pytest_cache",
  "vmanager-api.log",
  "vmanager-api.stderr.log",
  "vmanager-api.stdout.log"
]);

async function walkBytes(root, ignore, onFile) {
  let total = 0;
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (ignore.has(entry.name)) continue;
    const child = path.join(root, entry.name);
    if (entry.isDirectory()) {
      total += await walkBytes(child, ignore, onFile);
    } else if (entry.isFile()) {
      const stat = await fs.stat(child);
      total += stat.size;
      onFile?.(child, stat.size);
    }
  }
  return total;
}

async function copyRuntimeTree(source, target, ignore, progress) {
  await fs.mkdir(target, { recursive: true });
  const entries = await fs.readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    if (ignore.has(entry.name)) continue;
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) {
      await copyRuntimeTree(from, to, ignore, progress);
    } else if (entry.isFile()) {
      await fs.copyFile(from, to);
      const size = (await fs.stat(from)).size;
      progress.copied += size;
      progress.emit();
    }
  }
}

// Build a self-contained GPT-SoVITS runtime under targetRoot by duplicating the
// validated source checkout (official clone + bundled conda env + pretrained
// weights). The resulting layout mirrors the project so the existing discovery
// (<root>/third_party/GPT-SoVITS/.conda/python.exe and <root>/scripts/start-gpt-
// sovits.ps1) and the relative-path start script both keep working without
// rewrites:
//
//   <targetRoot>/third_party/GPT-SoVITS/...   (the full runtime copy)
//   <targetRoot>/scripts/start-gpt-sovits.ps1
//
// An existing usable runtime at targetRoot is never overwritten.
export async function installGptSovitsRuntime(targetRoot, { sourceRoot = projectRoot, onProgress } = {}) {
  const root = String(targetRoot || "").trim();
  if (!root) throw new Error("请选择 GPT-SoVITS 安装目标目录。");
  if (await isUsableRuntime(root)) {
    throw new Error("目标目录已经包含可用的 GPT-SoVITS 运行环境，无需重新安装。");
  }
  const source = path.join(sourceRoot, "third_party", "GPT-SoVITS");
  if (!await isUsableRuntime(sourceRoot)) {
    throw new Error(
      "本机缺少可复制的 GPT-SoVITS 运行环境（需 third_party/GPT-SoVITS/.conda 与 scripts/start-gpt-sovits.ps1）。"
    );
  }

  const target = path.join(root, "third_party", "GPT-SoVITS");
  const total = await walkBytes(source, RUNTIME_INSTALL_IGNORED);
  const progress = { copied: 0, total, emit() {
    if (typeof onProgress !== "function") return;
    const bytes = progress.copied;
    const percent = total > 0 ? Math.min(100, Math.round((bytes / total) * 100)) : 0;
    const mb = Math.round(bytes / (1024 * 1024));
    onProgress({ percent, copiedMb: mb, totalMb: total > 0 ? Math.round(total / (1024 * 1024)) : 0 });
  } };

  await copyRuntimeTree(source, target, RUNTIME_INSTALL_IGNORED, progress);
  const startSource = path.join(sourceRoot, "scripts", "start-gpt-sovits.ps1");
  const startTarget = path.join(root, "scripts", "start-gpt-sovits.ps1");
  await fs.mkdir(path.dirname(startTarget), { recursive: true });
  await fs.copyFile(startSource, startTarget);

  if (!await isUsableRuntime(root)) {
    throw new Error("运行环境复制完成，但结构校验未通过（缺少关键文件）。");
  }
  progress.emit();
  return root;
}

export async function stopGptSovitsService(baseUrl, fetchImpl = fetch) {
  const endpoint = endpointUrl(baseUrl);
  if (!await isGptSovitsServiceReady(endpoint, fetchImpl)) return { ready: false, stopped: false };
  try {
    await fetchImpl(new URL("/control?command=exit", endpoint), {
      signal: AbortSignal.timeout(5_000)
    });
  } catch {
    // api_v2 may close the socket before returning a response when exiting.
  }
  for (let attempt = 0; attempt < 16; attempt += 1) {
    if (!await isGptSovitsServiceReady(endpoint, fetchImpl)) return { ready: false, stopped: true };
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`GPT-SoVITS 没有在规定时间内关闭：${endpoint.origin}`);
}

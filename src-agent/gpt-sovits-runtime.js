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

async function startWorkspaceRuntime() {
  if (process.platform !== "win32") throw new Error("当前自动启动脚本仅支持 Windows。");
  const scriptPath = path.join(projectRoot, "scripts", "start-gpt-sovits.ps1");
  const runtimePython = path.join(projectRoot, "third_party", "GPT-SoVITS", ".conda", "python.exe");
  if (!await fs.stat(scriptPath).then((stat) => stat.isFile()).catch(() => false)
    || !await fs.stat(runtimePython).then((stat) => stat.isFile()).catch(() => false)) {
    throw new Error("没有找到已准备好的 GPT-SoVITS 本地运行环境。请先运行 npm run tts:gpt-sovits:start。");
  }

  await new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", [
      "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath
    ], { cwd: projectRoot, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
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
}

export async function ensureGptSovitsService(baseUrl, { fetchImpl = fetch, startImpl = startWorkspaceRuntime } = {}) {
  const endpoint = endpointUrl(baseUrl);
  if (await isGptSovitsServiceReady(endpoint, fetchImpl)) return { ready: true, started: false };

  const key = endpoint.origin;
  if (!starts.has(key)) {
    const task = (async () => {
      await startImpl(endpoint);
      if (!await isGptSovitsServiceReady(endpoint, fetchImpl)) {
        throw new Error(`GPT-SoVITS 已执行启动脚本，但 ${endpoint.origin} 仍无法访问。`);
      }
      return { ready: true, started: true };
    })().finally(() => starts.delete(key));
    starts.set(key, task);
  }
  return starts.get(key);
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

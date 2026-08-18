// Developer verification for the GPT-SoVITS runtime installer.
//
// Usage:
//   node scripts/verify-gpt-sovits-install.mjs <targetRoot>
//
// Copies the current validated blueprint (third_party/GPT-SoVITS + the start
// script) into <targetRoot> using the same installGptSovitsRuntime path the GUI
// wizard drives, then proves the relocated conda interpreter still imports torch
// and CUDA from the new location. This is the "reuse the working environment"
// feasibility check behind the wizard.
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(moduleDir, "..");
const { installGptSovitsRuntime } = await import(pathToFileURL(path.join(projectRoot, "src-agent", "gpt-sovits-runtime.js")).href);

const targetRoot = process.argv[2]?.trim();
if (!targetRoot) {
  console.error("用法: node scripts/verify-gpt-sovits-install.mjs <目标目录>");
  process.exit(2);
}

const started = Date.now();
console.log(`[1/3] 复制运行环境到: ${targetRoot}`);
const result = await installGptSovitsRuntime(targetRoot, {
  sourceRoot: projectRoot,
  onProgress: ({ percent, copiedMb, totalMb }) => {
    if (percent % 10 === 0 || percent === 100) console.log(`  进度 ${percent}% (${copiedMb}/${totalMb} MB)`);
  }
});
console.log(`  复制完成，耗时 ${((Date.now() - started) / 1000).toFixed(1)}s`);
if (result !== targetRoot) throw new Error("installGptSovitsRuntime 返回的目录与目标不一致");

console.log("[2/3] 验证复制后的目录结构…");
const python = path.join(targetRoot, "third_party", "GPT-SoVITS", ".conda", "python.exe");
for (const required of [
  python,
  path.join(targetRoot, "scripts", "start-gpt-sovits.ps1"),
  path.join(targetRoot, "third_party", "GPT-SoVITS", "api_v2.py")
]) {
  if (!await fs.stat(required).then((s) => s.isFile()).catch(() => false)) {
    throw new Error(`缺少关键文件: ${required}`);
  }
}
console.log("  结构校验通过");

console.log("[3/3] 用新位置的解释器验证 torch + CUDA…");
const probe = `import sys, torch; print('python', sys.version.split()[0]); print('torch', torch.__version__); print('cuda_available', torch.cuda.is_available()); print('cuda_device', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'n/a')`;
await new Promise((resolve, reject) => {
  const child = spawn(python, ["-c", probe], { cwd: targetRoot, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  child.stdout.on("data", (c) => { out += c; process.stdout.write(c); });
  child.stderr.on("data", (c) => { out += c; process.stderr.write(c); });
  child.once("error", reject);
  child.once("exit", (code) => {
    if (code === 0) resolve();
    else reject(new Error(`重定位后的解释器验证失败（退出码 ${code}）：${out.slice(-1000)}`));
  });
});
console.log(`\n验证通过。可运行的完整 GPT-SoVITS 已安装到:\n  ${targetRoot}`);

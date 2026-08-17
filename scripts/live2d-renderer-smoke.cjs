const { app, BrowserWindow, protocol } = require("electron");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const smokeDataRoot = path.join(os.tmpdir(), "v-manager-live2d-smoke");
fsSync.mkdirSync(smokeDataRoot, { recursive: true });
app.setPath("userData", smokeDataRoot);
app.setPath("cache", path.join(smokeDataRoot, "cache"));
app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");

protocol.registerSchemesAsPrivileged([
  { scheme: "vivi-asset", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
]);

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".json") return "application/json";
  if (extension === ".js") return "application/javascript";
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  return "application/octet-stream";
}

async function main() {
  const watchdog = setTimeout(() => {
    process.stderr.write("Live2D renderer smoke timed out.\n");
    app.exit(1);
  }, 15000);
  await app.whenReady();
  const assetRoot = path.join(projectRoot, "dist");
  protocol.handle("vivi-asset", async (request) => {
    try {
      const url = new URL(request.url);
      if (url.hostname !== "app") return new Response("Not found", { status: 404 });
      const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
      const filePath = path.resolve(assetRoot, ...parts);
      const relative = path.relative(assetRoot, filePath);
      if (!parts.length || relative.startsWith("..") || path.isAbsolute(relative)) {
        return new Response("Forbidden", { status: 403 });
      }
      return new Response(await fs.readFile(filePath), {
        headers: {
          "content-type": contentType(filePath),
          "access-control-allow-origin": "*"
        }
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });

  const win = new BrowserWindow({
    width: 640,
    height: 960,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  });
  const consoleMessages = [];
  win.webContents.on("console-message", (event) => {
    consoleMessages.push({
      level: event.level,
      message: event.message,
      lineNumber: event.lineNumber,
      sourceId: event.sourceId
    });
  });
  await win.loadFile(path.join(assetRoot, "index.html"));
  await new Promise((resolve) => setTimeout(resolve, 5000));
  const renderer = await win.webContents.executeJavaScript(`(() => {
    const canvas = document.querySelector('canvas.official-live2d-stage');
    const status = document.querySelector('.live2d-message');
    return {
      href: location.href,
      canvas: canvas ? { width: canvas.width, height: canvas.height } : null,
      status: status ? { className: status.className, text: status.textContent } : null,
      hasCore: Boolean(window.Live2DCubismCore)
    };
  })()`);
  const textureSecurityErrors = consoleMessages.filter(({ message = "" }) =>
    /texImage2D|cross-origin data|SecurityError/i.test(message)
  );
  const ok = renderer.status?.className.includes("ready") && textureSecurityErrors.length === 0;
  process.stdout.write(`${JSON.stringify({ ok, renderer, textureSecurityErrors, consoleMessages })}\n`);
  win.destroy();
  clearTimeout(watchdog);
  app.exit(ok ? 0 : 1);
}

main().catch((error) => {
  process.stderr.write(`${error?.stack || error}\n`);
  app.exit(1);
});

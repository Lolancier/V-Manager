const path = require("node:path");
const { app, utilityProcess } = require("electron");

app.disableHardwareAcceleration();

const expectedVersions = Object.freeze({
  electron: "43.4.0",
  node: "24.18.1",
  chrome: "150.0.7871.224",
  modules: "148"
});

function assertVersions(scope) {
  for (const [name, expected] of Object.entries(expectedVersions)) {
    const actual = process.versions[name];
    if (actual !== expected) {
      throw new Error(`${scope} ${name} version is ${actual}; expected ${expected}`);
    }
  }
}

let finished = false;

function finish(child, code) {
  if (finished) return;
  finished = true;
  if (child) child.kill();
  app.exit(code);
}

app.whenReady().then(() => {
  let timer;
  const child = utilityProcess.fork(
    path.join(__dirname, "electron-runtime-smoke-worker.cjs"),
    [],
    { serviceName: "V-Manager Electron Runtime Smoke", stdio: "pipe" }
  );

  timer = setTimeout(() => {
    console.error("Electron runtime smoke timed out");
    finish(child, 1);
  }, 15_000);

  child.on("message", (message) => {
    try {
      if (message?.ok !== true) {
        throw new Error(message?.error || "Electron runtime worker failed");
      }
      for (const [name, expected] of Object.entries(expectedVersions)) {
        if (message.versions?.[name] !== expected) {
          throw new Error(
            `worker ${name} version is ${message.versions?.[name]}; expected ${expected}`
          );
        }
      }
      if (message.nativeExports !== true) {
        throw new Error("sherpa-onnx-node native exports are incomplete");
      }

      console.log(JSON.stringify({ ok: true, versions: message.versions, nativeExports: true }));
      clearTimeout(timer);
      finish(child, 0);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      clearTimeout(timer);
      finish(child, 1);
    }
  });

  child.on("error", (error) => {
    console.error(error instanceof Error ? error.message : String(error));
    clearTimeout(timer);
    finish(child, 1);
  });

  child.on("exit", (code) => {
    if (!finished) {
      clearTimeout(timer);
      finish(null, code === null ? 1 : code);
    }
  });

  try {
    assertVersions("main process");
    child.postMessage({ kind: "run" });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    clearTimeout(timer);
    finish(child, 1);
  }
}).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  app.exit(1);
});

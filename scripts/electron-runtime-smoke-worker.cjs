process.parentPort.on("message", (event) => {
  if (event.data?.kind !== "run") return;

  try {
    const sherpa = require("sherpa-onnx-node");
    const requiredExports = ["OfflineTts", "OfflineRecognizer"];
    process.parentPort.postMessage({
      ok: true,
      versions: {
        electron: process.versions.electron,
        node: process.versions.node,
        chrome: process.versions.chrome,
        modules: process.versions.modules
      },
      nativeExports: requiredExports.every((name) => name in sherpa)
    });
  } catch (error) {
    process.parentPort.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

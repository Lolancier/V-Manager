import { app } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { createIsolatedGameDriver } from "../electron/game-playtest-runtime.js";
import { runGamePlaytest } from "../src-agent/game-playtest.js";

await app.whenReady();
const artifactPath = path.resolve(process.argv[2] || "tests/fixtures/playtest-game.html");
const screenshotPath = path.join(app.getPath("temp"), `vivi-playtest-smoke-${Date.now()}.png`);
try {
  const result = await runGamePlaytest({ artifactPath, screenshotPath, maxSeconds: 5, maxActions: 12, createDriver: createIsolatedGameDriver });
  const screenshotBytes = await fs.stat(screenshotPath).then((stat) => stat.size).catch(() => 0);
  console.log(JSON.stringify({ ...result, screenshotBytes }));
  if (!result.ok || screenshotBytes <= 0) process.exitCode = 1;
} finally {
  await fs.rm(screenshotPath, { force: true });
  app.exit(process.exitCode || 0);
}

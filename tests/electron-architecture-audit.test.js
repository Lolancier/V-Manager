import test from "node:test";
import assert from "node:assert/strict";
import { analyzeElectronArchitecture } from "../scripts/electron-architecture-audit.mjs";

const canonicalDeclaration = 'const PRELOAD_PATH = path.join(__dirname, "preload.cjs");';
const canonicalWindow = "new BrowserWindow({ webPreferences: { preload: PRELOAD_PATH, contextIsolation: true } });";
const baseMain = `${canonicalDeclaration}\n${Array.from({ length: 9 }, () => canonicalWindow).join("\n")}`;
const basePackage = {
  main: "electron/main.js",
  devDependencies: { electron: "^32.3.0" },
  build: { files: ["dist/**/*", "electron/**/*"] }
};

function audit(main = baseMain, packageJson = basePackage) {
  return analyzeElectronArchitecture({
    main,
    electronFiles: ["electron/main.js", "electron/preload.cjs"],
    packageJson,
    indexHtml: '<script type="module" src="/src/main.tsx"></script>'
  });
}

test("architecture audit accepts canonical single-line BrowserWindow calls", () => {
  const result = audit();
  assert.equal(result.metrics.browserWindowConstructors, 9);
  assert.equal(result.metrics.browserWindowsUsingCanonicalPreload, 9);
  assert.deepEqual(result.critical, []);
});

test("architecture audit rejects a BrowserWindow created from variable options", () => {
  const result = audit(`${baseMain}\nconst options = { webPreferences: { preload: PRELOAD_PATH } };\nnew BrowserWindow(options);`);
  assert.equal(result.metrics.browserWindowConstructors, 10);
  assert.match(result.critical.join("\n"), /1 个 BrowserWindow 无法确认/);
});

test("architecture audit rejects a single-line noncanonical preload", () => {
  const result = audit(`${baseMain}\nnew BrowserWindow({ title: "preload: PRELOAD_PATH", webPreferences: { preload: otherPreload } });`);
  assert.match(result.critical.join("\n"), /1 个 BrowserWindow 无法确认/);
});

test("architecture audit rejects an unconfigured tenth BrowserWindow", () => {
  const result = audit(`${baseMain}\nnew BrowserWindow({ show: false });`);
  assert.equal(result.metrics.browserWindowConstructors, 10);
  assert.match(result.critical.join("\n"), /1 个 BrowserWindow 无法确认/);
});

test("architecture audit ignores top-level preload when webPreferences uses another path", () => {
  const result = audit(`${baseMain}\nnew BrowserWindow({ preload: PRELOAD_PATH, webPreferences: { preload: otherPreload } });`);
  assert.match(result.critical.join("\n"), /1 个 BrowserWindow 无法确认/);
});

test("architecture audit ignores metadata preload decoys", () => {
  const result = audit(`${baseMain}\nnew BrowserWindow({ metadata: { preload: PRELOAD_PATH }, webPreferences: { preload: otherPreload } });`);
  assert.match(result.critical.join("\n"), /1 个 BrowserWindow 无法确认/);
});

test("architecture audit only analyzes the first BrowserWindow argument", () => {
  const result = audit(`${baseMain}\nnew BrowserWindow(options, { preload: PRELOAD_PATH });`);
  assert.match(result.critical.join("\n"), /1 个 BrowserWindow 无法确认/);
});

test("architecture audit does not count BrowserWindow text in top-level comments or strings", () => {
  const result = audit(`${baseMain}\n// new BrowserWindow({ webPreferences: { preload: otherPreload } });\nconst example = "new BrowserWindow(options)";`);
  assert.equal(result.metrics.browserWindowConstructors, 9);
  assert.deepEqual(result.critical, []);
});

test("architecture audit rejects explicit canonical preload exclusions", () => {
  const packageJson = {
    ...basePackage,
    build: { files: ["dist/**/*", "electron/**/*", "!electron/preload.cjs"] }
  };
  const result = audit(baseMain, packageJson);
  assert.equal(result.metrics.canonicalPreloadExplicitlyExcluded, true);
  assert.match(result.critical.join("\n"), /显式排除了 electron\/preload\.cjs/);
});

test("architecture audit applies FileSet from/to/filter context", () => {
  const packageJson = {
    ...basePackage,
    build: {
      files: [
        "dist/**/*",
        { from: "electron", to: "electron", filter: ["**/*", "!preload.cjs"] }
      ]
    }
  };
  const result = audit(baseMain, packageJson);
  assert.equal(result.metrics.canonicalPreloadExplicitlyExcluded, true);
  assert.match(result.critical.join("\n"), /显式排除了 electron\/preload\.cjs/);
});

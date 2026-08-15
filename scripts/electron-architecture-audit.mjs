const countMatches = (text, pattern) => [...text.matchAll(pattern)].length;

function maskCommentsAndStrings(source) {
  const result = [...source];
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (char === "\n") lineComment = false;
      else result[index] = " ";
      continue;
    }
    if (blockComment) {
      result[index] = char === "\n" ? "\n" : " ";
      if (char === "*" && next === "/") { result[index + 1] = " "; blockComment = false; index += 1; }
      continue;
    }
    if (quote) {
      result[index] = char === "\n" ? "\n" : " ";
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "/" && next === "/") { result[index] = result[index + 1] = " "; lineComment = true; index += 1; continue; }
    if (char === "/" && next === "*") { result[index] = result[index + 1] = " "; blockComment = true; index += 1; continue; }
    if (char === '"' || char === "'" || char === "`") { result[index] = " "; quote = char; }
  }
  return result.join("");
}

function findClosingParenthesis(source, openingIndex) {
  let depth = 0;
  for (let index = openingIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(") depth += 1;
    if (char === ")" && --depth === 0) return index;
  }
  return -1;
}

export function extractBrowserWindowArguments(main) {
  const maskedMain = maskCommentsAndStrings(main);
  const results = [];
  const pattern = /\bnew\s+BrowserWindow\s*\(/g;
  for (const match of maskedMain.matchAll(pattern)) {
    const openingIndex = match.index + match[0].lastIndexOf("(");
    const closingIndex = findClosingParenthesis(maskedMain, openingIndex);
    results.push(closingIndex < 0 ? "" : maskedMain.slice(openingIndex + 1, closingIndex));
  }
  return results;
}

function globMatchesPath(pattern, target) {
  let expression = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === "*" && pattern[index + 1] === "*") {
      if (pattern[index + 2] === "/") { expression += "(?:.*/)?"; index += 2; }
      else { expression += ".*"; index += 1; }
    } else if (char === "*") expression += "[^/]*";
    else if (char === "?") expression += "[^/]";
    else expression += char.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
  }
  return new RegExp(`^${expression}$`).test(target);
}

function collectBuildFilePatterns(files) {
  if (!Array.isArray(files)) return [];
  return files.flatMap((entry) => {
    if (typeof entry === "string") return [entry];
    return entry && Array.isArray(entry.filter) ? entry.filter.filter((item) => typeof item === "string") : [];
  }).map((pattern) => pattern.replaceAll("\\", "/"));
}

export function analyzeElectronArchitecture({ main, electronFiles, packageJson, indexHtml, directElectronImports = [] }) {
  const preloadSources = electronFiles
    .filter((file) => /(?:^|[\\/])preload(?:[.-][^\\/]*)?\.(?:c?js|mjs)$/.test(file))
    .map((file) => file.replaceAll("\\", "/"))
    .sort();
  const windowArguments = extractBrowserWindowArguments(main);
  const insecureWindows = windowArguments.filter((args) => /nodeIntegration:\s*true|contextIsolation:\s*false|webSecurity:\s*false/.test(args));
  const canonicalWindows = windowArguments.filter((args) => /\bpreload\s*:\s*PRELOAD_PATH\b/.test(args));
  const buildPatterns = collectBuildFilePatterns(packageJson.build?.files);
  const positiveBuildPatterns = buildPatterns.filter((pattern) => !pattern.startsWith("!"));
  const negativeBuildPatterns = buildPatterns.filter((pattern) => pattern.startsWith("!")).map((pattern) => pattern.slice(1));
  const canonicalPreloadIncluded = positiveBuildPatterns.some((pattern) => globMatchesPath(pattern, "electron/preload.cjs"));
  const canonicalPreloadExcluded = negativeBuildPatterns.some((pattern) => globMatchesPath(pattern, "electron/preload.cjs"));
  const metrics = {
    electronVersion: packageJson.devDependencies?.electron || packageJson.dependencies?.electron || "missing",
    mainLines: main.split(/\r?\n/).length,
    directMainIpcHandlers: countMatches(main, /ipcMain\.handle\(/g),
    directMainIpcListeners: countMatches(main, /ipcMain\.on\(/g),
    browserWindowConstructors: windowArguments.length,
    directElectronImportsInAgentCore: directElectronImports,
    insecureWindowDefinitions: insecureWindows.length,
    preloadSources,
    browserWindowsUsingCanonicalPreload: canonicalWindows.length,
    canonicalPreloadPackaged: packageJson.main === "electron/main.js" && canonicalPreloadIncluded && !canonicalPreloadExcluded,
    canonicalPreloadExplicitlyExcluded: canonicalPreloadExcluded,
    singleRendererEntrypoint: /src\/main\.tsx/.test(indexHtml)
  };
  const critical = [];
  const warnings = [];
  if (metrics.insecureWindowDefinitions) critical.push(`${metrics.insecureWindowDefinitions} 个 BrowserWindow 使用了不安全的 webPreferences`);
  if (directElectronImports.length) critical.push(`src-agent 仍直接导入 Electron：${directElectronImports.join(", ")}`);
  if (preloadSources.length !== 1 || preloadSources[0] !== "electron/preload.cjs") critical.push(`preload 必须只有 electron/preload.cjs 一个源，当前为：${preloadSources.join(", ") || "无"}`);
  if (!/const PRELOAD_PATH = path\.join\(__dirname, ["']preload\.cjs["']\);/.test(main)) critical.push("主进程未声明 canonical PRELOAD_PATH");
  if (metrics.browserWindowsUsingCanonicalPreload !== metrics.browserWindowConstructors) critical.push(`${metrics.browserWindowConstructors - metrics.browserWindowsUsingCanonicalPreload} 个 BrowserWindow 无法确认使用 canonical PRELOAD_PATH`);
  if (!metrics.canonicalPreloadPackaged) critical.push(metrics.canonicalPreloadExplicitlyExcluded ? "生产打包清单显式排除了 electron/preload.cjs" : "生产打包入口或文件清单未包含 canonical preload");
  if (metrics.mainLines > 1500) warnings.push(`electron/main.js 仍有 ${metrics.mainLines} 行，需要按领域继续拆分`);
  if (metrics.directMainIpcHandlers > 30) warnings.push(`主文件仍直接注册 ${metrics.directMainIpcHandlers} 个 IPC handler`);
  if (metrics.singleRendererEntrypoint) warnings.push("所有窗口共用单一 React 入口，尚未按窗口进行代码分割");
  return { metrics, critical, warnings };
}

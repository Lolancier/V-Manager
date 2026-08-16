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

function findClosingBrace(source, openingIndex) {
  let depth = 0;
  for (let index = openingIndex; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}" && --depth === 0) return index;
  }
  return -1;
}

function splitTopLevel(source) {
  const parts = [];
  let start = 0;
  let braces = 0;
  let brackets = 0;
  let parentheses = 0;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") braces += 1;
    else if (char === "}") braces -= 1;
    else if (char === "[") brackets += 1;
    else if (char === "]") brackets -= 1;
    else if (char === "(") parentheses += 1;
    else if (char === ")") parentheses -= 1;
    else if (char === "," && braces === 0 && brackets === 0 && parentheses === 0) {
      parts.push(source.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(source.slice(start));
  return parts;
}

function readObjectLiteral(source) {
  const trimmed = source.trim();
  if (!trimmed.startsWith("{")) return null;
  const closingIndex = findClosingBrace(trimmed, 0);
  if (closingIndex < 0 || trimmed.slice(closingIndex + 1).trim()) return null;
  return trimmed.slice(1, closingIndex);
}

function getTopLevelProperty(objectBody, property) {
  const matches = splitTopLevel(objectBody).flatMap((part) => {
    const match = part.match(new RegExp(`^\\s*${property}\\s*:`));
    return match ? [part.slice(match[0].length)] : [];
  });
  return matches.length === 1 ? matches[0] : null;
}

function hasDynamicObjectProperties(objectBody) {
  return splitTopLevel(objectBody).some((part) => /^\s*(?:\.\.\.|\[)/.test(part));
}

function usesCanonicalPreload(argumentsText) {
  const firstArgument = splitTopLevel(argumentsText)[0] || "";
  const optionsBody = readObjectLiteral(firstArgument);
  if (optionsBody === null || hasDynamicObjectProperties(optionsBody)) return false;
  const webPreferencesValue = getTopLevelProperty(optionsBody, "webPreferences");
  if (webPreferencesValue === null) return false;
  const webPreferencesBody = readObjectLiteral(webPreferencesValue);
  if (webPreferencesBody === null || hasDynamicObjectProperties(webPreferencesBody)) return false;
  const preloadValue = getTopLevelProperty(webPreferencesBody, "preload");
  return preloadValue !== null && /^\s*PRELOAD_PATH\s*$/.test(preloadValue);
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

function normalizeBuildPath(value) {
  return value.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/$/, "") || ".";
}

function relativeBuildPath(from, target) {
  if (from === ".") return target;
  return target.startsWith(`${from}/`) ? target.slice(from.length + 1) : null;
}

function analyzeBuildFiles(files, target) {
  const result = { included: false, explicitlyExcluded: false, uncertainFileSet: false };
  if (!Array.isArray(files)) return result;
  for (const entry of files) {
    if (typeof entry === "string") {
      const pattern = entry.replaceAll("\\", "/");
      if (pattern.startsWith("!")) result.explicitlyExcluded ||= globMatchesPath(pattern.slice(1), target);
      else result.included ||= globMatchesPath(pattern, target);
      continue;
    }
    if (!entry || typeof entry !== "object" || typeof entry.from !== "string" || typeof entry.to !== "string" || !Array.isArray(entry.filter) || !entry.filter.length || entry.filter.some((item) => typeof item !== "string")) {
      result.uncertainFileSet = true;
      continue;
    }
    const from = normalizeBuildPath(entry.from);
    const to = normalizeBuildPath(entry.to);
    const relative = relativeBuildPath(from, target);
    if (relative === null) continue;
    const destination = to === "." ? relative : `${to}/${relative}`;
    if (destination !== target) continue;
    const filters = entry.filter.map((pattern) => pattern.replaceAll("\\", "/"));
    const positives = filters.filter((pattern) => !pattern.startsWith("!"));
    const negatives = filters.filter((pattern) => pattern.startsWith("!")).map((pattern) => pattern.slice(1));
    const includedByFileSet = positives.some((pattern) => globMatchesPath(pattern, relative));
    const excludedByFileSet = negatives.some((pattern) => globMatchesPath(pattern, relative));
    result.explicitlyExcluded ||= excludedByFileSet;
    result.included ||= includedByFileSet && !excludedByFileSet;
  }
  return result;
}

export function analyzeElectronArchitecture({ main, electronFiles, packageJson, indexHtml, directElectronImports = [], ragSources = {}, scheduleService = "", modelConversationService = "", autonomousCreationService = "" }) {
  const preloadSources = electronFiles
    .filter((file) => /(?:^|[\\/])preload(?:[.-][^\\/]*)?\.(?:c?js|mjs)$/.test(file))
    .map((file) => file.replaceAll("\\", "/"))
    .sort();
  const windowArguments = extractBrowserWindowArguments(main);
  const insecureWindows = windowArguments.filter((args) => /nodeIntegration:\s*true|contextIsolation:\s*false|webSecurity:\s*false/.test(args));
  const canonicalWindows = windowArguments.filter(usesCanonicalPreload);
  const buildFiles = analyzeBuildFiles(packageJson.build?.files, "electron/preload.cjs");
  const utilityBuildFiles = analyzeBuildFiles(packageJson.build?.files, "electron/workers/utility-entry.js");
  const maskedMain = maskCommentsAndStrings(main);
  const ragClientPropagatedThroughCore = /ragClient\s*:\s*payload\.ragClient/.test(ragSources.core || "");
  const ragRoutes = {
    startup: /ragTaskClient\.ensure\s*\(/.test(maskedMain),
    memoryService: /ragClient\s*:\s*ragTaskClient/.test(maskedMain) && /options\.ragClient\.rebuild\s*\(/.test(ragSources.memoryService || ""),
    appExecutor: ragClientPropagatedThroughCore && /context\.ragClient[\s\S]*context\.ragClient\.rebuild\s*\(/.test(ragSources.appExecutor || ""),
    toolExecutor: ragClientPropagatedThroughCore && /context\.ragClient[\s\S]*context\.ragClient\.rebuild\s*\(/.test(ragSources.toolExecutor || "")
  };
  const normalizedElectronFiles = electronFiles.map((file) => file.replaceAll("\\", "/"));
  const directMainScheduleOrchestration = countMatches(maskedMain, /\b(?:scheduleTimer|scheduleTickRunning|tickSchedules|syncScheduleIntegrations|syncWindowsScheduleTasks|publishTodayAgendaOnStartup)\b/g)
    + countMatches(main, /from\s+["'][^"']*(?:schedule-engine|windows-task-scheduler)\.js["']/g)
    + countMatches(main, /ipcMain\.(?:handle|on)\s*\(\s*["']agent:(?:list-schedules|cancel-schedule)["']/g);
  const phase4cChannels = "chat|test-deepseek|generate-persona-card-draft|get-interest-sandbox|run-interest-activity|get-interest-state|cleanup-interest-sandbox|play-interest-game|interrupt-interest-activity|update-interest-location|open-interest-sandbox|open-interest-artifact|open-interest-category";
  const directMainPhase4cIpc = countMatches(main, new RegExp(`ipcMain\\.(?:handle|on)\\s*\\(\\s*["']agent:(?:${phase4cChannels})["']`, "g"));
  const directMainPhase4cOrchestration = directMainPhase4cIpc
    + countMatches(maskedMain, /\b(?:currentInterestActivity|tickInterestSandbox|startInterestSandbox|stopInterestSandbox|runInterestActivity|runAutonomousLifeActivity|buildAgentReply|testDeepSeekConnection|generatePersonaCardDraft)\b/g);
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
    canonicalPreloadPackaged: packageJson.main === "electron/main.js" && buildFiles.included && !buildFiles.explicitlyExcluded && !buildFiles.uncertainFileSet,
    canonicalPreloadExplicitlyExcluded: buildFiles.explicitlyExcluded,
    canonicalPreloadFileSetUncertain: buildFiles.uncertainFileSet,
    utilityProcessImported: /\butilityProcess\b/.test(maskedMain),
    utilitySupervisorConfigured: /createUtilityTaskSupervisor\s*\(/.test(maskedMain) && /utilityProcess\.fork\s*\(/.test(maskedMain),
    utilityEntryDerivedFromModuleUrl: /fileURLToPath\s*\(\s*import\.meta\.url\s*\)/.test(maskedMain) && /resolveUtilityEntryPoint\s*\(\s*__dirname\s*\)/.test(maskedMain),
    utilityWorkerEntrypointPresent: normalizedElectronFiles.includes("electron/workers/utility-entry.js"),
    utilityWorkerPackaged: utilityBuildFiles.included && !utilityBuildFiles.explicitlyExcluded && !utilityBuildFiles.uncertainFileSet,
    directMainRagIndexWrites: countMatches(maskedMain, /\b(?:ensureRagIndexFresh|rebuildKnowledgeIndex|rebuildRagIndex)\s*\(/g),
    mainDataBootstrapDefersRagFiles: /ensureDataFiles\s*\([\s\S]{0,160}?ensureRag\s*:\s*false/.test(maskedMain),
    ragClientPropagatedThroughCore,
    ragWriteRoutes: ragRoutes,
    ragWriteRoutesMigrated: Object.values(ragRoutes).filter(Boolean).length,
    scheduleServicePresent: normalizedElectronFiles.includes("electron/services/schedule-service.js"),
    scheduleServiceConfigured: /createScheduleService\s*\(/.test(maskedMain) && /scheduleService\.start\s*\(/.test(maskedMain) && /scheduleService\.dispose\s*\(/.test(maskedMain),
    scheduleServiceOwnsIpc: /agent:list-schedules/.test(scheduleService) && /agent:cancel-schedule/.test(scheduleService) && /(?:options\.)?trustedIpc\.handle\s*\(/.test(scheduleService),
    scheduleLifecycleOwnedByService: /\bfunction\s+tick\s*\(/.test(scheduleService) && /\bfunction\s+start\s*\(/.test(scheduleService) && /\bfunction\s+stop\s*\(/.test(scheduleService) && /\bfunction\s+snapshot\s*\(/.test(scheduleService) && /setIntervalImpl/.test(scheduleService),
    directMainScheduleOrchestration,
    scheduleClientPropagatedThroughCore: /scheduleClient\s*:\s*payload\.scheduleClient/.test(ragSources.core || "") && /scheduleClient\s*:/.test(maskedMain),
    modelConversationServicePresent: normalizedElectronFiles.includes("electron/services/model-conversation-service.js"),
    modelConversationServiceConfigured: /createModelConversationService\s*\(/.test(maskedMain) && /modelConversationService\.registerIpc\s*\(/.test(maskedMain) && /modelConversationService\.dispose\s*\(/.test(maskedMain),
    modelConversationServiceOwnsIpc: ["agent:chat", "agent:test-deepseek", "agent:generate-persona-card-draft"].every((channel) => modelConversationService.includes(channel)) && /trustedIpc\.handle\s*\(/.test(modelConversationService),
    autonomousCreationServicePresent: normalizedElectronFiles.includes("electron/services/autonomous-creation-service.js"),
    autonomousCreationServiceConfigured: /createAutonomousCreationService\s*\(/.test(maskedMain) && /autonomousCreationService\.registerIpc\s*\(/.test(maskedMain) && /autonomousCreationService\.start\s*\(/.test(maskedMain) && /autonomousCreationService\.dispose\s*\(/.test(maskedMain),
    autonomousCreationServiceOwnsState: /let\s+currentTask\s*=\s*null/.test(autonomousCreationService) && /snapshotConfig\s*\(options\.getConfig\s*\(\s*\)\s*\)/.test(autonomousCreationService) && /personaFor\s*\(config\)/.test(autonomousCreationService),
    autonomousCreationServiceOwnsIpc: ["agent:get-interest-sandbox", "agent:run-interest-activity", "agent:get-interest-state", "agent:cleanup-interest-sandbox", "agent:play-interest-game", "agent:interrupt-interest-activity", "agent:update-interest-location", "agent:open-interest-sandbox", "agent:open-interest-artifact", "agent:open-interest-category"].every((channel) => autonomousCreationService.includes(channel)) && /trustedIpc\.handle\s*\(/.test(autonomousCreationService),
    phase4cServicesElectronFree: !/from\s+["']electron["']|require\s*\(\s*["']electron["']/.test(`${modelConversationService}\n${autonomousCreationService}`),
    modelCancellationPropagated: /signal:\s*payload\.signal/.test(ragSources.core || "") || /payload\.signal/.test(ragSources.core || ""),
    directMainPhase4cIpc,
    directMainPhase4cOrchestration,
    singleRendererEntrypoint: /src\/main\.tsx/.test(indexHtml)
  };
  const critical = [];
  const warnings = [];
  if (metrics.insecureWindowDefinitions) critical.push(`${metrics.insecureWindowDefinitions} 个 BrowserWindow 使用了不安全的 webPreferences`);
  if (directElectronImports.length) critical.push(`src-agent 仍直接导入 Electron：${directElectronImports.join(", ")}`);
  if (preloadSources.length !== 1 || preloadSources[0] !== "electron/preload.cjs") critical.push(`preload 必须只有 electron/preload.cjs 一个源，当前为：${preloadSources.join(", ") || "无"}`);
  if (!/const PRELOAD_PATH = path\.join\(__dirname, ["']preload\.cjs["']\);/.test(main)) critical.push("主进程未声明 canonical PRELOAD_PATH");
  if (metrics.browserWindowsUsingCanonicalPreload !== metrics.browserWindowConstructors) critical.push(`${metrics.browserWindowConstructors - metrics.browserWindowsUsingCanonicalPreload} 个 BrowserWindow 无法确认使用 canonical PRELOAD_PATH`);
  if (!metrics.canonicalPreloadPackaged) critical.push(metrics.canonicalPreloadExplicitlyExcluded ? "生产打包清单显式排除了 electron/preload.cjs" : metrics.canonicalPreloadFileSetUncertain ? "生产打包 FileSet 无法可靠确认包含 canonical preload" : "生产打包入口或文件清单未包含 canonical preload");
  if (!metrics.utilityProcessImported || !metrics.utilitySupervisorConfigured || !metrics.utilityEntryDerivedFromModuleUrl || !metrics.utilityWorkerEntrypointPresent || !metrics.utilityWorkerPackaged) critical.push("RAG utilityProcess 生产入口未完整配置、未从 import.meta.url 定位或未进入打包清单");
  if (metrics.directMainRagIndexWrites) critical.push(`主进程仍直接执行 ${metrics.directMainRagIndexWrites} 个 RAG 写索引调用`);
  if (!metrics.mainDataBootstrapDefersRagFiles) critical.push("主进程数据初始化仍可能直接创建 RAG 索引文件");
  if (metrics.ragWriteRoutesMigrated !== 4) critical.push(`Electron RAG 写索引路径仅迁移 ${metrics.ragWriteRoutesMigrated}/4`);
  if (!metrics.scheduleServicePresent || !metrics.scheduleServiceConfigured || !metrics.scheduleServiceOwnsIpc || !metrics.scheduleLifecycleOwnedByService || !metrics.scheduleClientPropagatedThroughCore) critical.push("日程域服务、IPC、生命周期或聊天工具同步适配未完整迁移");
  if (metrics.directMainScheduleOrchestration) critical.push(`主进程回流了 ${metrics.directMainScheduleOrchestration} 处日程 IPC、计时器或具体编排`);
  if (!metrics.modelConversationServicePresent || !metrics.modelConversationServiceConfigured || !metrics.modelConversationServiceOwnsIpc || !metrics.modelCancellationPropagated) critical.push("Phase 4C 模型会话服务、可信 IPC 或取消传播未完整迁移");
  if (!metrics.autonomousCreationServicePresent || !metrics.autonomousCreationServiceConfigured || !metrics.autonomousCreationServiceOwnsState || !metrics.autonomousCreationServiceOwnsIpc) critical.push("Phase 4C 自主创作状态、生命周期或可信 IPC 未完整迁移");
  if (!metrics.phase4cServicesElectronFree) critical.push("Phase 4C 服务不得直接导入 Electron");
  if (metrics.directMainPhase4cOrchestration) critical.push(`主进程回流了 ${metrics.directMainPhase4cOrchestration} 处 Phase 4C IPC 或领域编排`);
  if (metrics.mainLines > 2500) critical.push(`electron/main.js 为 ${metrics.mainLines} 行，超过 Phase 4C 的 2500 行门禁`);
  if (metrics.mainLines > 1500) warnings.push(`electron/main.js 仍有 ${metrics.mainLines} 行，需要按领域继续拆分`);
  if (metrics.directMainIpcHandlers > 30) warnings.push(`主文件仍直接注册 ${metrics.directMainIpcHandlers} 个 IPC handler`);
  if (metrics.singleRendererEntrypoint) warnings.push("所有窗口共用单一 React 入口，尚未按窗口进行代码分割");
  return { metrics, critical, warnings };
}

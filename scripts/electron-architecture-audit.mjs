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

export function extractPreloadInboundChannels(preload) {
  const channels = [];
  for (const match of (preload || "").matchAll(/ipcRenderer\.(?:invoke|send)\s*\(\s*(["'])(.*?)\1/g)) {
    channels.push(match[2]);
  }
  return channels.sort();
}

function extractHtmlModuleEntries(html) {
  return [...(html || "").matchAll(/<script[^>]+type=["']module["'][^>]+src=["']([^"']+)["']/g)]
    .map((match) => match[1]);
}

function sameChannelSet(actual = [], expected = []) {
  const actualChannels = [...new Set(actual)].sort();
  const expectedChannels = [...expected].sort();
  return actualChannels.length === expectedChannels.length
    && actualChannels.every((channel, index) => channel === expectedChannels[index]);
}

function duplicateChannels(channels = []) {
  const seen = new Set();
  return [...new Set(channels.filter((channel) => seen.has(channel) || !seen.add(channel)))];
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

export function analyzeElectronArchitecture({
  main,
  electronFiles,
  packageJson,
  indexHtml,
  htmlEntrypoints = [],
  directElectronImports = [],
  ragSources = {},
  scheduleService = "",
  modelConversationService = "",
  autonomousCreationService = "",
  settingsService = "",
  personaCardService = "",
  live2DModelService = "",
  trustedDomainIpcService = "",
  phase5eServices = {},
  preload = "",
  phase5eContracts = []
}) {
  const normalizedHtmlEntrypoints = htmlEntrypoints.length
    ? htmlEntrypoints
    : [{ path: "index.html", content: indexHtml || "" }];
  const rendererModuleEntries = [...new Set(
    normalizedHtmlEntrypoints.flatMap((entry) => extractHtmlModuleEntries(entry.content))
  )].sort();
  const preloadSources = electronFiles
    .filter((file) => /(?:^|[\\/])preload(?:[.-][^\\/]*)?\.(?:c?js|mjs)$/.test(file))
    .map((file) => file.replaceAll("\\", "/"))
    .sort();
  const windowArguments = extractBrowserWindowArguments(main);
  const insecureWindows = windowArguments.filter((args) => /nodeIntegration:\s*true|contextIsolation:\s*false|webSecurity:\s*false/.test(args));
  const canonicalWindows = windowArguments.filter(usesCanonicalPreload);
  const buildFiles = analyzeBuildFiles(packageJson.build?.files, "electron/preload.cjs");
  const utilityBuildFiles = analyzeBuildFiles(packageJson.build?.files, "electron/workers/utility-entry.js");
  const nativeSpeechTarget = "node_modules/sherpa-onnx-win-x64/sherpa-onnx.node";
  const nativeSpeechBuildFiles = analyzeBuildFiles(packageJson.build?.files, nativeSpeechTarget);
  const nativeSpeechUnpackFiles = analyzeBuildFiles(packageJson.build?.asarUnpack, nativeSpeechTarget);
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
  const phase5dChannels = "get-bootstrap|get-startup-status|save-config|test-astrbot|get-relationship-profile|reset-relationship-profile|list-persona-cards|create-persona-card|update-persona-card|activate-persona-card|archive-persona-card|restore-persona-card|get-live2d-models|refresh-live2d-models|open-live2d-models-folder";
  const directMainPhase5dIpc = countMatches(main, new RegExp(`ipcMain\\.(?:handle|on)\\s*\\(\\s*["']agent:(?:${phase5dChannels})["']`, "g"));
  const phase5eDomainStateDeclaration = /\b(?:let|const)\s+(?:chatState|startupDiagnostics|currentLifeState|proactiveTimer|proactiveTickRunning|ownerInteractionRevision|ownerInteractionUpdateRunning|agentTaskRunning|workspaceDir|petWindowScale|positionLocked|bubbleContentSize|activeManualExpressions|activeInterestExpressions|interestBubbleWokenForTask|lastModelStatus|cachedAutoLaunchEnabled)\s*=/g;
  const hasPhase5dServiceLifecycle = (source) => /\bfunction\s+start\s*\(/.test(source)
    && /\bfunction\s+stop\s*\(/.test(source)
    && /\bfunction\s+dispose\s*\(/.test(source)
    && /\bfunction\s+snapshot\s*\(/.test(source);
  const phase5eServiceSpecs = [
    {
      key: "systemResource",
      file: "electron/services/system-resource-service.js",
      factory: "createSystemResourceService",
      variable: "systemResourceService",
      manifestExport: "SYSTEM_RESOURCE_IPC_MANIFEST",
      handles: ["agent:get-auto-launch", "agent:set-auto-launch", "agent:search-files", "agent:get-app-registry", "agent:refresh-app-registry", "agent:get-system-resource-snapshot"],
      listeners: []
    },
    {
      key: "fileManager",
      file: "electron/services/file-manager-service.js",
      factory: "createFileManagerService",
      variable: "fileManagerService",
      manifestExport: "FILE_MANAGER_IPC_MANIFEST",
      handles: ["agent:get-file-manager-snapshot", "agent:scan-managed-directory", "agent:preview-file-organization", "agent:execute-file-organization", "agent:list-file-operations", "agent:undo-file-operation"],
      listeners: []
    },
    {
      key: "hostShell",
      file: "electron/services/host-shell-service.js",
      factory: "createHostShellService",
      variable: "hostShellService",
      manifestExport: "HOST_SHELL_IPC_MANIFEST",
      handles: ["agent:open-external", "agent:get-data-path", "agent:open-data-folder", "agent:open-persona-folder"],
      listeners: []
    },
    {
      key: "companionLife",
      file: "electron/services/companion-life-service.js",
      factory: "createCompanionLifeService",
      variable: "companionLifeService",
      manifestExport: "COMPANION_LIFE_IPC_MANIFEST",
      handles: ["agent:pet-touch", "agent:get-life-state", "agent:pause-proactive-today", "agent:reset-work-session"],
      listeners: []
    },
    {
      key: "windowIntent",
      file: "electron/services/window-intent-service.js",
      factory: "createWindowIntentService",
      variable: "windowIntentService",
      manifestExport: "WINDOW_INTENT_IPC_MANIFEST",
      handles: ["agent:open-settings-window", "agent:open-composer-window", "agent:open-chat-window", "agent:open-code-window", "agent:open-scale-window", "agent:open-expression-window"],
      listeners: []
    },
    {
      key: "codeWorkspace",
      file: "electron/services/code-workspace-service.js",
      factory: "createCodeWorkspaceService",
      variable: "codeWorkspaceService",
      manifestExport: "CODE_WORKSPACE_IPC_MANIFEST",
      handles: ["agent:get-code-workspace", "agent:read-code-file", "agent:write-code-file", "agent:select-code-workspace"],
      listeners: []
    },
    {
      key: "expressionChatState",
      file: "electron/services/expression-chat-state-service.js",
      factory: "createExpressionChatStateService",
      variable: "expressionChatStateService",
      manifestExport: "EXPRESSION_CHAT_STATE_IPC_MANIFEST",
      handles: ["agent:trigger-expression", "agent:clear-expressions", "agent:get-chat-state"],
      listeners: []
    },
    {
      key: "petWindowLayout",
      file: "electron/services/pet-window-layout-service.js",
      factory: "createPetWindowLayoutService",
      variable: "petWindowLayoutService",
      manifestExport: "PET_WINDOW_LAYOUT_IPC_MANIFEST",
      handles: ["agent:get-pet-scale", "agent:get-position-lock", "agent:set-position-lock", "agent:get-pet-window-bounds", "agent:set-pet-window-position", "agent:update-pet-window-layout", "agent:update-bubble-window-size"],
      listeners: ["agent:set-pet-mouse-passthrough", "agent:show-pet-context-menu"]
    },
    {
      key: "rendererReady",
      file: "electron/services/renderer-ready-service.js",
      factory: "createRendererReadyService",
      variable: "rendererReadyService",
      manifestExport: "RENDERER_READY_IPC_MANIFEST",
      handles: [],
      listeners: ["agent:renderer-ready"]
    }
  ];
  const contractRecords = new Map((phase5eContracts || []).map((contract) => [contract.key, contract]));
  const preloadInboundChannels = extractPreloadInboundChannels(preload);
  const phase5eExpectedChannels = phase5eServiceSpecs.flatMap((spec) => [...spec.handles, ...spec.listeners]);
  const phase5eActualChannels = (phase5eContracts || []).flatMap((contract) => [
    ...(contract.registrations?.handles || []),
    ...(contract.registrations?.listeners || [])
  ]);
  const phase5eRecords = phase5eServiceSpecs.map((spec) => {
    const source = phase5eServices[spec.key] || "";
    const contract = contractRecords.get(spec.key) || {};
    const manifest = contract.manifest || {};
    const registrations = contract.registrations || {};
    const manifestDuplicates = [
      ...duplicateChannels(manifest.handles || []),
      ...duplicateChannels(manifest.listeners || [])
    ];
    const manifestMatches = sameChannelSet(manifest.handles, spec.handles)
      && sameChannelSet(manifest.listeners, spec.listeners);
    const registrationsMatch = sameChannelSet(registrations.handles, spec.handles)
      && sameChannelSet(registrations.listeners, spec.listeners);
    return {
      ...spec,
      source,
      present: normalizedElectronFiles.includes(spec.file),
      configured: new RegExp(`const ${spec.variable} = ${spec.factory}\\s*\\(`).test(main)
        && new RegExp(`${spec.variable}\\.registerIpc\\(\\)\\.start\\(\\)`).test(main)
        && new RegExp(`${spec.variable}\\.dispose\\(\\)`).test(main),
      manifestExported: new RegExp(`export\\s+const\\s+${spec.manifestExport}\\s*=`).test(source),
      manifestMatches,
      manifestDuplicates,
      registrationsMatch,
      duplicateRegistrations: [
        ...duplicateChannels(registrations.handles || []),
        ...duplicateChannels(registrations.listeners || [])
      ],
      ownsIpc: manifestMatches && registrationsMatch && /trustedIpc:\s*options\.trustedIpc/.test(source),
      lifecycleDelegated: /createTrustedDomainIpcService\s*\(/.test(source)
      ,
      mainAssemblyDuplicates: [
        countMatches(main, new RegExp(`const ${spec.variable} = ${spec.factory}\\s*\\(`, "g")),
        countMatches(main, new RegExp(`${spec.variable}\\.registerIpc\\(\\)\\.start\\(\\)`, "g")),
        countMatches(main, new RegExp(`${spec.variable}\\.dispose\\(\\)`, "g"))
      ].some((count) => count !== 1)
    };
  });
  const phase5ePreloadInboundChannels = preloadInboundChannels.filter((channel) => phase5eExpectedChannels.includes(channel));
  const phase5eDuplicatePreloadChannels = duplicateChannels(phase5ePreloadInboundChannels);
  const phase5eMainAssemblyDuplicates = phase5eRecords.filter((record) => record.mainAssemblyDuplicates).map((record) => record.key);
  const phase5eManifestDuplicates = phase5eRecords.flatMap((record) => record.manifestDuplicates);
  const phase5eChannels = phase5eExpectedChannels
    .map((channel) => channel.replace(/^agent:/, ""))
    .join("|");
  const directMainPhase5eIpc = countMatches(main, new RegExp(`ipcMain\\.(?:handle|on)\\s*\\(\\s*["']agent:(?:${phase5eChannels})["']`, "g"));
  const phase5eServiceSources = phase5eRecords.map((record) => record.source).join("\n");
  const phase5eDomainStateInMain = countMatches(maskedMain, phase5eDomainStateDeclaration);
  const phase5eTrustedDomainRuntimeOwnsLifecycleAndRollback = /\bfunction\s+registerIpc\s*\(/.test(trustedDomainIpcService)
    && /\bfunction\s+start\s*\(/.test(trustedDomainIpcService)
    && /\bfunction\s+stop\s*\(/.test(trustedDomainIpcService)
    && /\bfunction\s+dispose\s*\(/.test(trustedDomainIpcService)
    && /\bfunction\s+snapshot\s*\(/.test(trustedDomainIpcService)
    && /listenerDisposers/.test(trustedDomainIpcService)
    && /registeredHandlers/.test(trustedDomainIpcService);
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
    nativeSpeechPackagePackaged: nativeSpeechBuildFiles.included && !nativeSpeechBuildFiles.explicitlyExcluded && !nativeSpeechBuildFiles.uncertainFileSet,
    nativeSpeechPackageUnpacked: nativeSpeechUnpackFiles.included && !nativeSpeechUnpackFiles.explicitlyExcluded && !nativeSpeechUnpackFiles.uncertainFileSet,
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
    settingsServicePresent: normalizedElectronFiles.includes("electron/services/settings-service.js"),
    settingsServiceConfigured: /createSettingsService\s*\(/.test(maskedMain) && /settingsService\.registerIpc\s*\(/.test(maskedMain) && /settingsService\.start\s*\(/.test(maskedMain) && /settingsService\.dispose\s*\(/.test(maskedMain),
    settingsServiceOwnsIpc: ["agent:get-bootstrap", "agent:get-startup-status", "agent:save-config", "agent:test-astrbot", "agent:get-relationship-profile", "agent:reset-relationship-profile"].every((channel) => settingsService.includes(channel)) && /trustedIpc\.handle\s*\(/.test(settingsService),
    settingsLifecycleOwnedByService: hasPhase5dServiceLifecycle(settingsService),
    personaCardServicePresent: normalizedElectronFiles.includes("electron/services/persona-card-service.js"),
    personaCardServiceConfigured: /createPersonaCardService\s*\(/.test(maskedMain) && /personaCardService\.registerIpc\s*\(/.test(maskedMain) && /personaCardService\.start\s*\(/.test(maskedMain) && /personaCardService\.dispose\s*\(/.test(maskedMain),
    personaCardServiceOwnsIpc: ["agent:list-persona-cards", "agent:create-persona-card", "agent:update-persona-card", "agent:activate-persona-card", "agent:archive-persona-card", "agent:restore-persona-card"].every((channel) => personaCardService.includes(channel)) && /trustedIpc\.handle\s*\(/.test(personaCardService),
    personaCardLifecycleOwnedByService: hasPhase5dServiceLifecycle(personaCardService),
    live2DModelServicePresent: normalizedElectronFiles.includes("electron/services/live2d-model-service.js"),
    live2DModelServiceConfigured: /createLive2DModelService\s*\(/.test(maskedMain) && /live2dModelService\.registerIpc\s*\(/.test(maskedMain) && /live2dModelService\.start\s*\(/.test(maskedMain) && /live2dModelService\.dispose\s*\(/.test(maskedMain),
    live2DModelServiceOwnsIpc: ["agent:get-live2d-models", "agent:refresh-live2d-models", "agent:open-live2d-models-folder"].every((channel) => live2DModelService.includes(channel)) && /trustedIpc\.handle\s*\(/.test(live2DModelService),
    live2DModelLifecycleOwnedByService: hasPhase5dServiceLifecycle(live2DModelService),
    phase5dServicesElectronFree: !/from\s+["']electron["']|require\s*\(\s*["']electron["']/.test(`${settingsService}\n${personaCardService}\n${live2DModelService}`),
    directMainPhase5dIpc,
    phase5eServiceCount: phase5eRecords.length,
    phase5eServicesPresent: phase5eRecords.filter((record) => record.present).length,
    phase5eServicesConfigured: phase5eRecords.filter((record) => record.configured).length,
    phase5eServicesOwningIpc: phase5eRecords.filter((record) => record.ownsIpc).length,
    phase5eServicesWithDelegatedLifecycle: phase5eRecords.filter((record) => record.lifecycleDelegated).length,
    phase5eServicesElectronFree: !/from\s+["']electron["']|require\s*\(\s*["']electron["']/.test(phase5eServiceSources),
    phase5eDomainStateInMain,
    phase5eTrustedDomainRuntimePresent: normalizedElectronFiles.includes("electron/services/trusted-domain-ipc-service.js"),
    phase5eTrustedDomainRuntimeOwnsLifecycleAndRollback,
    phase5eOwnedChannels: phase5eRecords.filter((record) => record.present && record.ownsIpc).reduce((total, record) => total + record.handles.length + record.listeners.length, 0),
    phase5eExpectedChannels: phase5eExpectedChannels.length,
    phase5eContractsCaptured: contractRecords.size,
    phase5eManifestsExported: phase5eRecords.filter((record) => record.manifestExported).length,
    phase5eManifestsMatchingOwnership: phase5eRecords.filter((record) => record.manifestMatches).length,
    phase5eActualRegistrations: new Set(phase5eActualChannels).size,
    phase5eMissingRegistrations: [...new Set(phase5eExpectedChannels.filter((channel) => !phase5eActualChannels.includes(channel)))].sort(),
    phase5eDuplicateRegistrations: duplicateChannels(phase5eActualChannels),
    phase5eExtraRegistrations: [...new Set(phase5eActualChannels.filter((channel) => !phase5eExpectedChannels.includes(channel)))].sort(),
    phase5eChannelsMissingFromPreload: phase5eExpectedChannels.filter((channel) => !preloadInboundChannels.includes(channel)).sort(),
    phase5eDuplicatePreloadChannels,
    phase5eMainAssemblyDuplicates,
    phase5eManifestDuplicates,
    preloadInboundChannels,
    directMainPhase5eIpc,
    rendererHtmlEntrypoints: normalizedHtmlEntrypoints.length,
    rendererModuleEntries,
    singleRendererEntrypoint: rendererModuleEntries.length <= 1
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
  if (!metrics.nativeSpeechPackagePackaged || !metrics.nativeSpeechPackageUnpacked) critical.push("生产打包清单必须显式包含并解包 sherpa-onnx-win-x64 原生语音包");
  if (metrics.directMainRagIndexWrites) critical.push(`主进程仍直接执行 ${metrics.directMainRagIndexWrites} 个 RAG 写索引调用`);
  if (!metrics.mainDataBootstrapDefersRagFiles) critical.push("主进程数据初始化仍可能直接创建 RAG 索引文件");
  if (metrics.ragWriteRoutesMigrated !== 4) critical.push(`Electron RAG 写索引路径仅迁移 ${metrics.ragWriteRoutesMigrated}/4`);
  if (!metrics.scheduleServicePresent || !metrics.scheduleServiceConfigured || !metrics.scheduleServiceOwnsIpc || !metrics.scheduleLifecycleOwnedByService || !metrics.scheduleClientPropagatedThroughCore) critical.push("日程域服务、IPC、生命周期或聊天工具同步适配未完整迁移");
  if (metrics.directMainScheduleOrchestration) critical.push(`主进程回流了 ${metrics.directMainScheduleOrchestration} 处日程 IPC、计时器或具体编排`);
  if (!metrics.modelConversationServicePresent || !metrics.modelConversationServiceConfigured || !metrics.modelConversationServiceOwnsIpc || !metrics.modelCancellationPropagated) critical.push("Phase 4C 模型会话服务、可信 IPC 或取消传播未完整迁移");
  if (!metrics.autonomousCreationServicePresent || !metrics.autonomousCreationServiceConfigured || !metrics.autonomousCreationServiceOwnsState || !metrics.autonomousCreationServiceOwnsIpc) critical.push("Phase 4C 自主创作状态、生命周期或可信 IPC 未完整迁移");
  if (!metrics.phase4cServicesElectronFree) critical.push("Phase 4C 服务不得直接导入 Electron");
  if (metrics.directMainPhase4cOrchestration) critical.push(`主进程回流了 ${metrics.directMainPhase4cOrchestration} 处 Phase 4C IPC 或领域编排`);
  if (!metrics.settingsServicePresent || !metrics.settingsServiceConfigured || !metrics.settingsServiceOwnsIpc || !metrics.settingsLifecycleOwnedByService) critical.push("Phase 5D 设置服务、可信 IPC 或生命周期未完整迁移");
  if (!metrics.personaCardServicePresent || !metrics.personaCardServiceConfigured || !metrics.personaCardServiceOwnsIpc || !metrics.personaCardLifecycleOwnedByService) critical.push("Phase 5D 人物卡服务、可信 IPC 或生命周期未完整迁移");
  if (!metrics.live2DModelServicePresent || !metrics.live2DModelServiceConfigured || !metrics.live2DModelServiceOwnsIpc || !metrics.live2DModelLifecycleOwnedByService) critical.push("Phase 5D Live2D 服务、可信 IPC 或生命周期未完整迁移");
  if (!metrics.phase5dServicesElectronFree) critical.push("Phase 5D 服务不得直接导入 Electron");
  if (metrics.directMainPhase5dIpc) critical.push(`主进程回流了 ${metrics.directMainPhase5dIpc} 处 Phase 5D IPC`);
  if (metrics.phase5eServicesPresent !== metrics.phase5eServiceCount
    || metrics.phase5eServicesConfigured !== metrics.phase5eServiceCount
    || metrics.phase5eServicesOwningIpc !== metrics.phase5eServiceCount
    || metrics.phase5eServicesWithDelegatedLifecycle !== metrics.phase5eServiceCount
    || !metrics.phase5eTrustedDomainRuntimePresent
    || !metrics.phase5eTrustedDomainRuntimeOwnsLifecycleAndRollback) {
    critical.push("Phase 5E 服务文件、main 装配、可信 IPC 或共享生命周期/回滚未完整迁移");
  }
  if (!metrics.phase5eServicesElectronFree) critical.push("Phase 5E 服务不得直接导入 Electron");
  if (metrics.phase5eDomainStateInMain) critical.push(`主进程仍持有 ${metrics.phase5eDomainStateInMain} 处 Phase 5E 领域状态`);
  if (metrics.phase5eOwnedChannels !== metrics.phase5eExpectedChannels) critical.push(`Phase 5E channel 所有权为 ${metrics.phase5eOwnedChannels}/${metrics.phase5eExpectedChannels}`);
  if (metrics.phase5eManifestsExported !== metrics.phase5eServiceCount
    || metrics.phase5eManifestsMatchingOwnership !== metrics.phase5eServiceCount
    || metrics.phase5eContractsCaptured !== metrics.phase5eServiceCount
    || metrics.phase5eManifestDuplicates.length) {
    critical.push("Phase 5E 服务 manifest 缺失或与 ownership 基准不一致");
  }
  if (metrics.phase5eActualRegistrations !== metrics.phase5eExpectedChannels) {
    critical.push(`Phase 5E 实际注册 channel 为 ${metrics.phase5eActualRegistrations}/${metrics.phase5eExpectedChannels}`);
  }
  if (metrics.phase5eDuplicateRegistrations.length) {
    critical.push(`Phase 5E 存在重复注册 channel：${metrics.phase5eDuplicateRegistrations.join(", ")}`);
  }
  if (metrics.phase5eExtraRegistrations.length) {
    critical.push(`Phase 5E 存在 ownership 基准之外的注册 channel：${metrics.phase5eExtraRegistrations.join(", ")}`);
  }
  if (metrics.phase5eMissingRegistrations.length) {
    critical.push(`Phase 5E 存在未注册 channel：${metrics.phase5eMissingRegistrations.join(", ")}`);
  }
  if (metrics.phase5eChannelsMissingFromPreload.length) {
    critical.push(`Phase 5E ownership 基准缺少 preload 入站 channel：${metrics.phase5eChannelsMissingFromPreload.join(", ")}`);
  }
  if (metrics.phase5eDuplicatePreloadChannels.length) {
    critical.push(`Phase 5E preload 入站 channel 重复：${metrics.phase5eDuplicatePreloadChannels.join(", ")}`);
  }
  if (metrics.phase5eMainAssemblyDuplicates.length) {
    critical.push(`Phase 5E main 装配缺失或重复：${metrics.phase5eMainAssemblyDuplicates.join(", ")}`);
  }
  if (metrics.directMainIpcHandlers) critical.push(`主进程仍直接注册 ${metrics.directMainIpcHandlers} 个 IPC handler`);
  if (metrics.directMainIpcListeners) critical.push(`主进程仍直接注册 ${metrics.directMainIpcListeners} 个 IPC listener`);
  if (metrics.directMainPhase5eIpc) critical.push(`主进程回流了 ${metrics.directMainPhase5eIpc} 处 Phase 5E IPC`);
  if (metrics.mainLines > 2500) critical.push(`electron/main.js 为 ${metrics.mainLines} 行，超过 Phase 4C 的 2500 行门禁`);
  if (metrics.mainLines > 1500) warnings.push(`electron/main.js 仍有 ${metrics.mainLines} 行，需要按领域继续拆分`);
  if (metrics.singleRendererEntrypoint) warnings.push("所有窗口共用单一 React 入口，尚未按窗口进行代码分割");
  return { metrics, critical, warnings };
}

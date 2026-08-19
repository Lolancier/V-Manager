// Standalone helper to resolve the effective DeepSeek endpoint for a given
// model role. Each of the two model roles (pro / complex tasks and flash /
// daily chat) may either use the official DeepSeek endpoint (top-level
// apiKey + baseUrl) or route through a third-party relay (中转站) with its own
// apiKey, baseUrl and optional model name.
//
// This module has no imports so it can be safely used by core.js and by the
// other agent modules without creating circular dependencies.

export const DEEPSEEK_OFFICIAL_BASE_URL = "https://api.deepseek.com/v1";
export const DEEPSEEK_OFFICIAL_MODEL = "deepseek-v4-pro";
export const DEEPSEEK_OFFICIAL_CHAT_MODEL = "deepseek-v4-flash";

/**
 * Resolve the effective endpoint for one model role.
 *
 * @param {object} config merged agent config (may be partial)
 * @param {"model" | "chat"} kind - "model" = pro/complex tasks,
 *        "chat" = flash/daily conversation
 * @returns {{ baseUrl: string, apiKey: string, model: string, relay: boolean }}
 */
export function resolveDeepSeekEndpoint(config, kind) {
  const ds = (config && config.deepseek) || {};

  const officialBaseUrl = ds.baseUrl || DEEPSEEK_OFFICIAL_BASE_URL;
  const officialApiKey = ds.apiKey || "";
  const officialModel = kind === "chat"
    ? (ds.chatModel || ds.model || DEEPSEEK_OFFICIAL_CHAT_MODEL)
    : (ds.model || ds.chatModel || DEEPSEEK_OFFICIAL_MODEL);

  // Selected provider id for this role: the new registry key, or the legacy
  // relay `enabled` flag which migrates into the registry.
  const providerKey = kind === "chat" ? "chatProvider" : "proProvider";
  let providerId = typeof ds[providerKey] === "string" && ds[providerKey] !== "" ? ds[providerKey] : "";
  if (!providerId) {
    const legacyRelay = kind === "chat" ? ds.chatModelRelay : ds.modelRelay;
    if (legacyRelay && legacyRelay.enabled) providerId = "__legacy_custom__";
  }

  const provider = providerId === "" || providerId === "official"
    ? null
    : (ds.providers && ds.providers[providerId]) || null;

  if (provider) {
    return {
      baseUrl: (provider.baseUrl || "").trim() || officialBaseUrl,
      apiKey: (provider.apiKey || "").trim() || officialApiKey,
      model: (provider.model || "").trim() || officialModel,
      relay: true
    };
  }

  return {
    baseUrl: officialBaseUrl,
    apiKey: officialApiKey,
    model: officialModel,
    relay: false
  };
}

/**
 * Return a copy of `config` whose deepseek.baseUrl / apiKey / model have been
 * resolved for the given role. Request helpers only ever read those
 * three fields, so threading the resolved config keeps them unchanged.
 *
 * @param {object} config
 * @param {"model" | "chat"} kind
 */
export function withResolvedDeepSeek(config, kind) {
  const ep = resolveDeepSeekEndpoint(config, kind);
  return {
    ...config,
    deepseek: {
      ...(config && config.deepseek ? config.deepseek : {}),
      baseUrl: ep.baseUrl,
      apiKey: ep.apiKey,
      model: ep.model
    }
  };
}

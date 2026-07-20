const DEFAULT_BASE_URL = "http://127.0.0.1:6185";
const DEFAULT_TIMEOUT_MS = 8000;

function normalizeBaseUrl(value) {
  return String(value || DEFAULT_BASE_URL).trim().replace(/\/+$/, "");
}

function getHeaders(apiKey) {
  const key = String(apiKey || "").trim();
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(key ? { Authorization: `Bearer ${key}` } : {})
  };
}

async function request(config, pathname, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS);
  try {
    const response = await (options.fetchImpl || fetch)(`${normalizeBaseUrl(config?.baseUrl)}${pathname}`, {
      method: options.method || "GET",
      headers: getHeaders(config?.apiKey),
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal
    });
    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { message: text.slice(0, 500) };
      }
    }
    if (!response.ok) {
      const detail = data?.message || data?.detail || text || response.statusText;
      const error = new Error(`AstrBot HTTP ${response.status}: ${detail}`);
      error.status = response.status;
      throw error;
    }
    if (data?.success === false || (data?.status && !["ok", "success"].includes(data.status)) || (typeof data?.code === "number" && data.code !== 0)) {
      throw new Error(data?.message || data?.detail || "AstrBot 返回失败状态。");
    }
    return data;
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("连接 AstrBot 超时，请确认本地服务已启动。");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function resolveAstrBotContact(contact, contactMap = {}) {
  const target = String(contact || "").trim();
  if (!target) return "";
  if (/^[^:\s]+:[^:\s]+:.+$/.test(target)) return target;
  const exact = Object.entries(contactMap || {}).find(([name]) => name.trim().toLocaleLowerCase() === target.toLocaleLowerCase());
  return String(exact?.[1] || "").trim();
}

export async function testAstrBotConnection(config, options = {}) {
  if (!String(config?.apiKey || "").trim()) throw new Error("请先填写 AstrBot API Key。");
  const data = await request(config, "/api/v1/im/bots", options);
  const bots = Array.isArray(data)
    ? data
    : Array.isArray(data?.data)
      ? data.data
      : data?.data?.bot_ids || data?.data?.bots || data?.bot_ids || data?.bots || [];
  return { ok: true, bots: Array.isArray(bots) ? bots : [], raw: data };
}

export async function sendAstrBotMessage(config, input, options = {}) {
  if (!config?.enabled) throw new Error("AstrBot 微信通道尚未启用。");
  if (!String(config.apiKey || "").trim()) throw new Error("请先在设置中填写 AstrBot API Key。");
  const umo = resolveAstrBotContact(input?.contact, config.contactMap);
  if (!umo) {
    throw new Error(`没有找到联系人“${input?.contact}”的 AstrBot UMO 映射。请先让对方与机器人建立会话，再把该会话的 UMO 填入联系人映射。`);
  }
  const requestOptions = {
    ...options,
    method: "POST",
    body: { umo, message: String(input?.message || "") }
  };
  let data;
  try {
    data = await request(config, "/api/v1/im/messages", requestOptions);
  } catch (error) {
    if (error?.status !== 404) throw error;
    data = await request(config, "/api/v1/im/message", requestOptions);
  }
  return { ok: true, contact: input.contact, umo, provider: "astrbot", response: data };
}

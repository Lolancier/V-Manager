const DEFAULT_BASE_URL = "https://api.elevenlabs.io/v1";

function normalizeBaseUrl(baseUrl) {
  return (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function getVoicesUrl(baseUrl) {
  const url = new URL(normalizeBaseUrl(baseUrl));
  url.pathname = "/v2/voices";
  url.search = "?page_size=100&include_total_count=false";
  return url.toString();
}

async function readApiError(response) {
  const text = await response.text();
  try {
    const data = JSON.parse(text);
    const detail = data?.detail;
    const message = detail?.message || detail?.status || detail || text;
    return typeof message === "string" ? message : JSON.stringify(message);
  } catch {
    return text || `HTTP ${response.status}`;
  }
}

function requireVoiceConfig(voiceConfig) {
  if (!voiceConfig?.apiKey) throw new Error("请先填写 ElevenLabs API Key。");
  if (!voiceConfig?.voice) throw new Error("请先选择 ElevenLabs 音色。");
}

export async function listElevenLabsVoices(voiceConfig) {
  if (!voiceConfig?.apiKey) throw new Error("请先填写 ElevenLabs API Key。");
  const response = await fetch(getVoicesUrl(voiceConfig.baseUrl), {
    headers: { "xi-api-key": voiceConfig.apiKey, accept: "application/json" },
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) throw new Error(`获取 ElevenLabs 音色失败：${await readApiError(response)}`);

  const data = await response.json();
  return (Array.isArray(data?.voices) ? data.voices : [])
    .filter((voice) => voice?.voice_id)
    .map((voice) => ({
      voiceId: String(voice.voice_id),
      name: String(voice.name || voice.voice_id),
      category: String(voice.category || "account"),
      previewUrl: typeof voice.preview_url === "string" ? voice.preview_url : ""
    }));
}

export async function synthesizeElevenLabsSpeech(voiceConfig, text, { asmr = false } = {}) {
  requireVoiceConfig(voiceConfig);
  const cleanText = String(text || "").trim();
  if (!cleanText) throw new Error("没有可合成的文本。");
  if (cleanText.length > 5000) throw new Error("Eleven V3 单次合成最多支持 5000 个字符。");

  const modelId = voiceConfig.model || "eleven_v3";
  const inputText = asmr && modelId === "eleven_v3" && !/^\s*\[whispers?\]/i.test(cleanText)
    ? `[whispers] ${cleanText}`
    : cleanText;
  const voiceSettings = {
    stability: Number.isFinite(voiceConfig.stability) ? voiceConfig.stability : 0.5,
    similarity_boost: Number.isFinite(voiceConfig.similarityBoost) ? voiceConfig.similarityBoost : 0.75,
    use_speaker_boost: true
  };
  if (modelId !== "eleven_v3") voiceSettings.speed = voiceConfig.speed || 1;

  const baseUrl = normalizeBaseUrl(voiceConfig.baseUrl);
  const outputFormat = voiceConfig.outputFormat || "mp3_44100_128";
  const response = await fetch(
    `${baseUrl}/text-to-speech/${encodeURIComponent(voiceConfig.voice)}?output_format=${encodeURIComponent(outputFormat)}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": voiceConfig.apiKey,
        accept: "audio/mpeg",
        "content-type": "application/json"
      },
      body: JSON.stringify({ text: inputText, model_id: modelId, voice_settings: voiceSettings }),
      signal: AbortSignal.timeout(120000)
    }
  );
  if (!response.ok) throw new Error(`ElevenLabs 合成失败：${await readApiError(response)}`);

  const audio = Buffer.from(await response.arrayBuffer());
  return {
    audioBase64: audio.toString("base64"),
    mimeType: response.headers.get("content-type") || "audio/mpeg",
    requestId: response.headers.get("request-id") || "",
    characterCost: response.headers.get("character-cost") || ""
  };
}

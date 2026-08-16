import { randomUUID } from "node:crypto";
import { withLocalDatabase } from "./local-database.js";

const MAX = { name: 60, short: 160, medium: 600, long: 4000, examples: 12 };

function text(value, limit = MAX.medium) {
  return String(value || "").trim().slice(0, limit);
}

function list(value, limit = 12) {
  const source = Array.isArray(value) ? value : String(value || "").split(/[、，,\n]/);
  return [...new Set(source.map((item) => text(item, MAX.short)).filter(Boolean))].slice(0, limit);
}

export function normalizePersonaPayload(raw = {}, fallback = {}) {
  return {
    identityName: text(raw.identityName ?? fallback.identityName ?? "Vivi", MAX.name) || "Vivi",
    identity: text(raw.identity ?? fallback.identity ?? "住在电脑桌面上的私人智能搭档"),
    selfReference: text(raw.selfReference ?? fallback.selfReference ?? "我", MAX.short),
    userAddress: text(raw.userAddress ?? fallback.userAddress ?? "你、主人", MAX.short),
    relationship: text(raw.relationship ?? fallback.relationship ?? "桌面伙伴与工作搭档"),
    values: list(raw.values ?? fallback.values ?? ["真诚", "可靠", "尊重隐私"]),
    personalityTraits: list(raw.personalityTraits ?? fallback.personalityTraits ?? ["自然", "亲和", "偏执行型"]),
    speechStyle: text(raw.speechStyle ?? fallback.speechStyle ?? "使用自然、简洁的中文，根据关系和情绪调整表达。"),
    habits: text(raw.habits ?? fallback.habits ?? ""),
    boundaries: text(raw.boundaries ?? fallback.boundaries ?? "不制造依赖，不用内疚或冷暴力控制用户，不编造操作结果。", MAX.long),
    background: text(raw.background ?? fallback.background ?? "", MAX.long),
    cosplay: text(raw.cosplay ?? fallback.cosplay ?? "", MAX.long),
    extra: text(raw.extra ?? fallback.extra ?? "", MAX.long),
    exampleLines: list(raw.exampleLines ?? fallback.exampleLines ?? [], MAX.examples),
    voicePackId: text(raw.voicePackId ?? fallback.voicePackId ?? "", MAX.short),
    live2dModelId: text(raw.live2dModelId ?? fallback.live2dModelId ?? "", MAX.short)
  };
}

function rowToCard(row, payload) {
  if (!row) return null;
  return {
    id: String(row.id),
    name: String(row.name),
    status: String(row.status),
    version: Number(row.current_version || 1),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    archivedAt: row.archived_at || null,
    payload: normalizePersonaPayload(payload || {})
  };
}

function addEvent(db, cardId, eventType, reason = "", payload = {}) {
  db.run(
    "INSERT INTO persona_events(id, card_id, event_type, reason, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [randomUUID(), cardId, eventType, text(reason, 300), JSON.stringify(payload), new Date().toISOString()]
  );
}

export async function ensureDefaultPersonaCard(baseDir, config = {}) {
  return withLocalDatabase(baseDir, ({ db, queryOne, fromJson }) => {
    const activeState = queryOne(db, "SELECT * FROM persona_runtime_state WHERE slot = 'desktop'");
    if (activeState?.active_card_id) {
      const active = queryOne(db, `SELECT c.*, v.payload_json FROM persona_cards c
        JOIN persona_card_versions v ON v.card_id = c.id AND v.version = c.current_version
        WHERE c.id = ? AND c.status = 'active'`, [activeState.active_card_id]);
      if (active) return { ...rowToCard(active, fromJson(active.payload_json, {})), isActive: true };
    }

    const existing = queryOne(db, `SELECT c.*, v.payload_json FROM persona_cards c
      JOIN persona_card_versions v ON v.card_id = c.id AND v.version = c.current_version
      WHERE c.status = 'active' ORDER BY c.created_at LIMIT 1`);
    if (existing) {
      db.run("INSERT OR REPLACE INTO persona_runtime_state(slot, active_card_id, active_version, updated_at) VALUES ('desktop', ?, ?, ?)",
        [existing.id, existing.current_version, new Date().toISOString()]);
      return { ...rowToCard(existing, fromJson(existing.payload_json, {})), isActive: true };
    }

    const now = new Date().toISOString();
    const cardId = randomUUID();
    const payload = normalizePersonaPayload({
      identityName: config.personaName || "Vivi",
      speechStyle: config.personaPrompt || undefined,
      live2dModelId: config.appearance?.live2dModel || ""
    });
    const name = `${payload.identityName} · 默认`;
    db.run("INSERT INTO persona_cards(id, name, status, current_version, created_at, updated_at) VALUES (?, ?, 'active', 1, ?, ?)", [cardId, name, now, now]);
    db.run("INSERT INTO persona_card_versions(card_id, version, payload_json, created_at) VALUES (?, 1, ?, ?)", [cardId, JSON.stringify(payload), now]);
    db.run("INSERT INTO persona_runtime_state(slot, active_card_id, active_version, updated_at) VALUES ('desktop', ?, 1, ?)", [cardId, now]);
    addEvent(db, cardId, "activated", "首次初始化");
    return { ...rowToCard({ id: cardId, name, status: "active", current_version: 1, created_at: now, updated_at: now }, payload), isActive: true };
  }, { persist: true });
}

export async function listPersonaCards(baseDir, { includeArchived = true } = {}) {
  return withLocalDatabase(baseDir, ({ db, queryAll, queryOne, fromJson }) => {
    const active = queryOne(db, "SELECT active_card_id FROM persona_runtime_state WHERE slot = 'desktop'");
    const rows = queryAll(db, `SELECT c.*, v.payload_json FROM persona_cards c
      JOIN persona_card_versions v ON v.card_id = c.id AND v.version = c.current_version
      ${includeArchived ? "" : "WHERE c.status = 'active'"}
      ORDER BY CASE WHEN c.id = ? THEN 0 ELSE 1 END, c.updated_at DESC`, [active?.active_card_id || ""]);
    return rows.map((row) => ({ ...rowToCard(row, fromJson(row.payload_json, {})), isActive: row.id === active?.active_card_id }));
  });
}

export async function getActivePersonaCard(baseDir, config = {}) {
  await ensureDefaultPersonaCard(baseDir, config);
  const cards = await listPersonaCards(baseDir, { includeArchived: false });
  return cards.find((card) => card.isActive) || cards[0] || null;
}

export async function createPersonaCard(baseDir, input = {}) {
  return withLocalDatabase(baseDir, ({ db }) => {
    const now = new Date().toISOString();
    const cardId = randomUUID();
    const payload = normalizePersonaPayload(input.payload || input);
    const name = text(input.name || `${payload.identityName} · 人物卡`, MAX.name) || `${payload.identityName} · 人物卡`;
    db.run("INSERT INTO persona_cards(id, name, status, current_version, created_at, updated_at) VALUES (?, ?, 'active', 1, ?, ?)", [cardId, name, now, now]);
    db.run("INSERT INTO persona_card_versions(card_id, version, payload_json, created_at) VALUES (?, 1, ?, ?)", [cardId, JSON.stringify(payload), now]);
    addEvent(db, cardId, "created", "用户创建人物卡");
    return rowToCard({ id: cardId, name, status: "active", current_version: 1, created_at: now, updated_at: now }, payload);
  }, { persist: true });
}

export async function updatePersonaCard(baseDir, cardId, input = {}) {
  return withLocalDatabase(baseDir, ({ db, queryOne, fromJson }) => {
    const current = queryOne(db, `SELECT c.*, v.payload_json FROM persona_cards c
      JOIN persona_card_versions v ON v.card_id = c.id AND v.version = c.current_version WHERE c.id = ?`, [cardId]);
    if (!current) throw new Error("人物卡不存在。");
    if (current.status !== "active") throw new Error("已归档的人物卡需要恢复后才能修改。");
    const nextVersion = Number(current.current_version) + 1;
    const payload = normalizePersonaPayload(input.payload || input, fromJson(current.payload_json, {}));
    const name = text(input.name || current.name, MAX.name) || current.name;
    const now = new Date().toISOString();
    db.run("INSERT INTO persona_card_versions(card_id, version, payload_json, created_at) VALUES (?, ?, ?, ?)", [cardId, nextVersion, JSON.stringify(payload), now]);
    db.run("UPDATE persona_cards SET name = ?, current_version = ?, updated_at = ? WHERE id = ?", [name, nextVersion, now, cardId]);
    db.run("UPDATE persona_runtime_state SET active_version = ?, updated_at = ? WHERE active_card_id = ?", [nextVersion, now, cardId]);
    addEvent(db, cardId, "updated", input.reason || "用户修改人物卡", {
      fromVersion: Number(current.current_version),
      toVersion: nextVersion,
      source: text(input.source || "user", 80)
    });
    return rowToCard({ ...current, name, current_version: nextVersion, updated_at: now }, payload);
  }, { persist: true });
}

export async function activatePersonaCard(baseDir, cardId) {
  return withLocalDatabase(baseDir, ({ db, queryOne, fromJson }) => {
    const card = queryOne(db, `SELECT c.*, v.payload_json FROM persona_cards c
      JOIN persona_card_versions v ON v.card_id = c.id AND v.version = c.current_version WHERE c.id = ?`, [cardId]);
    if (!card || card.status !== "active") throw new Error("只能启用未归档的人物卡。");
    const previous = queryOne(db, "SELECT active_card_id FROM persona_runtime_state WHERE slot = 'desktop'");
    const now = new Date().toISOString();
    db.run("INSERT OR REPLACE INTO persona_runtime_state(slot, active_card_id, active_version, updated_at) VALUES ('desktop', ?, ?, ?)", [cardId, card.current_version, now]);
    if (previous?.active_card_id && previous.active_card_id !== cardId) addEvent(db, previous.active_card_id, "deactivated", `切换到 ${card.name}`);
    addEvent(db, cardId, "activated", "用户切换人物卡", { previousCardId: previous?.active_card_id || "" });
    return { ...rowToCard(card, fromJson(card.payload_json, {})), isActive: true };
  }, { persist: true });
}

export async function archivePersonaCard(baseDir, cardId) {
  return withLocalDatabase(baseDir, ({ db, queryOne }) => {
    const active = queryOne(db, "SELECT active_card_id FROM persona_runtime_state WHERE slot = 'desktop'");
    if (active?.active_card_id === cardId) throw new Error("当前启用的人物卡不能归档，请先切换到另一张卡。");
    if (!queryOne(db, "SELECT id FROM persona_cards WHERE id = ?", [cardId])) throw new Error("人物卡不存在。");
    const now = new Date().toISOString();
    db.run("UPDATE persona_cards SET status = 'archived', archived_at = ?, updated_at = ? WHERE id = ?", [now, now, cardId]);
    addEvent(db, cardId, "archived", "用户归档人物卡");
    return true;
  }, { persist: true });
}

export async function restorePersonaCard(baseDir, cardId) {
  return withLocalDatabase(baseDir, ({ db, queryOne }) => {
    if (!queryOne(db, "SELECT id FROM persona_cards WHERE id = ?", [cardId])) throw new Error("人物卡不存在。");
    const now = new Date().toISOString();
    db.run("UPDATE persona_cards SET status = 'active', archived_at = NULL, updated_at = ? WHERE id = ?", [now, cardId]);
    addEvent(db, cardId, "restored", "用户恢复人物卡");
    return true;
  }, { persist: true });
}

export function buildPersonaCardPrompt(card) {
  if (!card?.payload) return "";
  const p = card.payload;
  return [
    "【当前人物卡：稳定身份层】",
    `卡面：${card.name}（版本 ${card.version}）`,
    `你的名字：${p.identityName}`,
    `你的身份：${p.identity}`,
    `你的自称：${p.selfReference || "我"}`,
    `你对用户的称呼：${p.userAddress || "你"}`,
    `你与用户的关系：${p.relationship}`,
    `核心价值观：${p.values.join("、") || "自然、真诚、可靠"}`,
    `性格关键词：${p.personalityTraits.join("、") || "自然"}`,
    `说话习惯：${p.speechStyle}`,
    p.habits ? `行为习惯：${p.habits}` : "",
    p.boundaries ? `边界与禁忌：${p.boundaries}` : "",
    p.background ? `背景设定：${p.background}` : "",
    p.cosplay ? `当前角色/COS覆盖层：${p.cosplay}。这是表达与世界观覆盖层，不得把虚构内容写成用户的现实事实。` : "",
    p.extra ? `额外设定：${p.extra}` : "",
    p.exampleLines.length ? `表达示例（只参考风格，不机械复读）：\n- ${p.exampleLines.join("\n- ")}` : "",
    "身份与表达要求：把以上人物卡作为当前唯一角色身份。用户询问你是谁、自我介绍或你们的关系时，优先明确体现名字、身份、背景和关系，不要退回成泛化的“桌面 Agent”介绍。",
    "自然持续地体现人物卡中的自称、称呼、性格和说话习惯；无需每句堆砌口癖，但也不要让角色特征完全消失。",
    "人物卡只能影响身份、语气、偏好和表达；不得覆盖系统安全规则、真实工具结果、用户事实或权限边界。"
  ].filter(Boolean).join("\n");
}

export function applyPersonaCardToConfig(config, card) {
  if (!card?.payload) return config;
  const payload = normalizePersonaPayload(card.payload);
  const normalizedCard = { ...card, payload };
  const voicePackId = String(payload.voicePackId || "").trim();
  const voice = { ...config.voice };
  if (voicePackId) {
    if (/^gpt[_-]?sovits:/i.test(voicePackId)) {
      voice.provider = "gpt_sovits";
      voice.gptSovitsProfileId = voicePackId.replace(/^gpt[_-]?sovits:/i, "").trim();
    } else if (/^elevenlabs:/i.test(voicePackId)) {
      voice.provider = "elevenlabs";
      voice.voice = voicePackId.replace(/^elevenlabs:/i, "").trim();
    } else {
      const [packId, speakerId] = voicePackId.split(":");
      voice.provider = "local";
      voice.localPackId = packId.trim();
      if (/^\d+$/.test(speakerId || "")) voice.localSpeakerId = Number(speakerId);
    }
  }
  return {
    ...config,
    personaName: payload.identityName || config.personaName,
    personaPrompt: buildPersonaCardPrompt(normalizedCard),
    appearance: {
      ...config.appearance,
      live2dModel: payload.live2dModelId || config.appearance?.live2dModel
    },
    voice,
    activePersonaCard: { id: card.id, version: card.version, name: card.name }
  };
}

import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import initSqlJs from "sql.js";
import { getAgentPaths } from "./runtime-paths.js";

const require = createRequire(import.meta.url);
const databaseStates = new Map();

function databasePath(baseDir) {
  return path.join(getAgentPaths(baseDir).dataDir, "storage", "vivi.sqlite");
}

function toJson(value, fallback = null) {
  try { return JSON.stringify(value ?? fallback); }
  catch { return JSON.stringify(fallback); }
}

function fromJson(value, fallback = null) {
  try { return JSON.parse(String(value || "")); }
  catch { return fallback; }
}

async function createState(baseDir) {
  const target = databasePath(baseDir);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const SQL = await initSqlJs({
    locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm")
  });
  const bytes = await fs.readFile(target).catch(() => null);
  const db = bytes?.length ? new SQL.Database(bytes) : new SQL.Database();
  db.run(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS raw_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      seq_no INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      persona_card_id TEXT NOT NULL DEFAULT '',
      persona_version INTEGER NOT NULL DEFAULT 0,
      tool_calls_json TEXT NOT NULL DEFAULT '[]',
      tool_results_json TEXT NOT NULL DEFAULT '[]',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_raw_messages_time ON raw_messages(timestamp, seq_no);
    CREATE INDEX IF NOT EXISTS idx_raw_messages_persona ON raw_messages(persona_card_id, timestamp);
    CREATE TABLE IF NOT EXISTS persona_cards (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      current_version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      archived_at TEXT
    );
    CREATE TABLE IF NOT EXISTS persona_card_versions (
      card_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(card_id, version),
      FOREIGN KEY(card_id) REFERENCES persona_cards(id)
    );
    CREATE TABLE IF NOT EXISTS persona_events (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS persona_runtime_state (
      slot TEXT PRIMARY KEY,
      active_card_id TEXT NOT NULL DEFAULT '',
      active_version INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
  `);
  db.run(
    "INSERT OR REPLACE INTO app_meta(key, value, updated_at) VALUES ('schema_version', '1', ?)",
    [new Date().toISOString()]
  );
  const state = { db, target, writeChain: Promise.resolve() };
  databaseStates.set(path.resolve(baseDir), state);
  await persistState(state);
  return state;
}

async function getState(baseDir) {
  const key = path.resolve(baseDir);
  const existing = databaseStates.get(key);
  if (existing) return existing;
  return createState(baseDir);
}

async function persistState(state) {
  state.writeChain = state.writeChain.then(async () => {
    const bytes = state.db.export();
    const temp = `${state.target}.next`;
    await fs.writeFile(temp, Buffer.from(bytes));
    await fs.copyFile(temp, state.target);
    await fs.unlink(temp).catch(() => {});
  });
  return state.writeChain;
}

function queryAll(db, sql, params = []) {
  const statement = db.prepare(sql);
  try {
    statement.bind(params);
    const rows = [];
    while (statement.step()) rows.push(statement.getAsObject());
    return rows;
  } finally {
    statement.free();
  }
}

function queryOne(db, sql, params = []) {
  return queryAll(db, sql, params)[0] || null;
}

export async function initializeLocalDatabase(baseDir) {
  const state = await getState(baseDir);
  await migrateLegacyConversationHistory(baseDir, state);
  return { path: state.target };
}

export async function migrateLegacyConversationHistory(baseDir, providedState = null) {
  const state = providedState || await getState(baseDir);
  const migration = queryOne(state.db, "SELECT value FROM app_meta WHERE key = ?", ["conversation_jsonl_imported_v1"]);
  if (migration) return { imported: 0, skipped: true };
  const { memoryPath } = getAgentPaths(baseDir);
  const raw = await fs.readFile(memoryPath, "utf8").catch(() => "");
  let imported = 0;
  for (const [index, line] of raw.split(/\r?\n/).filter(Boolean).entries()) {
    let item;
    try { item = JSON.parse(line); }
    catch { continue; }
    const digest = createHash("sha256").update(line).digest("hex").slice(0, 24);
    const conversationId = `legacy-${digest}`;
    const timestamp = String(item.timestamp || new Date().toISOString());
    insertRawMessage(state.db, {
      id: `${conversationId}-user`, conversationId, seqNo: index * 2,
      role: "user", content: String(item.user || ""), timestamp
    });
    insertRawMessage(state.db, {
      id: `${conversationId}-assistant`, conversationId, seqNo: index * 2 + 1,
      role: "assistant", content: String(item.assistant || ""), timestamp,
      toolCalls: item.toolCalls, toolResults: item.toolResults,
      metadata: { importedFrom: "conversation.jsonl" }
    });
    imported += 2;
  }
  const now = new Date().toISOString();
  state.db.run(
    "INSERT OR REPLACE INTO app_meta(key, value, updated_at) VALUES (?, ?, ?)",
    ["conversation_jsonl_imported_v1", String(imported), now]
  );
  await persistState(state);
  return { imported, skipped: false };
}

function insertRawMessage(db, message) {
  db.run(`
    INSERT OR IGNORE INTO raw_messages(
      id, conversation_id, seq_no, role, content, timestamp, persona_card_id,
      persona_version, tool_calls_json, tool_results_json, metadata_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    message.id, message.conversationId, Number(message.seqNo || 0), message.role,
    String(message.content || ""), message.timestamp, String(message.personaCardId || ""),
    Number(message.personaVersion || 0), toJson(message.toolCalls, []),
    toJson(message.toolResults, []), toJson(message.metadata, {}), new Date().toISOString()
  ]);
}

export async function appendRawConversationTurn(baseDir, item) {
  const state = await getState(baseDir);
  const conversationId = randomUUID();
  const timestamp = String(item.timestamp || new Date().toISOString());
  const last = queryOne(state.db, "SELECT MAX(seq_no) AS max_seq FROM raw_messages");
  const nextSeq = Number(last?.max_seq ?? -1) + 1;
  state.db.run("BEGIN");
  try {
    insertRawMessage(state.db, {
      id: randomUUID(), conversationId, seqNo: nextSeq, role: "user",
      content: item.user, timestamp, personaCardId: item.personaCardId,
      personaVersion: item.personaVersion, metadata: item.metadata
    });
    insertRawMessage(state.db, {
      id: randomUUID(), conversationId, seqNo: nextSeq + 1, role: "assistant",
      content: item.assistant, timestamp, personaCardId: item.personaCardId,
      personaVersion: item.personaVersion, toolCalls: item.toolCalls,
      toolResults: item.toolResults, metadata: item.metadata
    });
    state.db.run("COMMIT");
  } catch (error) {
    state.db.run("ROLLBACK");
    throw error;
  }
  await persistState(state);
  return { conversationId, messageCount: 2 };
}

export async function clearRawConversationMemory(baseDir) {
  const state = await getState(baseDir);
  state.db.run("DELETE FROM raw_messages");
  await persistState(state);
  return true;
}

export async function getMemoryDatabaseStats(baseDir) {
  const state = await getState(baseDir);
  const raw = queryOne(state.db, "SELECT COUNT(*) AS count, MIN(timestamp) AS first_at, MAX(timestamp) AS last_at FROM raw_messages");
  const conversations = queryOne(state.db, "SELECT COUNT(DISTINCT conversation_id) AS count FROM raw_messages");
  const personas = queryOne(state.db, "SELECT COUNT(*) AS count FROM persona_cards");
  const schema = queryOne(state.db, "SELECT value FROM app_meta WHERE key = 'schema_version'");
  return {
    path: state.target,
    rawMessageCount: Number(raw?.count || 0),
    conversationCount: Number(conversations?.count || 0),
    personaCardCount: Number(personas?.count || 0),
    schemaVersion: Number(schema?.value || 1),
    firstMessageAt: raw?.first_at || null,
    lastMessageAt: raw?.last_at || null
  };
}

export async function getRecentConversationMessages(baseDir, options = {}) {
  const state = await getState(baseDir);
  const limit = Math.max(0, Math.min(200, Number(options.limit) || 40));
  const personaCardId = String(options.personaCardId || "");
  const rows = personaCardId
    ? queryAll(state.db, "SELECT role, content, timestamp, persona_card_id, persona_version FROM raw_messages WHERE persona_card_id = ? ORDER BY seq_no DESC LIMIT ?", [personaCardId, limit])
    : queryAll(state.db, "SELECT role, content, timestamp, persona_card_id, persona_version FROM raw_messages ORDER BY seq_no DESC LIMIT ?", [limit]);
  return rows.reverse().map((row) => ({
    role: row.role,
    content: row.content,
    timestamp: row.timestamp,
    personaCardId: row.persona_card_id,
    personaVersion: Number(row.persona_version || 0)
  })).filter((item) => ["user", "assistant"].includes(item.role) && item.content);
}

export async function withLocalDatabase(baseDir, operation, { persist = false } = {}) {
  const state = await getState(baseDir);
  const result = await operation({ db: state.db, queryAll, queryOne, fromJson, toJson });
  if (persist) await persistState(state);
  return result;
}

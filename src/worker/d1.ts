import { assemble, type Bundle, type SqlRow } from "../db/bundle";
import { SCHEMA } from "../db/schema";
import { migrateSchema, openAccount } from "./migrate";
import { OWNED_TABLES, scopeStatement } from "./scope";

export interface D1Result {
  results: SqlRow[];
}

export interface D1Prepared {
  bind(...values: unknown[]): D1Prepared;
  all(): Promise<D1Result>;
  first<T>(): Promise<T | null>;
  run(): Promise<unknown>;
}

export interface D1Database {
  prepare(query: string): D1Prepared;
  batch(statements: D1Prepared[]): Promise<D1Result[]>;
  exec(query: string): Promise<unknown>;
}

export interface Env {
  DB: D1Database;
}

let ready: Promise<void> | null = null;
let readyDb: D1Database | null = null;

function statementsOf(sql: string): string[] {
  return sql
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function resetDatabaseCache(): void {
  ready = null;
  readyDb = null;
}

export function assertWritable(sql: string): void {
  const trimmed = sql.trim();
  if (trimmed.includes(";") || !/^(insert|update|delete)\b/i.test(trimmed)) {
    throw new Error("只接受单条写入语句");
  }
}

export function assertReadable(sql: string): void {
  const trimmed = sql.trim();
  if (trimmed.includes(";") || !/^select\b/i.test(trimmed)) {
    throw new Error("只接受单条查询");
  }
}

function bind(db: D1Database, sql: string, params: unknown[]): D1Prepared {
  const statement = db.prepare(sql);
  return params.length ? statement.bind(...params) : statement;
}

export async function ensureDatabase(db: D1Database): Promise<void> {
  if (readyDb !== db) {
    readyDb = db;
    ready = null;
  }
  ready ??= (async () => {
    for (const statement of statementsOf(SCHEMA)) await db.prepare(statement).run();
    await migrateSchema(db);
  })().catch((error: unknown) => {
    ready = null;
    throw error;
  });
  await ready;
}

async function readyUser(db: D1Database, userId: string): Promise<void> {
  await ensureDatabase(db);
  await openAccount(db, userId);
}

const STATE_QUERIES = [
  "SELECT key, value FROM settings WHERE user_id = ?",
  "SELECT * FROM folders WHERE user_id = ? ORDER BY sort_order",
  "SELECT * FROM projects WHERE user_id = ? ORDER BY sort_order",
  "SELECT * FROM columns WHERE user_id = ? ORDER BY sort_order",
  "SELECT * FROM tasks WHERE user_id = ?",
  "SELECT * FROM checklist_items WHERE user_id = ? ORDER BY sort_order",
  "SELECT * FROM tags WHERE user_id = ? ORDER BY name",
  "SELECT * FROM task_tags WHERE user_id = ?",
  "SELECT * FROM comments WHERE user_id = ? ORDER BY created_at",
  "SELECT id, task_id, name, mime, created_at, length(data) AS size FROM attachments WHERE user_id = ?",
  "SELECT * FROM reminders WHERE user_id = ?",
  "SELECT * FROM templates WHERE user_id = ? ORDER BY created_at DESC",
  "SELECT * FROM smart_filters WHERE user_id = ? ORDER BY sort_order",
  "SELECT * FROM habit_sections WHERE user_id = ? ORDER BY sort_order",
  "SELECT * FROM habits WHERE user_id = ? ORDER BY created_at",
  "SELECT * FROM habit_logs WHERE user_id = ?",
  "SELECT * FROM focus_sessions WHERE user_id = ? ORDER BY started_at",
  "SELECT * FROM calendar_sources WHERE user_id = ? ORDER BY created_at",
  "SELECT * FROM events WHERE user_id = ?",
  "SELECT * FROM courses WHERE user_id = ?",
  "SELECT * FROM periods WHERE user_id = ? ORDER BY slot",
  "SELECT * FROM countdowns WHERE user_id = ?",
  "SELECT * FROM timers WHERE user_id = ?",
  "SELECT * FROM search_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 12",
  "SELECT * FROM completions WHERE user_id = ? ORDER BY completed_at DESC LIMIT 40",
];

export async function loadState(db: D1Database, userId: string): Promise<Bundle> {
  await readyUser(db, userId);
  const results = await db.batch(STATE_QUERIES.map((sql) => db.prepare(sql).bind(userId)));
  const rows = results.map((result) => result.results ?? []);
  return assemble({
    settings: rows[0],
    folders: rows[1],
    projects: rows[2],
    columns: rows[3],
    tasks: rows[4],
    checklist: rows[5],
    tags: rows[6],
    taskTags: rows[7],
    comments: rows[8],
    attachments: rows[9],
    reminders: rows[10],
    templates: rows[11],
    filters: rows[12],
    habitSections: rows[13],
    habits: rows[14],
    habitLogs: rows[15],
    sessions: rows[16],
    sources: rows[17],
    events: rows[18],
    courses: rows[19],
    periods: rows[20],
    countdowns: rows[21],
    timers: rows[22],
    searchHistory: rows[23],
    completions: rows[24],
  });
}

export async function execute(db: D1Database, statements: { sql: string; params: unknown[] }[], userId: string): Promise<void> {
  await readyUser(db, userId);
  if (!statements.length) return;
  await db.batch(statements.map((statement) => {
    assertWritable(statement.sql);
    const scoped = scopeStatement(statement.sql, statement.params ?? [], userId);
    return bind(db, scoped.sql, scoped.params);
  }));
}

export async function readRows(db: D1Database, sql: string, params: unknown[], userId: string): Promise<SqlRow[]> {
  await readyUser(db, userId);
  assertReadable(sql);
  const scoped = scopeStatement(sql, params, userId);
  const result = await bind(db, scoped.sql, scoped.params).all();
  return result.results;
}

function bytesToBase64(data: ArrayBuffer | Uint8Array): string {
  const view = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < view.length; index += chunk) {
    binary += String.fromCharCode(...view.subarray(index, index + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function withoutOwner(row: SqlRow): SqlRow {
  const copy: SqlRow = { ...row };
  delete copy.user_id;
  return copy;
}

export async function exportTables(db: D1Database, userId: string): Promise<{ version: 1; tables: Record<string, SqlRow[]> }> {
  await readyUser(db, userId);
  const tables: Record<string, SqlRow[]> = {};
  for (const table of OWNED_TABLES) {
    const result = await db.prepare(`SELECT * FROM ${table} WHERE user_id = ?`).bind(userId).all();
    tables[table] = result.results.map((row) => {
      const copy = withoutOwner(row);
      if (table !== "attachments") return copy;
      const { data, ...rest } = copy;
      return { ...rest, dataBase64: data ? bytesToBase64(data as ArrayBuffer) : "" };
    });
  }
  return { version: 1, tables };
}

export async function importTables(db: D1Database, payload: { version?: number; tables?: Record<string, SqlRow[]> }, userId: string): Promise<void> {
  await readyUser(db, userId);
  if (payload.version !== 1 || !payload.tables) throw new Error("这不是 mytodo 的数据文件");
  await db.batch(OWNED_TABLES.map((table) => db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).bind(userId)));
  for (const table of OWNED_TABLES) {
    const rows = payload.tables[table] ?? [];
    for (const row of rows) {
      const copy = withoutOwner(row);
      if (table === "attachments" && typeof copy.dataBase64 === "string") {
        copy.data = base64ToBytes(copy.dataBase64);
        delete copy.dataBase64;
      }
      copy.user_id = userId;
      const keys = Object.keys(copy);
      if (!keys.length) continue;
      if (keys.some((key) => !/^[a-z_]+$/.test(key))) throw new Error("数据列名无效");
      const sql = `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`;
      await db.prepare(sql).bind(...keys.map((key) => copy[key] ?? null)).run();
    }
  }
}

export async function saveAttachment(
  db: D1Database,
  body: { id: string; taskId: string; name: string; mime: string; createdAt: string; dataBase64: string },
  userId: string,
): Promise<void> {
  await readyUser(db, userId);
  if (!body.id || !body.taskId || !body.name) throw new Error("附件缺少必要字段");
  const task = await db.prepare("SELECT id FROM tasks WHERE id = ? AND user_id = ?").bind(body.taskId, userId).first<{ id: string }>();
  if (!task) throw new Error("找不到对应的任务");
  const bytes = base64ToBytes(body.dataBase64);
  if (bytes.byteLength > 1_500_000) throw new Error("附件请小于 1.5 MB");
  await db.prepare("INSERT INTO attachments (id, task_id, user_id, name, mime, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(
    body.id,
    body.taskId,
    userId,
    body.name,
    body.mime || "application/octet-stream",
    bytes,
    body.createdAt || new Date().toISOString(),
  ).run();
}

export async function readAttachment(db: D1Database, id: string, userId: string): Promise<{ name: string; mime: string; data: ArrayBuffer } | null> {
  await readyUser(db, userId);
  return db.prepare("SELECT name, mime, data FROM attachments WHERE id = ? AND user_id = ?").bind(id, userId).first<{ name: string; mime: string; data: ArrayBuffer }>();
}

import { assemble, type Bundle, type SqlRow } from "../db/bundle";
import { SCHEMA } from "../db/schema";
import { defaultSettings } from "../types";

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

const TABLES = [
  "folders",
  "projects",
  "columns",
  "tasks",
  "checklist_items",
  "tags",
  "task_tags",
  "comments",
  "attachments",
  "reminders",
  "templates",
  "smart_filters",
  "habit_sections",
  "habits",
  "habit_logs",
  "focus_sessions",
  "calendar_sources",
  "events",
  "courses",
  "periods",
  "countdowns",
  "timers",
  "search_history",
  "settings",
  "completions",
] as const;

let ready: Promise<void> | null = null;

function statementsOf(sql: string): string[] {
  return sql
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
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
  ready ??= (async () => {
    for (const statement of statementsOf(SCHEMA)) {
      await db.prepare(statement).run();
    }
    await seed(db);
  })();
  await ready;
}

async function seed(db: D1Database): Promise<void> {
  const count = await db.prepare("SELECT COUNT(*) AS n FROM projects").first<{ n: number }>();
  if (Number(count?.n ?? 0) > 0) return;
  const created = new Date().toISOString();
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO projects (id, name, color, sort_order, created_at) VALUES (?, ?, ?, ?, ?)").bind("inbox", "收集箱", "#1f6b4a", 0, created),
    db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('settings', ?)").bind(JSON.stringify(defaultSettings())),
    ...[
      ["08:00", "08:45"],
      ["08:55", "09:40"],
      ["10:00", "10:45"],
      ["10:55", "11:40"],
      ["14:00", "14:45"],
      ["14:55", "15:40"],
      ["16:00", "16:45"],
      ["16:55", "17:40"],
    ].map(([start, end], index) => db.prepare("INSERT OR IGNORE INTO periods (slot, start_time, end_time) VALUES (?, ?, ?)").bind(index + 1, start, end)),
  ]);
}

export async function loadState(db: D1Database): Promise<Bundle> {
  await ensureDatabase(db);
  const queries = [
    "SELECT key, value FROM settings",
    "SELECT * FROM folders ORDER BY sort_order",
    "SELECT * FROM projects ORDER BY sort_order",
    "SELECT * FROM columns ORDER BY sort_order",
    "SELECT * FROM tasks",
    "SELECT * FROM checklist_items ORDER BY sort_order",
    "SELECT * FROM tags ORDER BY name",
    "SELECT * FROM task_tags",
    "SELECT * FROM comments ORDER BY created_at",
    "SELECT id, task_id, name, mime, created_at, length(data) AS size FROM attachments",
    "SELECT * FROM reminders",
    "SELECT * FROM templates ORDER BY created_at DESC",
    "SELECT * FROM smart_filters ORDER BY sort_order",
    "SELECT * FROM habit_sections ORDER BY sort_order",
    "SELECT * FROM habits ORDER BY created_at",
    "SELECT * FROM habit_logs",
    "SELECT * FROM focus_sessions ORDER BY started_at",
    "SELECT * FROM calendar_sources ORDER BY created_at",
    "SELECT * FROM events",
    "SELECT * FROM courses",
    "SELECT * FROM periods ORDER BY slot",
    "SELECT * FROM countdowns",
    "SELECT * FROM timers",
    "SELECT * FROM search_history ORDER BY created_at DESC LIMIT 12",
    "SELECT * FROM completions ORDER BY completed_at DESC LIMIT 40",
  ];
  const results = await db.batch(queries.map((sql) => db.prepare(sql)));
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

export async function execute(db: D1Database, statements: { sql: string; params: unknown[] }[]): Promise<void> {
  await ensureDatabase(db);
  if (!statements.length) return;
  await db.batch(statements.map((statement) => {
    assertWritable(statement.sql);
    return bind(db, statement.sql, statement.params);
  }));
}

export async function readRows(db: D1Database, sql: string, params: unknown[]): Promise<SqlRow[]> {
  await ensureDatabase(db);
  assertReadable(sql);
  const result = await bind(db, sql, params).all();
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

export async function exportTables(db: D1Database): Promise<{ version: 1; tables: Record<string, SqlRow[]> }> {
  await ensureDatabase(db);
  const tables: Record<string, SqlRow[]> = {};
  for (const table of TABLES) {
    const result = await db.prepare(`SELECT * FROM ${table}`).all();
    tables[table] = table === "attachments"
      ? result.results.map((row) => {
          const { data, ...rest } = row;
          return { ...rest, dataBase64: data ? bytesToBase64(data as ArrayBuffer) : "" };
        })
      : result.results;
  }
  return { version: 1, tables };
}

export async function importTables(db: D1Database, payload: { version?: number; tables?: Record<string, SqlRow[]> }): Promise<void> {
  await ensureDatabase(db);
  if (payload.version !== 1 || !payload.tables) throw new Error("这不是 mytodo 的数据文件");
  await db.batch(TABLES.map((table) => db.prepare(`DELETE FROM ${table}`)));
  for (const table of TABLES) {
    const rows = payload.tables[table] ?? [];
    for (const row of rows) {
      const copy: Record<string, unknown> = { ...row };
      if (table === "attachments" && typeof copy.dataBase64 === "string") {
        copy.data = base64ToBytes(copy.dataBase64);
        delete copy.dataBase64;
      }
      const keys = Object.keys(copy);
      if (!keys.length) continue;
      if (keys.some((key) => !/^[a-z_]+$/.test(key))) throw new Error("数据列名无效");
      const sql = `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`;
      await db.prepare(sql).bind(...keys.map((key) => copy[key] ?? null)).run();
    }
  }
}

export async function saveAttachment(db: D1Database, body: { id: string; taskId: string; name: string; mime: string; createdAt: string; dataBase64: string }): Promise<void> {
  await ensureDatabase(db);
  if (!body.id || !body.taskId || !body.name) throw new Error("附件缺少必要字段");
  const bytes = base64ToBytes(body.dataBase64);
  if (bytes.byteLength > 1_500_000) throw new Error("附件请小于 1.5 MB");
  await db.prepare("INSERT INTO attachments (id, task_id, name, mime, data, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(
    body.id,
    body.taskId,
    body.name,
    body.mime || "application/octet-stream",
    bytes,
    body.createdAt || new Date().toISOString(),
  ).run();
}

export async function readAttachment(db: D1Database, id: string): Promise<{ name: string; mime: string; data: ArrayBuffer } | null> {
  await ensureDatabase(db);
  return db.prepare("SELECT name, mime, data FROM attachments WHERE id = ?").bind(id).first<{ name: string; mime: string; data: ArrayBuffer }>();
}

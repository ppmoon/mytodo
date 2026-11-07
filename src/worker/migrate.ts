import { inboxProjectId } from "../lib/inbox";
import { defaultSettings } from "../types";
import type { D1Database } from "./d1";
import { OWNED_TABLES } from "./scope";

const PERIODS: [string, string][] = [
  ["08:00", "08:45"],
  ["08:55", "09:40"],
  ["10:00", "10:45"],
  ["10:55", "11:40"],
  ["14:00", "14:45"],
  ["14:55", "15:40"],
  ["16:00", "16:45"],
  ["16:55", "17:40"],
];

async function createSql(db: D1Database, table: string): Promise<string> {
  const row = await db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").bind(table).first<{ sql: string }>();
  return row?.sql ?? "";
}

async function columnNames(db: D1Database, table: string): Promise<string[]> {
  const info = await db.prepare(`PRAGMA table_info(${table})`).all();
  return (info.results ?? []).map((row) => String(row.name));
}

async function replaceTable(db: D1Database, table: string, create: string, copy: string): Promise<void> {
  const migrated = `${table}_migrated`;
  await db.prepare(`DROP TABLE IF EXISTS ${migrated}`).run();
  await db.prepare(create.replaceAll("__table__", migrated)).run();
  await db.prepare(copy.replaceAll("__table__", migrated)).run();
  await db.prepare(`DROP TABLE ${table}`).run();
  await db.prepare(`ALTER TABLE ${migrated} RENAME TO ${table}`).run();
}

async function ensureUserColumn(db: D1Database, table: string): Promise<void> {
  const columns = await columnNames(db, table);
  if (columns.includes("user_id")) return;
  await db.prepare(`ALTER TABLE ${table} ADD COLUMN user_id TEXT`).run();
}

export async function migrateSchema(db: D1Database): Promise<void> {
  const settingsSql = await createSql(db, "settings");
  if (settingsSql && !/primary\s+key\s*\(\s*user_id\s*,\s*key\s*\)/i.test(settingsSql)) {
    const settingsColumns = await columnNames(db, "settings");
    const userId = settingsColumns.includes("user_id") ? "COALESCE(user_id, '')" : "''";
    await replaceTable(
      db,
      "settings",
      `CREATE TABLE __table__ (
        user_id TEXT NOT NULL DEFAULT '',
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        PRIMARY KEY (user_id, key)
      )`,
      `INSERT INTO __table__ (user_id, key, value) SELECT ${userId}, key, value FROM settings`,
    );
  }

  const periodsSql = await createSql(db, "periods");
  if (periodsSql && !/primary\s+key\s*\(\s*user_id\s*,\s*slot\s*\)/i.test(periodsSql)) {
    const periodColumns = await columnNames(db, "periods");
    const userId = periodColumns.includes("user_id") ? "COALESCE(user_id, '')" : "''";
    await replaceTable(
      db,
      "periods",
      `CREATE TABLE __table__ (
        user_id TEXT NOT NULL DEFAULT '',
        slot INTEGER NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        PRIMARY KEY (user_id, slot)
      )`,
      `INSERT INTO __table__ (user_id, slot, start_time, end_time) SELECT ${userId}, slot, start_time, end_time FROM periods`,
    );
  }

  const tagsSql = await createSql(db, "tags");
  if (tagsSql && !/unique\s*\(\s*user_id\s*,\s*name\s*\)/i.test(tagsSql)) {
    const tagColumns = await columnNames(db, "tags");
    const userId = tagColumns.includes("user_id") ? "COALESCE(user_id, '')" : "''";
    await replaceTable(
      db,
      "tags",
      `CREATE TABLE __table__ (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL DEFAULT '',
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        UNIQUE (user_id, name)
      )`,
      `INSERT INTO __table__ (id, user_id, name, color) SELECT id, ${userId}, name, color FROM tags`,
    );
  }

  for (const table of OWNED_TABLES) await ensureUserColumn(db, table);
}

async function hasOrphans(db: D1Database): Promise<boolean> {
  const checks = OWNED_TABLES.map((table) => `EXISTS(SELECT 1 FROM ${table} WHERE user_id IS NULL OR user_id = '')`);
  const row = await db.prepare(`SELECT (${checks.join(" OR ")}) AS n`).first<{ n: number }>();
  return Number(row?.n ?? 0) === 1;
}

export async function claimLegacyData(db: D1Database, userId: string): Promise<void> {
  const inboxId = inboxProjectId(userId);
  await db.prepare("UPDATE tasks SET project_id = ? WHERE project_id = 'inbox' AND (user_id IS NULL OR user_id = '')").bind(inboxId).run();
  await db.prepare("UPDATE columns SET project_id = ? WHERE project_id = 'inbox' AND (user_id IS NULL OR user_id = '')").bind(inboxId).run();
  await db.prepare("UPDATE projects SET id = ? WHERE id = 'inbox' AND (user_id IS NULL OR user_id = '')").bind(inboxId).run();
  for (const table of OWNED_TABLES) {
    await db.prepare(`UPDATE ${table} SET user_id = ? WHERE user_id IS NULL OR user_id = ''`).bind(userId).run();
  }
}

async function countFor(db: D1Database, table: string, userId: string): Promise<number> {
  const row = await db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`).bind(userId).first<{ n: number }>();
  return Number(row?.n ?? 0);
}

export async function seedIfEmpty(db: D1Database, userId: string): Promise<void> {
  if ((await countFor(db, "projects", userId)) === 0) {
    await db.prepare("INSERT INTO projects (id, user_id, name, color, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(
      inboxProjectId(userId),
      userId,
      "收集箱",
      "#1f6b4a",
      0,
      new Date().toISOString(),
    ).run();
  }
  if ((await countFor(db, "settings", userId)) === 0) {
    await db.prepare("INSERT INTO settings (user_id, key, value) VALUES (?, 'settings', ?)").bind(userId, JSON.stringify(defaultSettings())).run();
  }
  if ((await countFor(db, "periods", userId)) === 0) {
    for (const [index, [start, end]] of PERIODS.entries()) {
      await db.prepare("INSERT INTO periods (user_id, slot, start_time, end_time) VALUES (?, ?, ?, ?)").bind(userId, index + 1, start, end).run();
    }
  }
}

export async function openAccount(db: D1Database, userId: string): Promise<void> {
  const users = await db.prepare("SELECT COUNT(*) AS n FROM users").first<{ n: number }>();
  if (Number(users?.n ?? 0) === 1 && (await hasOrphans(db))) await claimLegacyData(db, userId);
  await seedIfEmpty(db, userId);
}

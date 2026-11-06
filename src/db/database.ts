import initSqlJs, { type Database, type SqlValue } from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { SCHEMA } from "./schema";
import type {
  AttachmentMeta,
  CalEvent,
  CalendarSource,
  ChecklistItem,
  Column,
  Comment,
  Completion,
  Countdown,
  Course,
  FocusSession,
  Folder,
  Habit,
  HabitLog,
  HabitSection,
  Period,
  Project,
  Reminder,
  SearchEntry,
  Settings,
  SmartFilter,
  Tag,
  Task,
  Template,
  TimerItem,
} from "../types";
import { defaultSettings } from "../types";
import type { RepeatRule } from "../lib/nlp";
import { nowIso, uid } from "../lib/id";

const DB_NAME = "mytodo";
const STORE = "kv";
const KEY = "sqlite";

let sqlDb: Database | null = null;
let saveTimer = 0;

function asText(value: SqlValue | undefined): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}

function asNum(value: SqlValue | undefined): number {
  return Number(value ?? 0);
}

function flag(value: SqlValue | undefined): boolean {
  return Number(value ?? 0) === 1;
}

async function openIndexedDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readSaved(): Promise<Uint8Array | null> {
  const db = await openIndexedDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(KEY);
    request.onsuccess = () => resolve((request.result as Uint8Array | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

async function writeSaved(bytes: Uint8Array): Promise<void> {
  const db = await openIndexedDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(bytes, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function persistSoon(): void {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    if (!sqlDb) return;
    void writeSaved(sqlDb.export());
  }, 40);
}

export async function persistNow(): Promise<void> {
  if (!sqlDb) return;
  await writeSaved(sqlDb.export());
}

function rows(sql: string, params: SqlValue[] = []): Record<string, SqlValue>[] {
  if (!sqlDb) return [];
  const stmt = sqlDb.prepare(sql);
  stmt.bind(params);
  const list: Record<string, SqlValue>[] = [];
  while (stmt.step()) list.push(stmt.getAsObject());
  stmt.free();
  return list;
}

export function run(sql: string, params: SqlValue[] = []): void {
  sqlDb?.run(sql, params);
  persistSoon();
}

function taskFrom(row: Record<string, SqlValue>): Task {
  return {
    id: String(row.id),
    projectId: asText(row.project_id),
    columnId: asText(row.column_id),
    parentId: asText(row.parent_id),
    title: String(row.title),
    notes: String(row.notes ?? ""),
    priority: asNum(row.priority),
    startAt: asText(row.start_at),
    dueAt: asText(row.due_at),
    allDay: flag(row.all_day),
    timezone: String(row.timezone),
    repeat: row.repeat_json ? (JSON.parse(String(row.repeat_json)) as RepeatRule) : null,
    status: String(row.status) === "completed" ? "completed" : "open",
    progress: asNum(row.progress),
    pinned: flag(row.pinned),
    pinnedAt: asText(row.pinned_at),
    completedAt: asText(row.completed_at),
    deletedAt: asText(row.deleted_at),
    sortOrder: asNum(row.sort_order),
    locationName: asText(row.location_name),
    locationLat: row.location_lat === null ? null : Number(row.location_lat),
    locationLng: row.location_lng === null ? null : Number(row.location_lng),
    locationRadius: row.location_radius === null ? null : asNum(row.location_radius),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function loadBundle() {
  const settingsRow = Object.fromEntries(rows("SELECT key, value FROM settings").map((row) => [String(row.key), String(row.value)]));
  const settings: Settings = { ...defaultSettings(), ...(settingsRow.settings ? (JSON.parse(settingsRow.settings) as Settings) : {}) };
  if (settings.accent.toLowerCase() === "#0f6e6e") settings.accent = "#1f6b4a";
  if (settings.tabs.join() === "today,calendar,habits,focus,more") settings.tabs = defaultSettings().tabs;
  return {
    settings,
    folders: rows("SELECT * FROM folders ORDER BY sort_order").map((row) => ({
      id: String(row.id),
      name: String(row.name),
      sortOrder: asNum(row.sort_order),
    })) as Folder[],
    projects: rows("SELECT * FROM projects ORDER BY sort_order").map((row) => ({
      id: String(row.id),
      folderId: asText(row.folder_id),
      name: String(row.name),
      color: String(row.color),
      pinned: flag(row.pinned),
      archived: flag(row.archived),
      sortOrder: asNum(row.sort_order),
      createdAt: String(row.created_at),
    })) as Project[],
    columns: rows("SELECT * FROM columns ORDER BY sort_order").map((row) => ({
      id: String(row.id),
      projectId: String(row.project_id),
      name: String(row.name),
      sortOrder: asNum(row.sort_order),
    })) as Column[],
    tasks: rows("SELECT * FROM tasks").map(taskFrom),
    checklist: rows("SELECT * FROM checklist_items ORDER BY sort_order").map((row) => ({
      id: String(row.id),
      taskId: String(row.task_id),
      title: String(row.title),
      done: flag(row.done),
      sortOrder: asNum(row.sort_order),
    })) as ChecklistItem[],
    tags: rows("SELECT * FROM tags ORDER BY name").map((row) => ({
      id: String(row.id),
      name: String(row.name),
      color: String(row.color),
    })) as Tag[],
    taskTags: rows("SELECT * FROM task_tags").map((row) => ({ taskId: String(row.task_id), tagId: String(row.tag_id) })),
    comments: rows("SELECT * FROM comments ORDER BY created_at").map((row) => ({
      id: String(row.id),
      taskId: String(row.task_id),
      body: String(row.body),
      createdAt: String(row.created_at),
    })) as Comment[],
    attachments: rows("SELECT id, task_id, name, mime, created_at, length(data) AS size FROM attachments").map((row) => ({
      id: String(row.id),
      taskId: String(row.task_id),
      name: String(row.name),
      mime: String(row.mime),
      createdAt: String(row.created_at),
      size: asNum(row.size),
    })) as AttachmentMeta[],
    reminders: rows("SELECT * FROM reminders").map((row) => ({
      id: String(row.id),
      taskId: String(row.task_id),
      fireAt: String(row.fire_at),
      offsetMinutes: row.offset_minutes === null ? null : asNum(row.offset_minutes),
      status: String(row.status),
      createdAt: String(row.created_at),
    })) as Reminder[],
    templates: rows("SELECT * FROM templates ORDER BY created_at DESC").map((row) => ({
      id: String(row.id),
      name: String(row.name),
      payloadJson: String(row.payload_json),
      createdAt: String(row.created_at),
    })) as Template[],
    filters: rows("SELECT * FROM smart_filters ORDER BY sort_order").map((row) => ({
      id: String(row.id),
      name: String(row.name),
      queryJson: String(row.query_json),
      sortOrder: asNum(row.sort_order),
    })) as SmartFilter[],
    habitSections: rows("SELECT * FROM habit_sections ORDER BY sort_order").map((row) => ({
      id: String(row.id),
      name: String(row.name),
      sortOrder: asNum(row.sort_order),
    })) as HabitSection[],
    habits: rows("SELECT * FROM habits ORDER BY created_at").map((row) => ({
      id: String(row.id),
      sectionId: asText(row.section_id),
      name: String(row.name),
      preset: asText(row.preset),
      period: String(row.period) === "weekly" ? "weekly" : "daily",
      targetCount: asNum(row.target_count),
      archived: flag(row.archived),
      createdAt: String(row.created_at),
    })) as Habit[],
    habitLogs: rows("SELECT * FROM habit_logs").map((row) => ({
      id: String(row.id),
      habitId: String(row.habit_id),
      day: String(row.day),
      status: String(row.status) as HabitLog["status"],
    })),
    sessions: rows("SELECT * FROM focus_sessions ORDER BY started_at").map((row) => ({
      id: String(row.id),
      mode: String(row.mode) as FocusSession["mode"],
      startedAt: String(row.started_at),
      endedAt: asText(row.ended_at),
      plannedSeconds: asNum(row.planned_seconds),
      taskId: asText(row.task_id),
    })),
    sources: rows("SELECT * FROM calendar_sources ORDER BY created_at").map((row) => ({
      id: String(row.id),
      name: String(row.name),
      url: asText(row.url),
      createdAt: String(row.created_at),
    })) as CalendarSource[],
    events: rows("SELECT * FROM events").map((row) => ({
      id: String(row.id),
      sourceId: asText(row.source_id),
      title: String(row.title),
      startAt: String(row.start_at),
      endAt: asText(row.end_at),
      allDay: flag(row.all_day),
    })) as CalEvent[],
    courses: rows("SELECT * FROM courses").map((row) => ({
      id: String(row.id),
      name: String(row.name),
      teacher: String(row.teacher),
      room: String(row.room),
      weekday: asNum(row.weekday),
      startSlot: asNum(row.start_slot),
      endSlot: asNum(row.end_slot),
      color: String(row.color),
    })) as Course[],
    periods: rows("SELECT * FROM periods ORDER BY slot").map((row) => ({
      slot: asNum(row.slot),
      startTime: String(row.start_time),
      endTime: String(row.end_time),
    })) as Period[],
    countdowns: rows("SELECT * FROM countdowns").map((row) => ({
      id: String(row.id),
      title: String(row.title),
      targetOn: String(row.target_on),
      archived: flag(row.archived),
    })) as Countdown[],
    timers: rows("SELECT * FROM timers").map((row) => ({
      id: String(row.id),
      title: String(row.title),
      durationSeconds: asNum(row.duration_seconds),
      remainingSeconds: asNum(row.remaining_seconds),
      runningSince: asText(row.running_since),
      archived: flag(row.archived),
    })) as TimerItem[],
    searchHistory: rows("SELECT * FROM search_history ORDER BY created_at DESC LIMIT 12").map((row) => ({
      id: String(row.id),
      query: String(row.query),
      createdAt: String(row.created_at),
    })) as SearchEntry[],
    completions: rows("SELECT * FROM completions ORDER BY completed_at DESC LIMIT 40").map((row) => ({
      id: String(row.id),
      taskId: String(row.task_id),
      title: String(row.title),
      completedAt: String(row.completed_at),
    })) as Completion[],
  };
}

export type Bundle = ReturnType<typeof loadBundle>;

function seed(): void {
  const created = nowIso();
  run("INSERT INTO projects (id, name, color, sort_order, created_at) VALUES (?, ?, ?, ?, ?)", [
    "inbox",
    "收集箱",
    "#1f6b4a",
    0,
    created,
  ]);
  run("INSERT INTO settings (key, value) VALUES ('settings', ?)", [JSON.stringify(defaultSettings())]);
  const periods = [
    ["08:00", "08:45"],
    ["08:55", "09:40"],
    ["10:00", "10:45"],
    ["10:55", "11:40"],
    ["14:00", "14:45"],
    ["14:55", "15:40"],
    ["16:00", "16:45"],
    ["16:55", "17:40"],
  ];
  periods.forEach(([start, end], index) => {
    run("INSERT INTO periods (slot, start_time, end_time) VALUES (?, ?, ?)", [index + 1, start, end]);
  });
}

export async function openDatabase(): Promise<void> {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const saved = await readSaved();
  sqlDb = saved ? new SQL.Database(saved) : new SQL.Database();
  sqlDb.exec(SCHEMA);
  const count = rows("SELECT COUNT(*) AS n FROM projects");
  if (!count.length || asNum(count[0].n) === 0) seed();
  persistSoon();
}

export function exportDatabase(): Uint8Array {
  if (!sqlDb) return new Uint8Array();
  return sqlDb.export();
}

export async function replaceDatabase(bytes: Uint8Array): Promise<void> {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  sqlDb = new SQL.Database(bytes);
  sqlDb.exec(SCHEMA);
  await persistNow();
}

export function getTask(id: string): Task | null {
  const list = rows("SELECT * FROM tasks WHERE id = ?", [id]);
  return list[0] ? taskFrom(list[0]) : null;
}

export function saveSettings(settings: Settings): void {
  run("INSERT INTO settings (key, value) VALUES ('settings', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [
    JSON.stringify(settings),
  ]);
  persistSoon();
}

export function insertTask(task: Task, tagIds: string[]): void {
  run(
    `INSERT INTO tasks (
      id, project_id, column_id, parent_id, title, notes, priority, start_at, due_at, all_day, timezone,
      repeat_json, status, progress, pinned, pinned_at, completed_at, deleted_at, sort_order,
      location_name, location_lat, location_lng, location_radius, created_at, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      task.id, task.projectId, task.columnId, task.parentId, task.title, task.notes, task.priority,
      task.startAt, task.dueAt, task.allDay ? 1 : 0, task.timezone, task.repeat ? JSON.stringify(task.repeat) : null,
      task.status, task.progress, task.pinned ? 1 : 0, task.pinnedAt, task.completedAt, task.deletedAt, task.sortOrder,
      task.locationName, task.locationLat, task.locationLng, task.locationRadius, task.createdAt, task.updatedAt,
    ],
  );
  tagIds.forEach((tagId) => run("INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?)", [task.id, tagId]));
  persistSoon();
}

export function updateTask(task: Task): void {
  run(
    `UPDATE tasks SET project_id=?, column_id=?, parent_id=?, title=?, notes=?, priority=?, start_at=?, due_at=?,
      all_day=?, timezone=?, repeat_json=?, status=?, progress=?, pinned=?, pinned_at=?, completed_at=?, deleted_at=?,
      sort_order=?, location_name=?, location_lat=?, location_lng=?, location_radius=?, updated_at=? WHERE id=?`,
    [
      task.projectId, task.columnId, task.parentId, task.title, task.notes, task.priority, task.startAt, task.dueAt,
      task.allDay ? 1 : 0, task.timezone, task.repeat ? JSON.stringify(task.repeat) : null, task.status, task.progress,
      task.pinned ? 1 : 0, task.pinnedAt, task.completedAt, task.deletedAt, task.sortOrder, task.locationName,
      task.locationLat, task.locationLng, task.locationRadius, task.updatedAt, task.id,
    ],
  );
  persistSoon();
}

export function setTaskTags(taskId: string, tagIds: string[]): void {
  run("DELETE FROM task_tags WHERE task_id = ?", [taskId]);
  tagIds.forEach((tagId) => run("INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?)", [taskId, tagId]));
  persistSoon();
}

export function replaceChecklist(taskId: string, items: ChecklistItem[]): void {
  run("DELETE FROM checklist_items WHERE task_id = ?", [taskId]);
  items.forEach((item, index) => {
    run("INSERT INTO checklist_items (id, task_id, title, done, sort_order) VALUES (?, ?, ?, ?, ?)", [
      item.id || uid(),
      taskId,
      item.title,
      item.done ? 1 : 0,
      index,
    ]);
  });
  persistSoon();
}

export function replaceReminders(taskId: string, items: Reminder[]): void {
  run("DELETE FROM reminders WHERE task_id = ?", [taskId]);
  items.forEach((item) => {
    run("INSERT INTO reminders (id, task_id, fire_at, offset_minutes, status, created_at) VALUES (?, ?, ?, ?, ?, ?)", [
      item.id || uid(),
      taskId,
      item.fireAt,
      item.offsetMinutes,
      item.status,
      item.createdAt,
    ]);
  });
  persistSoon();
}

export function reminderById(id: string): Reminder | null {
  const row = rows("SELECT * FROM reminders WHERE id = ?", [id])[0];
  if (!row) return null;
  return {
    id: String(row.id),
    taskId: String(row.task_id),
    fireAt: String(row.fire_at),
    offsetMinutes: row.offset_minutes === null ? null : asNum(row.offset_minutes),
    status: String(row.status),
    createdAt: String(row.created_at),
  };
}

export function setReminder(id: string, fireAt: string, status: string): void {
  run("UPDATE reminders SET fire_at = ?, status = ? WHERE id = ?", [fireAt, status, id]);
  persistSoon();
}

export function addComment(comment: Comment): void {
  run("INSERT INTO comments (id, task_id, body, created_at) VALUES (?, ?, ?, ?)", [
    comment.id, comment.taskId, comment.body, comment.createdAt,
  ]);
  persistSoon();
}

export function deleteComment(id: string): void {
  run("DELETE FROM comments WHERE id = ?", [id]);
  persistSoon();
}

export function addAttachment(id: string, taskId: string, name: string, mime: string, data: Uint8Array): void {
  run("INSERT INTO attachments (id, task_id, name, mime, data, created_at) VALUES (?, ?, ?, ?, ?, ?)", [
    id, taskId, name, mime, data, nowIso(),
  ]);
  persistSoon();
}

export function deleteAttachment(id: string): void {
  run("DELETE FROM attachments WHERE id = ?", [id]);
  persistSoon();
}

export function readAttachment(id: string): { mime: string; name: string; data: Uint8Array } | null {
  const row = rows("SELECT name, mime, data FROM attachments WHERE id = ?", [id])[0];
  if (!row || !(row.data instanceof Uint8Array)) return null;
  return { name: String(row.name), mime: String(row.mime), data: row.data };
}

export function ensureTag(name: string, color: string): string {
  const existing = rows("SELECT id FROM tags WHERE name = ?", [name])[0];
  if (existing) return String(existing.id);
  const id = uid();
  run("INSERT INTO tags (id, name, color) VALUES (?, ?, ?)", [id, name, color]);
  persistSoon();
  return id;
}

export function nextSort(projectId: string | null): number {
  const row = rows("SELECT COALESCE(MAX(sort_order), 0) AS n FROM tasks WHERE project_id IS ?", [projectId]);
  return asNum(row[0]?.n) + 1;
}

export { uid };

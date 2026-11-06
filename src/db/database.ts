import type { ChecklistItem, Comment, Reminder, Settings, Task } from "../types";
import type { Bundle } from "./bundle";
import { nowIso, uid } from "../lib/id";

export type { Bundle };

type Statement = { sql: string; params: unknown[] };

function normalize(params: unknown[]): unknown[] {
  return params.map((value) => (value === undefined ? null : value));
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) throw new Error((await response.text()) || "数据库请求失败");
  return response.json() as Promise<T>;
}

export async function query(sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
  const body = await requestJson<{ rows: Record<string, unknown>[] }>("/api/query", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sql, params: normalize(params) }),
  });
  return body.rows;
}

export async function run(sql: string, params: unknown[] = []): Promise<void> {
  await batch([{ sql, params }]);
}

export async function batch(statements: Statement[]): Promise<void> {
  if (!statements.length) return;
  await requestJson("/api/exec", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ statements: statements.map((statement) => ({ sql: statement.sql, params: normalize(statement.params) })) }),
  });
}

export async function loadBundle(): Promise<Bundle> {
  return requestJson<Bundle>("/api/state");
}

export async function saveSettings(settings: Settings): Promise<void> {
  await run("INSERT INTO settings (key, value) VALUES ('settings', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [
    JSON.stringify(settings),
  ]);
}

export async function insertTask(task: Task, tagIds: string[]): Promise<void> {
  await batch([
    {
      sql: `INSERT INTO tasks (
        id, project_id, column_id, parent_id, title, notes, priority, start_at, due_at, all_day, timezone,
        repeat_json, status, progress, pinned, pinned_at, completed_at, deleted_at, sort_order,
        location_name, location_lat, location_lng, location_radius, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      params: [
        task.id, task.projectId, task.columnId, task.parentId, task.title, task.notes, task.priority,
        task.startAt, task.dueAt, task.allDay ? 1 : 0, task.timezone, task.repeat ? JSON.stringify(task.repeat) : null,
        task.status, task.progress, task.pinned ? 1 : 0, task.pinnedAt, task.completedAt, task.deletedAt, task.sortOrder,
        task.locationName, task.locationLat, task.locationLng, task.locationRadius, task.createdAt, task.updatedAt,
      ],
    },
    ...tagIds.map((tagId) => ({ sql: "INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?)", params: [task.id, tagId] })),
  ]);
}

export async function updateTask(task: Task): Promise<void> {
  await run(
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
}

export async function setTaskTags(taskId: string, tagIds: string[]): Promise<void> {
  await batch([
    { sql: "DELETE FROM task_tags WHERE task_id = ?", params: [taskId] },
    ...tagIds.map((tagId) => ({ sql: "INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?)", params: [taskId, tagId] })),
  ]);
}

export async function replaceChecklist(taskId: string, items: ChecklistItem[]): Promise<void> {
  await batch([
    { sql: "DELETE FROM checklist_items WHERE task_id = ?", params: [taskId] },
    ...items.map((item, index) => ({
      sql: "INSERT INTO checklist_items (id, task_id, title, done, sort_order) VALUES (?, ?, ?, ?, ?)",
      params: [item.id || uid(), taskId, item.title, item.done ? 1 : 0, index],
    })),
  ]);
}

export async function replaceReminders(taskId: string, items: Reminder[]): Promise<void> {
  await batch([
    { sql: "DELETE FROM reminders WHERE task_id = ?", params: [taskId] },
    ...items.map((item) => ({
      sql: "INSERT INTO reminders (id, task_id, fire_at, offset_minutes, status, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      params: [item.id || uid(), taskId, item.fireAt, item.offsetMinutes, item.status, item.createdAt],
    })),
  ]);
}

export async function setReminder(id: string, fireAt: string, status: string): Promise<void> {
  await run("UPDATE reminders SET fire_at = ?, status = ? WHERE id = ?", [fireAt, status, id]);
}

export async function addComment(comment: Comment): Promise<void> {
  await run("INSERT INTO comments (id, task_id, body, created_at) VALUES (?, ?, ?, ?)", [
    comment.id, comment.taskId, comment.body, comment.createdAt,
  ]);
}

export async function deleteComment(id: string): Promise<void> {
  await run("DELETE FROM comments WHERE id = ?", [id]);
}

export async function addAttachment(id: string, taskId: string, name: string, mime: string, data: Uint8Array): Promise<void> {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < data.length; index += chunk) {
    binary += String.fromCharCode(...data.subarray(index, index + chunk));
  }
  await requestJson("/api/attachment", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, taskId, name, mime, createdAt: nowIso(), dataBase64: btoa(binary) }),
  });
}

export async function deleteAttachment(id: string): Promise<void> {
  await run("DELETE FROM attachments WHERE id = ?", [id]);
}

export function attachmentPath(id: string): string {
  return `/api/attachment/${id}`;
}

export async function ensureTag(name: string, color: string): Promise<string> {
  const existing = (await query("SELECT id FROM tags WHERE name = ?", [name]))[0];
  if (existing) return String(existing.id);
  const id = uid();
  await run("INSERT INTO tags (id, name, color) VALUES (?, ?, ?)", [id, name, color]);
  return id;
}

export async function nextSort(projectId: string | null): Promise<number> {
  const row = (await query("SELECT COALESCE(MAX(sort_order), 0) AS n FROM tasks WHERE project_id IS ?", [projectId]))[0];
  return Number(row?.n ?? 0) + 1;
}

export async function exportSnapshot(): Promise<string> {
  const response = await fetch("/api/export");
  if (!response.ok) throw new Error((await response.text()) || "导出失败");
  return response.text();
}

export async function importSnapshot(payload: unknown): Promise<void> {
  await requestJson("/api/import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

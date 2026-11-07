import * as db from "./db/database";
import type { Bundle } from "./db/database";
import { advanceDue, parseQuickAdd } from "./lib/nlp";
import { addDays, dueYmd, todayYmd, ymdString } from "./lib/dates";
import { distanceMeters } from "./lib/ics";
import { inboxProjectId } from "./lib/inbox";
import { nowIso, uid } from "./lib/id";
import {
  defaultSettings,
  type AuthUser,
  type ChecklistItem,
  type Comment,
  type Course,
  type Countdown,
  type FilterQuery,
  type Habit,
  type HabitLog,
  type Project,
  type Reminder,
  type Settings,
  type Task,
  type TimerItem,
} from "./types";

export type Notice = { id: string; title: string; body: string; reminderId?: string };

export type AppState = Bundle & {
  ready: boolean;
  bootError: string | null;
  undoLabel: string | null;
  notice: Notice | null;
  user: AuthUser | null;
};

const emptyBundle = (): Bundle => ({
  settings: defaultSettings(),
  folders: [],
  projects: [],
  columns: [],
  tasks: [],
  checklist: [],
  tags: [],
  taskTags: [],
  comments: [],
  attachments: [],
  reminders: [],
  templates: [],
  filters: [],
  habitSections: [],
  habits: [],
  habitLogs: [],
  sessions: [],
  sources: [],
  events: [],
  courses: [],
  periods: [],
  countdowns: [],
  timers: [],
  searchHistory: [],
  completions: [],
});

let state: AppState = { ...emptyBundle(), ready: false, bootError: null, undoLabel: null, notice: null, user: null };
let currentUser: AuthUser | null = null;

function currentInboxId(): string {
  return currentUser ? inboxProjectId(currentUser.id) : "inbox";
}
const listeners = new Set<() => void>();
const undoStack: { label: string; run: () => Promise<void> }[] = [];
let pending = Promise.resolve();

function emit(): void {
  listeners.forEach((listener) => listener());
}

async function refresh(patch: Partial<AppState> = {}): Promise<void> {
  const bundle = await db.loadBundle();
  state = {
    ...bundle,
    ready: true,
    bootError: null,
    undoLabel: undoStack[0]?.label ?? null,
    notice: state.notice,
    ...patch,
    user: currentUser,
  };
  emit();
}

function enqueue(task: () => Promise<void>): Promise<void> {
  const run = pending.then(task).catch((error: unknown) => {
    state = {
      ...state,
      notice: { id: uid(), title: "没有保存", body: error instanceof Error ? error.message : "保存失败" },
    };
    emit();
    throw error;
  });
  pending = run.then(() => undefined, () => undefined);
  return run;
}

function pushUndo(label: string, run: () => Promise<void>): void {
  undoStack.unshift({ label, run });
  undoStack.splice(20);
}

function taskById(id: string): Task | undefined {
  return state.tasks.find((task) => task.id === id);
}

export const store = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getState() {
    return state;
  },
  setUser(user: AuthUser) {
    currentUser = user;
    state = { ...state, user };
    emit();
  },
  reset() {
    currentUser = null;
    undoStack.splice(0);
    state = { ...emptyBundle(), ready: false, bootError: null, undoLabel: null, notice: null, user: null };
    emit();
  },
  async init() {
    try {
      await refresh({ ready: true, bootError: null });
    } catch (error) {
      state = { ...state, ready: false, bootError: error instanceof Error ? error.message : "数据库没有打开" };
      emit();
    }
  },
  dismissNotice() {
    state = { ...state, notice: null };
    emit();
  },
  undo() {
    const item = undoStack.shift();
    if (!item) return;
    void enqueue(async () => {
      await item.run();
      await refresh();
    });
  },
  updateSettings(patch: Partial<Settings>) {
    const settings = { ...state.settings, ...patch };
    void enqueue(async () => {
      await db.saveSettings(settings);
      await refresh();
    });
  },
  quickAdd(text: string, projectId?: string | null) {
    const parsed = parseQuickAdd(text, new Date(), state.settings.timezone);
    if (!parsed.title) return null;
    const taskId = uid();
    const project = projectId ?? currentInboxId();
    void enqueue(async () => {
      const tagIds: string[] = [];
      for (const name of parsed.tags) tagIds.push(await db.ensureTag(name, "#c2410c"));
      const stamp = nowIso();
      const task: Task = {
        id: taskId,
        projectId: project,
        columnId: null,
        parentId: null,
        title: parsed.title,
        notes: "",
        priority: parsed.priority ?? 0,
        startAt: null,
        dueAt: parsed.dueAt,
        allDay: parsed.allDay,
        timezone: state.settings.timezone,
        repeat: null,
        status: "open",
        progress: 0,
        pinned: false,
        pinnedAt: null,
        completedAt: null,
        deletedAt: null,
        sortOrder: await db.nextSort(project),
        locationName: null,
        locationLat: null,
        locationLng: null,
        locationRadius: null,
        createdAt: stamp,
        updatedAt: stamp,
      };
      await db.insertTask(task, tagIds);
      pushUndo("撤销新建", () => db.run("DELETE FROM tasks WHERE id = ?", [task.id]));
      await refresh();
    });
    return taskId;
  },
  saveTask(task: Task, tagIds: string[], checklist: ChecklistItem[], reminders: Reminder[]) {
    void enqueue(async () => {
      const existing = taskById(task.id);
      const progress = checklist.length
        ? Math.round((checklist.filter((item) => item.done).length / checklist.length) * 100)
        : task.progress;
      const next = { ...task, progress, updatedAt: nowIso() };
      if (existing) await db.updateTask(next);
      else await db.insertTask(next, []);
      await db.setTaskTags(task.id, tagIds);
      await db.replaceChecklist(task.id, checklist);
      const absoluteReminders = reminders.map((reminder) => ({
        ...reminder,
        fireAt:
          reminder.offsetMinutes !== null && next.dueAt && reminder.fireAt !== "location"
            ? new Date(new Date(next.dueAt).getTime() - reminder.offsetMinutes * 60000).toISOString()
            : reminder.fireAt,
      }));
      await db.replaceReminders(task.id, absoluteReminders);
      await refresh();
    });
  },
  toggleComplete(id: string) {
    const task = taskById(id);
    if (!task || task.deletedAt) return;
    const previous = { ...task };
    void enqueue(async () => {
      if (task.status === "open") {
        await db.run("INSERT INTO completions (id, task_id, title, completed_at) VALUES (?, ?, ?, ?)", [uid(), task.id, task.title, nowIso()]);
        if (task.repeat && task.dueAt) {
          const dueAt = advanceDue(task.dueAt, task.allDay, task.repeat);
          const startAt = task.startAt ? advanceDue(task.startAt, task.allDay, task.repeat) : null;
          await db.updateTask({ ...task, dueAt, startAt, status: "open", completedAt: null, progress: 0, updatedAt: nowIso() });
          await db.run("UPDATE checklist_items SET done = 0 WHERE task_id = ?", [task.id]);
        } else {
          await db.updateTask({ ...task, status: "completed", completedAt: nowIso(), progress: 100, updatedAt: nowIso() });
        }
      } else {
        await db.updateTask({ ...task, status: "open", completedAt: null, updatedAt: nowIso() });
      }
      pushUndo("撤销完成", () => db.updateTask(previous));
      await refresh();
    });
  },
  postpone(id: string) {
    const task = taskById(id);
    if (!task) return;
    void enqueue(async () => {
      const zone = task.timezone || state.settings.timezone;
      const base = dueYmd(task.dueAt, task.allDay, zone) ?? todayYmd(new Date(), zone);
      const next = ymdString(addDays(base, 1));
      await db.updateTask({ ...task, dueAt: task.allDay || !task.dueAt ? next : new Date(new Date(task.dueAt).getTime() + 86400000).toISOString(), updatedAt: nowIso() });
      await refresh();
    });
  },
  togglePin(id: string) {
    const task = taskById(id);
    if (!task) return;
    void enqueue(async () => {
      await db.updateTask({ ...task, pinned: !task.pinned, pinnedAt: task.pinned ? null : nowIso(), updatedAt: nowIso() });
      await refresh();
    });
  },
  trashTask(id: string) {
    const task = taskById(id);
    if (!task) return;
    void enqueue(async () => {
      await db.updateTask({ ...task, deletedAt: nowIso(), updatedAt: nowIso() });
      pushUndo("撤销删除", () => db.updateTask(task));
      await refresh();
    });
  },
  restoreTask(id: string) {
    const task = taskById(id);
    if (!task) return;
    void enqueue(async () => {
      await db.updateTask({ ...task, deletedAt: null, updatedAt: nowIso() });
      await refresh();
    });
  },
  addComment(taskId: string, body: string) {
    const comment: Comment = { id: uid(), taskId, body, createdAt: nowIso() };
    void enqueue(async () => {
      await db.addComment(comment);
      await refresh();
    });
  },
  deleteComment(id: string) {
    void enqueue(async () => {
      await db.deleteComment(id);
      await refresh();
    });
  },
  async addAttachment(taskId: string, file: File) {
    if (file.size > 1_500_000) throw new Error("附件请小于 1.5 MB");
    const data = new Uint8Array(await file.arrayBuffer());
    await enqueue(async () => {
      await db.addAttachment(uid(), taskId, file.name, file.type || "application/octet-stream", data);
      await refresh();
    });
  },
  deleteAttachment(id: string) {
    void enqueue(async () => {
      await db.deleteAttachment(id);
      await refresh();
    });
  },
  attachmentUrl(id: string) {
    return db.attachmentPath(id);
  },
  saveTag(name: string, color: string) {
    void enqueue(async () => {
      await db.ensureTag(name.trim(), color);
      await refresh();
    });
  },
  renameTag(id: string, name: string) {
    void enqueue(async () => {
      await db.run("UPDATE tags SET name = ? WHERE id = ?", [name.trim(), id]);
      await refresh();
    });
  },
  deleteTag(id: string) {
    void enqueue(async () => {
      await db.batch([
        { sql: "DELETE FROM task_tags WHERE tag_id = ?", params: [id] },
        { sql: "DELETE FROM tags WHERE id = ?", params: [id] },
      ]);
      await refresh();
    });
  },
  saveProject(project: Project) {
    const existing = state.projects.some((item) => item.id === project.id);
    void enqueue(async () => {
      if (existing) {
        await db.run(
          "UPDATE projects SET folder_id=?, name=?, color=?, pinned=?, archived=?, sort_order=? WHERE id=?",
          [project.folderId, project.name, project.color, project.pinned ? 1 : 0, project.archived ? 1 : 0, project.sortOrder, project.id],
        );
      } else {
        await db.run("INSERT INTO projects (id, folder_id, name, color, pinned, archived, sort_order, created_at) VALUES (?,?,?,?,?,?,?,?)", [
          project.id, project.folderId, project.name, project.color, project.pinned ? 1 : 0, project.archived ? 1 : 0, project.sortOrder, project.createdAt,
        ]);
      }
      await refresh();
    });
  },
  saveFolder(id: string, name: string) {
    const existing = state.folders.some((folder) => folder.id === id);
    const sortOrder = state.folders.length;
    void enqueue(async () => {
      if (existing) await db.run("UPDATE folders SET name = ? WHERE id = ?", [name, id]);
      else await db.run("INSERT INTO folders (id, name, sort_order) VALUES (?, ?, ?)", [id, name, sortOrder]);
      await refresh();
    });
  },
  deleteFolder(id: string) {
    void enqueue(async () => {
      await db.batch([
        { sql: "UPDATE projects SET folder_id = NULL WHERE folder_id = ?", params: [id] },
        { sql: "DELETE FROM folders WHERE id = ?", params: [id] },
      ]);
      await refresh();
    });
  },
  saveColumn(projectId: string, id: string, name: string) {
    const existing = state.columns.some((column) => column.id === id);
    const sortOrder = state.columns.filter((column) => column.projectId === projectId).length;
    void enqueue(async () => {
      if (existing) await db.run("UPDATE columns SET name = ? WHERE id = ?", [name, id]);
      else await db.run("INSERT INTO columns (id, project_id, name, sort_order) VALUES (?, ?, ?, ?)", [id, projectId, name, sortOrder]);
      await refresh();
    });
  },
  deleteColumn(id: string) {
    void enqueue(async () => {
      await db.batch([
        { sql: "UPDATE tasks SET column_id = NULL WHERE column_id = ?", params: [id] },
        { sql: "DELETE FROM columns WHERE id = ?", params: [id] },
      ]);
      await refresh();
    });
  },
  moveTaskToColumn(taskId: string, columnId: string | null) {
    const task = taskById(taskId);
    if (!task) return;
    void enqueue(async () => {
      await db.updateTask({ ...task, columnId, updatedAt: nowIso() });
      await refresh();
    });
  },
  saveFilter(id: string, name: string, query: FilterQuery) {
    const existing = state.filters.some((filter) => filter.id === id);
    const sortOrder = state.filters.length;
    void enqueue(async () => {
      if (existing) await db.run("UPDATE smart_filters SET name = ?, query_json = ? WHERE id = ?", [name, JSON.stringify(query), id]);
      else await db.run("INSERT INTO smart_filters (id, name, query_json, sort_order) VALUES (?, ?, ?, ?)", [id, name, JSON.stringify(query), sortOrder]);
      await refresh();
    });
  },
  deleteFilter(id: string) {
    void enqueue(async () => {
      await db.run("DELETE FROM smart_filters WHERE id = ?", [id]);
      await refresh();
    });
  },
  rememberSearch(query: string) {
    const trimmed = query.trim();
    if (!trimmed) return;
    void enqueue(async () => {
      await db.run("INSERT INTO search_history (id, query, created_at) VALUES (?, ?, ?)", [uid(), trimmed, nowIso()]);
      await refresh();
    });
  },
  saveTemplate(taskId: string, name: string) {
    const task = taskById(taskId);
    if (!task) return;
    const checklist = state.checklist.filter((item) => item.taskId === taskId);
    const tagIds = state.taskTags.filter((link) => link.taskId === taskId).map((link) => link.tagId);
    void enqueue(async () => {
      await db.run("INSERT INTO templates (id, name, payload_json, created_at) VALUES (?, ?, ?, ?)", [
        uid(),
        name,
        JSON.stringify({ task, checklist, tagIds }),
        nowIso(),
      ]);
      await refresh();
    });
  },
  createFromTemplate(templateId: string) {
    const template = state.templates.find((item) => item.id === templateId);
    if (!template) return;
    const payload = JSON.parse(template.payloadJson) as { task: Task; checklist: ChecklistItem[]; tagIds: string[] };
    void enqueue(async () => {
      const id = uid();
      const stamp = nowIso();
      await db.insertTask({ ...payload.task, id, status: "open", completedAt: null, deletedAt: null, createdAt: stamp, updatedAt: stamp, sortOrder: await db.nextSort(payload.task.projectId) }, payload.tagIds);
      await db.replaceChecklist(id, payload.checklist.map((item) => ({ ...item, id: uid(), taskId: id, done: false })));
      await refresh();
    });
  },
  saveHabit(habit: Habit) {
    const existing = state.habits.some((item) => item.id === habit.id);
    void enqueue(async () => {
      if (existing) {
        await db.run("UPDATE habits SET section_id=?, name=?, preset=?, period=?, target_count=?, archived=? WHERE id=?", [
          habit.sectionId, habit.name, habit.preset, habit.period, habit.targetCount, habit.archived ? 1 : 0, habit.id,
        ]);
      } else {
        await db.run("INSERT INTO habits (id, section_id, name, preset, period, target_count, archived, created_at) VALUES (?,?,?,?,?,?,?,?)", [
          habit.id, habit.sectionId, habit.name, habit.preset, habit.period, habit.targetCount, habit.archived ? 1 : 0, habit.createdAt,
        ]);
      }
      await refresh();
    });
  },
  saveHabitSection(id: string, name: string) {
    const existing = state.habitSections.some((section) => section.id === id);
    const sortOrder = state.habitSections.length;
    void enqueue(async () => {
      if (existing) await db.run("UPDATE habit_sections SET name = ? WHERE id = ?", [name, id]);
      else await db.run("INSERT INTO habit_sections (id, name, sort_order) VALUES (?, ?, ?)", [id, name, sortOrder]);
      await refresh();
    });
  },
  logHabit(habitId: string, day: string, status: HabitLog["status"] | null) {
    void enqueue(async () => {
      await db.run("DELETE FROM habit_logs WHERE habit_id = ? AND day = ?", [habitId, day]);
      if (status) await db.run("INSERT INTO habit_logs (id, habit_id, day, status) VALUES (?, ?, ?, ?)", [uid(), habitId, day, status]);
      await refresh();
    });
  },
  startFocus(mode: "pomodoro-work" | "pomodoro-break" | "stopwatch", seconds: number, taskId: string | null) {
    void enqueue(async () => {
      await db.batch([
        { sql: "UPDATE focus_sessions SET ended_at = ? WHERE ended_at IS NULL", params: [nowIso()] },
        { sql: "INSERT INTO focus_sessions (id, mode, started_at, ended_at, planned_seconds, task_id) VALUES (?, ?, ?, NULL, ?, ?)", params: [uid(), mode, nowIso(), seconds, taskId] },
      ]);
      await refresh();
    });
  },
  stopFocus() {
    void enqueue(async () => {
      await db.run("UPDATE focus_sessions SET ended_at = ? WHERE ended_at IS NULL", [nowIso()]);
      await refresh();
    });
  },
  addEvents(sourceId: string | null, events: { title: string; startAt: string; endAt: string | null; allDay: boolean }[]) {
    void enqueue(async () => {
      await db.batch(events.map((event) => ({
        sql: "INSERT INTO events (id, source_id, title, start_at, end_at, all_day) VALUES (?, ?, ?, ?, ?, ?)",
        params: [uid(), sourceId, event.title, event.startAt, event.endAt, event.allDay ? 1 : 0],
      })));
      await refresh();
    });
  },
  saveSource(name: string, url: string | null) {
    const id = uid();
    void enqueue(async () => {
      await db.run("INSERT INTO calendar_sources (id, name, url, created_at) VALUES (?, ?, ?, ?)", [id, name, url, nowIso()]);
      await refresh();
    });
    return id;
  },
  deleteSource(id: string) {
    void enqueue(async () => {
      await db.batch([
        { sql: "DELETE FROM events WHERE source_id = ?", params: [id] },
        { sql: "DELETE FROM calendar_sources WHERE id = ?", params: [id] },
      ]);
      await refresh();
    });
  },
  saveCourse(course: Course) {
    const existing = state.courses.some((item) => item.id === course.id);
    void enqueue(async () => {
      if (existing) {
        await db.run("UPDATE courses SET name=?, teacher=?, room=?, weekday=?, start_slot=?, end_slot=?, color=? WHERE id=?", [
          course.name, course.teacher, course.room, course.weekday, course.startSlot, course.endSlot, course.color, course.id,
        ]);
      } else {
        await db.run("INSERT INTO courses (id, name, teacher, room, weekday, start_slot, end_slot, color) VALUES (?,?,?,?,?,?,?,?)", [
          course.id, course.name, course.teacher, course.room, course.weekday, course.startSlot, course.endSlot, course.color,
        ]);
      }
      await refresh();
    });
  },
  deleteCourse(id: string) {
    void enqueue(async () => {
      await db.run("DELETE FROM courses WHERE id = ?", [id]);
      await refresh();
    });
  },
  saveCountdown(item: Countdown) {
    const existing = state.countdowns.some((row) => row.id === item.id);
    void enqueue(async () => {
      if (existing) await db.run("UPDATE countdowns SET title=?, target_on=?, archived=? WHERE id=?", [item.title, item.targetOn, item.archived ? 1 : 0, item.id]);
      else await db.run("INSERT INTO countdowns (id, title, target_on, archived) VALUES (?, ?, ?, ?)", [item.id, item.title, item.targetOn, item.archived ? 1 : 0]);
      await refresh();
    });
  },
  saveTimer(item: TimerItem) {
    const existing = state.timers.some((row) => row.id === item.id);
    void enqueue(async () => {
      if (existing) {
        await db.run("UPDATE timers SET title=?, duration_seconds=?, remaining_seconds=?, running_since=?, archived=? WHERE id=?", [
          item.title, item.durationSeconds, item.remainingSeconds, item.runningSince, item.archived ? 1 : 0, item.id,
        ]);
      } else {
        await db.run("INSERT INTO timers (id, title, duration_seconds, remaining_seconds, running_since, archived) VALUES (?,?,?,?,?,?)", [
          item.id, item.title, item.durationSeconds, item.remainingSeconds, item.runningSince, item.archived ? 1 : 0,
        ]);
      }
      await refresh();
    });
  },
  fireDueReminders() {
    const now = Date.now();
    const due = state.reminders.filter((reminder) => reminder.status === "pending" && reminder.fireAt !== "location" && new Date(reminder.fireAt).getTime() <= now);
    if (!due.length) return;
    void enqueue(async () => {
      let notice = state.notice;
      for (const reminder of due) {
        const task = state.tasks.find((item) => item.id === reminder.taskId);
        await db.setReminder(reminder.id, reminder.fireAt, "fired");
        notice = { id: uid(), title: task?.title ?? "提醒", body: "到点了", reminderId: reminder.id };
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification(task?.title ?? "mytodo", { body: "待办提醒" });
        }
      }
      await refresh({ notice });
    });
  },
  snooze(reminderId: string, minutes: number) {
    void enqueue(async () => {
      await db.setReminder(reminderId, new Date(Date.now() + minutes * 60000).toISOString(), "pending");
      await refresh({ notice: null });
    });
  },
  checkLocation(lat: number, lng: number) {
    const hits = state.tasks.flatMap((task) => {
      if (task.locationLat === null || task.locationLng === null || task.deletedAt || task.status === "completed") return [];
      const radius = task.locationRadius ?? 300;
      if (distanceMeters(lat, lng, task.locationLat, task.locationLng) > radius) return [];
      const reminder = state.reminders.find((item) => item.taskId === task.id && item.fireAt === "location" && item.status === "pending");
      return reminder ? [{ task, reminder }] : [];
    });
    if (!hits.length) return;
    void enqueue(async () => {
      let notice = state.notice;
      for (const hit of hits) {
        await db.setReminder(hit.reminder.id, "location", "fired");
        notice = { id: uid(), title: hit.task.title, body: `已到达${hit.task.locationName || "指定地点"}`, reminderId: hit.reminder.id };
      }
      await refresh({ notice });
    });
  },
  async exportFile() {
    return db.exportSnapshot();
  },
  async importFile(payload: unknown) {
    await enqueue(async () => {
      await db.importSnapshot(payload);
      undoStack.splice(0);
      await refresh({ notice: null });
    });
  },
};

export function blankTask(projectId: string | null = currentInboxId()): Task {
  const stamp = nowIso();
  return {
    id: uid(),
    projectId,
    columnId: null,
    parentId: null,
    title: "",
    notes: "",
    priority: 0,
    startAt: null,
    dueAt: null,
    allDay: false,
    timezone: state.settings.timezone,
    repeat: null,
    status: "open",
    progress: 0,
    pinned: false,
    pinnedAt: null,
    completedAt: null,
    deletedAt: null,
    sortOrder: 0,
    locationName: null,
    locationLat: null,
    locationLng: null,
    locationRadius: 300,
    createdAt: stamp,
    updatedAt: stamp,
  };
}

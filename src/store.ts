import * as db from "./db/database";
import type { Bundle } from "./db/database";
import { advanceDue, parseQuickAdd } from "./lib/nlp";
import { addDays, dueYmd, todayYmd, ymdString } from "./lib/dates";
import { distanceMeters } from "./lib/ics";
import { nowIso, uid } from "./lib/id";
import {
  defaultSettings,
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

let state: AppState = { ...emptyBundle(), ready: false, bootError: null, undoLabel: null, notice: null };
const listeners = new Set<() => void>();
const undoStack: { label: string; run: () => void }[] = [];

function publish(patch: Partial<AppState> = {}): void {
  const bundle = state.ready || patch.ready ? db.loadBundle() : emptyBundle();
  state = { ...bundle, ready: state.ready, bootError: state.bootError, undoLabel: undoStack[0]?.label ?? null, notice: state.notice, ...patch };
  listeners.forEach((listener) => listener());
}

function pushUndo(label: string, run: () => void): void {
  undoStack.unshift({ label, run });
  undoStack.splice(20);
}

export const store = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getState() {
    return state;
  },
  async init() {
    try {
      await db.openDatabase();
      publish({ ready: true, bootError: null });
    } catch (error) {
      state = { ...state, ready: false, bootError: error instanceof Error ? error.message : "数据库没有打开" };
      listeners.forEach((listener) => listener());
    }
  },
  dismissNotice() {
    state = { ...state, notice: null };
    listeners.forEach((listener) => listener());
  },
  undo() {
    const item = undoStack.shift();
    if (!item) return;
    item.run();
    publish();
  },
  updateSettings(patch: Partial<Settings>) {
    const settings = { ...state.settings, ...patch };
    db.saveSettings(settings);
    publish();
  },
  quickAdd(text: string, projectId?: string | null) {
    const parsed = parseQuickAdd(text, new Date(), state.settings.timezone);
    if (!parsed.title) return null;
    const tagIds = parsed.tags.map((name) => db.ensureTag(name, "#c2410c"));
    const stamp = nowIso();
    const task: Task = {
      id: uid(),
      projectId: projectId ?? "inbox",
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
      sortOrder: db.nextSort(projectId ?? "inbox"),
      locationName: null,
      locationLat: null,
      locationLng: null,
      locationRadius: null,
      createdAt: stamp,
      updatedAt: stamp,
    };
    db.insertTask(task, tagIds);
    pushUndo("撤销新建", () => db.run("DELETE FROM tasks WHERE id = ?", [task.id]));
    publish();
    return task.id;
  },
  saveTask(task: Task, tagIds: string[], checklist: ChecklistItem[], reminders: Reminder[]) {
    const existing = db.getTask(task.id);
    const progress = checklist.length
      ? Math.round((checklist.filter((item) => item.done).length / checklist.length) * 100)
      : task.progress;
    const next = { ...task, progress, updatedAt: nowIso() };
    if (existing) db.updateTask(next);
    else db.insertTask(next, []);
    db.setTaskTags(task.id, tagIds);
    db.replaceChecklist(task.id, checklist);
    const absoluteReminders = reminders.map((reminder) => ({
      ...reminder,
      fireAt:
        reminder.offsetMinutes !== null && next.dueAt && reminder.fireAt !== "location"
          ? new Date(new Date(next.dueAt).getTime() - reminder.offsetMinutes * 60000).toISOString()
          : reminder.fireAt,
    }));
    db.replaceReminders(task.id, absoluteReminders);
    publish();
  },
  toggleComplete(id: string) {
    const task = db.getTask(id);
    if (!task || task.deletedAt) return;
    const previous = { ...task };
    if (task.status === "open") {
      db.run("INSERT INTO completions (id, task_id, title, completed_at) VALUES (?, ?, ?, ?)", [uid(), task.id, task.title, nowIso()]);
      if (task.repeat && task.dueAt) {
        const dueAt = advanceDue(task.dueAt, task.allDay, task.repeat);
        const startAt = task.startAt ? advanceDue(task.startAt, task.allDay, task.repeat) : null;
        db.updateTask({ ...task, dueAt, startAt, status: "open", completedAt: null, progress: 0, updatedAt: nowIso() });
        db.run("UPDATE checklist_items SET done = 0 WHERE task_id = ?", [task.id]);
      } else {
        db.updateTask({ ...task, status: "completed", completedAt: nowIso(), progress: 100, updatedAt: nowIso() });
      }
    } else {
      db.updateTask({ ...task, status: "open", completedAt: null, updatedAt: nowIso() });
    }
    pushUndo("撤销完成", () => db.updateTask(previous));
    publish();
  },
  postpone(id: string) {
    const task = db.getTask(id);
    if (!task) return;
    const zone = task.timezone || state.settings.timezone;
    const base = dueYmd(task.dueAt, task.allDay, zone) ?? todayYmd(new Date(), zone);
    const next = ymdString(addDays(base, 1));
    db.updateTask({ ...task, dueAt: task.allDay || !task.dueAt ? next : new Date(new Date(task.dueAt).getTime() + 86400000).toISOString(), updatedAt: nowIso() });
    publish();
  },
  togglePin(id: string) {
    const task = db.getTask(id);
    if (!task) return;
    db.updateTask({ ...task, pinned: !task.pinned, pinnedAt: task.pinned ? null : nowIso(), updatedAt: nowIso() });
    publish();
  },
  trashTask(id: string) {
    const task = db.getTask(id);
    if (!task) return;
    db.updateTask({ ...task, deletedAt: nowIso(), updatedAt: nowIso() });
    pushUndo("撤销删除", () => db.updateTask(task));
    publish();
  },
  restoreTask(id: string) {
    const task = db.getTask(id);
    if (!task) return;
    db.updateTask({ ...task, deletedAt: null, updatedAt: nowIso() });
    publish();
  },
  addComment(taskId: string, body: string) {
    const comment: Comment = { id: uid(), taskId, body, createdAt: nowIso() };
    db.addComment(comment);
    publish();
  },
  deleteComment(id: string) {
    db.deleteComment(id);
    publish();
  },
  async addAttachment(taskId: string, file: File) {
    if (file.size > 1_500_000) throw new Error("附件请小于 1.5 MB");
    const data = new Uint8Array(await file.arrayBuffer());
    db.addAttachment(uid(), taskId, file.name, file.type || "application/octet-stream", data);
    publish();
  },
  deleteAttachment(id: string) {
    db.deleteAttachment(id);
    publish();
  },
  attachmentUrl(id: string) {
    const file = db.readAttachment(id);
    if (!file) return null;
    return URL.createObjectURL(new Blob([file.data as BlobPart], { type: file.mime }));
  },
  saveTag(name: string, color: string) {
    db.ensureTag(name.trim(), color);
    publish();
  },
  renameTag(id: string, name: string) {
    db.run("UPDATE tags SET name = ? WHERE id = ?", [name.trim(), id]);
    publish();
  },
  deleteTag(id: string) {
    db.run("DELETE FROM task_tags WHERE tag_id = ?", [id]);
    db.run("DELETE FROM tags WHERE id = ?", [id]);
    publish();
  },
  saveProject(project: Project) {
    const existing = state.projects.some((item) => item.id === project.id);
    if (existing) {
      db.run(
        "UPDATE projects SET folder_id=?, name=?, color=?, pinned=?, archived=?, sort_order=? WHERE id=?",
        [project.folderId, project.name, project.color, project.pinned ? 1 : 0, project.archived ? 1 : 0, project.sortOrder, project.id],
      );
    } else {
      db.run("INSERT INTO projects (id, folder_id, name, color, pinned, archived, sort_order, created_at) VALUES (?,?,?,?,?,?,?,?)", [
        project.id, project.folderId, project.name, project.color, project.pinned ? 1 : 0, project.archived ? 1 : 0, project.sortOrder, project.createdAt,
      ]);
    }
    publish();
  },
  saveFolder(id: string, name: string) {
    if (state.folders.some((folder) => folder.id === id)) db.run("UPDATE folders SET name = ? WHERE id = ?", [name, id]);
    else db.run("INSERT INTO folders (id, name, sort_order) VALUES (?, ?, ?)", [id, name, state.folders.length]);
    publish();
  },
  deleteFolder(id: string) {
    db.run("UPDATE projects SET folder_id = NULL WHERE folder_id = ?", [id]);
    db.run("DELETE FROM folders WHERE id = ?", [id]);
    publish();
  },
  saveColumn(projectId: string, id: string, name: string) {
    if (state.columns.some((column) => column.id === id)) db.run("UPDATE columns SET name = ? WHERE id = ?", [name, id]);
    else db.run("INSERT INTO columns (id, project_id, name, sort_order) VALUES (?, ?, ?, ?)", [id, projectId, name, state.columns.filter((column) => column.projectId === projectId).length]);
    publish();
  },
  deleteColumn(id: string) {
    db.run("UPDATE tasks SET column_id = NULL WHERE column_id = ?", [id]);
    db.run("DELETE FROM columns WHERE id = ?", [id]);
    publish();
  },
  moveTaskToColumn(taskId: string, columnId: string | null) {
    const task = db.getTask(taskId);
    if (!task) return;
    db.updateTask({ ...task, columnId, updatedAt: nowIso() });
    publish();
  },
  saveFilter(id: string, name: string, query: FilterQuery) {
    if (state.filters.some((filter) => filter.id === id)) {
      db.run("UPDATE smart_filters SET name = ?, query_json = ? WHERE id = ?", [name, JSON.stringify(query), id]);
    } else {
      db.run("INSERT INTO smart_filters (id, name, query_json, sort_order) VALUES (?, ?, ?, ?)", [id, name, JSON.stringify(query), state.filters.length]);
    }
    publish();
  },
  deleteFilter(id: string) {
    db.run("DELETE FROM smart_filters WHERE id = ?", [id]);
    publish();
  },
  rememberSearch(query: string) {
    const trimmed = query.trim();
    if (!trimmed) return;
    db.run("INSERT INTO search_history (id, query, created_at) VALUES (?, ?, ?)", [uid(), trimmed, nowIso()]);
    publish();
  },
  saveTemplate(taskId: string, name: string) {
    const task = state.tasks.find((item) => item.id === taskId);
    if (!task) return;
    const checklist = state.checklist.filter((item) => item.taskId === taskId);
    const tagIds = state.taskTags.filter((link) => link.taskId === taskId).map((link) => link.tagId);
    db.run("INSERT INTO templates (id, name, payload_json, created_at) VALUES (?, ?, ?, ?)", [
      uid(),
      name,
      JSON.stringify({ task, checklist, tagIds }),
      nowIso(),
    ]);
    publish();
  },
  createFromTemplate(templateId: string) {
    const template = state.templates.find((item) => item.id === templateId);
    if (!template) return;
    const payload = JSON.parse(template.payloadJson) as { task: Task; checklist: ChecklistItem[]; tagIds: string[] };
    const id = uid();
    const stamp = nowIso();
    db.insertTask({ ...payload.task, id, status: "open", completedAt: null, deletedAt: null, createdAt: stamp, updatedAt: stamp, sortOrder: db.nextSort(payload.task.projectId) }, payload.tagIds);
    db.replaceChecklist(id, payload.checklist.map((item) => ({ ...item, id: uid(), taskId: id, done: false })));
    publish();
  },
  saveHabit(habit: Habit) {
    if (state.habits.some((item) => item.id === habit.id)) {
      db.run("UPDATE habits SET section_id=?, name=?, preset=?, period=?, target_count=?, archived=? WHERE id=?", [
        habit.sectionId, habit.name, habit.preset, habit.period, habit.targetCount, habit.archived ? 1 : 0, habit.id,
      ]);
    } else {
      db.run("INSERT INTO habits (id, section_id, name, preset, period, target_count, archived, created_at) VALUES (?,?,?,?,?,?,?,?)", [
        habit.id, habit.sectionId, habit.name, habit.preset, habit.period, habit.targetCount, habit.archived ? 1 : 0, habit.createdAt,
      ]);
    }
    publish();
  },
  saveHabitSection(id: string, name: string) {
    if (state.habitSections.some((section) => section.id === id)) db.run("UPDATE habit_sections SET name = ? WHERE id = ?", [name, id]);
    else db.run("INSERT INTO habit_sections (id, name, sort_order) VALUES (?, ?, ?)", [id, name, state.habitSections.length]);
    publish();
  },
  logHabit(habitId: string, day: string, status: HabitLog["status"] | null) {
    db.run("DELETE FROM habit_logs WHERE habit_id = ? AND day = ?", [habitId, day]);
    if (status) db.run("INSERT INTO habit_logs (id, habit_id, day, status) VALUES (?, ?, ?, ?)", [uid(), habitId, day, status]);
    publish();
  },
  startFocus(mode: "pomodoro-work" | "pomodoro-break" | "stopwatch", seconds: number, taskId: string | null) {
    db.run("UPDATE focus_sessions SET ended_at = ? WHERE ended_at IS NULL", [nowIso()]);
    db.run("INSERT INTO focus_sessions (id, mode, started_at, ended_at, planned_seconds, task_id) VALUES (?, ?, ?, NULL, ?, ?)", [
      uid(), mode, nowIso(), seconds, taskId,
    ]);
    publish();
  },
  stopFocus() {
    db.run("UPDATE focus_sessions SET ended_at = ? WHERE ended_at IS NULL", [nowIso()]);
    publish();
  },
  addEvents(sourceId: string | null, events: { title: string; startAt: string; endAt: string | null; allDay: boolean }[]) {
    events.forEach((event) => {
      db.run("INSERT INTO events (id, source_id, title, start_at, end_at, all_day) VALUES (?, ?, ?, ?, ?, ?)", [
        uid(), sourceId, event.title, event.startAt, event.endAt, event.allDay ? 1 : 0,
      ]);
    });
    publish();
  },
  saveSource(name: string, url: string | null) {
    const id = uid();
    db.run("INSERT INTO calendar_sources (id, name, url, created_at) VALUES (?, ?, ?, ?)", [id, name, url, nowIso()]);
    publish();
    return id;
  },
  deleteSource(id: string) {
    db.run("DELETE FROM events WHERE source_id = ?", [id]);
    db.run("DELETE FROM calendar_sources WHERE id = ?", [id]);
    publish();
  },
  saveCourse(course: Course) {
    if (state.courses.some((item) => item.id === course.id)) {
      db.run("UPDATE courses SET name=?, teacher=?, room=?, weekday=?, start_slot=?, end_slot=?, color=? WHERE id=?", [
        course.name, course.teacher, course.room, course.weekday, course.startSlot, course.endSlot, course.color, course.id,
      ]);
    } else {
      db.run("INSERT INTO courses (id, name, teacher, room, weekday, start_slot, end_slot, color) VALUES (?,?,?,?,?,?,?,?)", [
        course.id, course.name, course.teacher, course.room, course.weekday, course.startSlot, course.endSlot, course.color,
      ]);
    }
    publish();
  },
  deleteCourse(id: string) {
    db.run("DELETE FROM courses WHERE id = ?", [id]);
    publish();
  },
  saveCountdown(item: Countdown) {
    if (state.countdowns.some((row) => row.id === item.id)) {
      db.run("UPDATE countdowns SET title=?, target_on=?, archived=? WHERE id=?", [item.title, item.targetOn, item.archived ? 1 : 0, item.id]);
    } else {
      db.run("INSERT INTO countdowns (id, title, target_on, archived) VALUES (?, ?, ?, ?)", [item.id, item.title, item.targetOn, item.archived ? 1 : 0]);
    }
    publish();
  },
  saveTimer(item: TimerItem) {
    if (state.timers.some((row) => row.id === item.id)) {
      db.run("UPDATE timers SET title=?, duration_seconds=?, remaining_seconds=?, running_since=?, archived=? WHERE id=?", [
        item.title, item.durationSeconds, item.remainingSeconds, item.runningSince, item.archived ? 1 : 0, item.id,
      ]);
    } else {
      db.run("INSERT INTO timers (id, title, duration_seconds, remaining_seconds, running_since, archived) VALUES (?,?,?,?,?,?)", [
        item.id, item.title, item.durationSeconds, item.remainingSeconds, item.runningSince, item.archived ? 1 : 0,
      ]);
    }
    publish();
  },
  fireDueReminders() {
    const now = Date.now();
    let changed = false;
    state.reminders
      .filter((reminder) => reminder.status === "pending" && reminder.fireAt !== "location" && new Date(reminder.fireAt).getTime() <= now)
      .forEach((reminder) => {
        const task = state.tasks.find((item) => item.id === reminder.taskId);
        db.setReminder(reminder.id, reminder.fireAt, "fired");
        state = {
          ...state,
          notice: { id: uid(), title: task?.title ?? "提醒", body: "到点了", reminderId: reminder.id },
        };
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification(task?.title ?? "mytodo", { body: "待办提醒" });
        }
        changed = true;
      });
    if (changed) publish({ notice: state.notice });
  },
  snooze(reminderId: string, minutes: number) {
    db.setReminder(reminderId, new Date(Date.now() + minutes * 60000).toISOString(), "pending");
    publish({ notice: null });
  },
  checkLocation(lat: number, lng: number) {
    state.tasks.forEach((task) => {
      if (task.locationLat === null || task.locationLng === null || task.deletedAt || task.status === "completed") return;
      const radius = task.locationRadius ?? 300;
      if (distanceMeters(lat, lng, task.locationLat, task.locationLng) > radius) return;
      const reminder = state.reminders.find((item) => item.taskId === task.id && item.fireAt === "location" && item.status === "pending");
      if (!reminder) return;
      db.setReminder(reminder.id, "location", "fired");
      publish({ notice: { id: uid(), title: task.title, body: `已到达${task.locationName || "指定地点"}`, reminderId: reminder.id } });
    });
  },
  async exportFile() {
    await db.persistNow();
    return db.exportDatabase();
  },
  async importFile(bytes: Uint8Array) {
    await db.replaceDatabase(bytes);
    undoStack.splice(0);
    publish({ notice: null });
  },
};

export function blankTask(projectId: string | null = "inbox"): Task {
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

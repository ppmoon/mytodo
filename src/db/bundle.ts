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

export type SqlRow = Record<string, unknown>;

export type Bundle = {
  settings: Settings;
  folders: Folder[];
  projects: Project[];
  columns: Column[];
  tasks: Task[];
  checklist: ChecklistItem[];
  tags: Tag[];
  taskTags: { taskId: string; tagId: string }[];
  comments: Comment[];
  attachments: AttachmentMeta[];
  reminders: Reminder[];
  templates: Template[];
  filters: SmartFilter[];
  habitSections: HabitSection[];
  habits: Habit[];
  habitLogs: HabitLog[];
  sessions: FocusSession[];
  sources: CalendarSource[];
  events: CalEvent[];
  courses: Course[];
  periods: Period[];
  countdowns: Countdown[];
  timers: TimerItem[];
  searchHistory: SearchEntry[];
  completions: Completion[];
};

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}

function num(value: unknown): number {
  return Number(value ?? 0);
}

function flag(value: unknown): boolean {
  return Number(value ?? 0) === 1;
}

function taskFrom(row: SqlRow): Task {
  return {
    id: String(row.id),
    projectId: text(row.project_id),
    columnId: text(row.column_id),
    parentId: text(row.parent_id),
    title: String(row.title),
    notes: String(row.notes ?? ""),
    priority: num(row.priority),
    startAt: text(row.start_at),
    dueAt: text(row.due_at),
    allDay: flag(row.all_day),
    timezone: String(row.timezone),
    repeat: row.repeat_json ? (JSON.parse(String(row.repeat_json)) as RepeatRule) : null,
    status: String(row.status) === "completed" ? "completed" : "open",
    progress: num(row.progress),
    pinned: flag(row.pinned),
    pinnedAt: text(row.pinned_at),
    completedAt: text(row.completed_at),
    deletedAt: text(row.deleted_at),
    sortOrder: num(row.sort_order),
    locationName: text(row.location_name),
    locationLat: row.location_lat === null || row.location_lat === undefined ? null : Number(row.location_lat),
    locationLng: row.location_lng === null || row.location_lng === undefined ? null : Number(row.location_lng),
    locationRadius: row.location_radius === null || row.location_radius === undefined ? null : num(row.location_radius),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function assemble(tables: {
  settings: SqlRow[];
  folders: SqlRow[];
  projects: SqlRow[];
  columns: SqlRow[];
  tasks: SqlRow[];
  checklist: SqlRow[];
  tags: SqlRow[];
  taskTags: SqlRow[];
  comments: SqlRow[];
  attachments: SqlRow[];
  reminders: SqlRow[];
  templates: SqlRow[];
  filters: SqlRow[];
  habitSections: SqlRow[];
  habits: SqlRow[];
  habitLogs: SqlRow[];
  sessions: SqlRow[];
  sources: SqlRow[];
  events: SqlRow[];
  courses: SqlRow[];
  periods: SqlRow[];
  countdowns: SqlRow[];
  timers: SqlRow[];
  searchHistory: SqlRow[];
  completions: SqlRow[];
}): Bundle {
  const settingsRow = Object.fromEntries(tables.settings.map((row) => [String(row.key), String(row.value)]));
  const settings: Settings = { ...defaultSettings(), ...(settingsRow.settings ? (JSON.parse(settingsRow.settings) as Settings) : {}) };
  if (settings.accent.toLowerCase() === "#0f6e6e") settings.accent = "#1f6b4a";
  if (settings.tabs.join() === "today,calendar,habits,focus,more") settings.tabs = defaultSettings().tabs;
  return {
    settings,
    folders: tables.folders.map((row) => ({ id: String(row.id), name: String(row.name), sortOrder: num(row.sort_order) })),
    projects: tables.projects.map((row) => ({
      id: String(row.id),
      folderId: text(row.folder_id),
      name: String(row.name),
      color: String(row.color),
      pinned: flag(row.pinned),
      archived: flag(row.archived),
      sortOrder: num(row.sort_order),
      createdAt: String(row.created_at),
    })),
    columns: tables.columns.map((row) => ({
      id: String(row.id),
      projectId: String(row.project_id),
      name: String(row.name),
      sortOrder: num(row.sort_order),
    })),
    tasks: tables.tasks.map(taskFrom),
    checklist: tables.checklist.map((row) => ({
      id: String(row.id),
      taskId: String(row.task_id),
      title: String(row.title),
      done: flag(row.done),
      sortOrder: num(row.sort_order),
    })),
    tags: tables.tags.map((row) => ({ id: String(row.id), name: String(row.name), color: String(row.color) })),
    taskTags: tables.taskTags.map((row) => ({ taskId: String(row.task_id), tagId: String(row.tag_id) })),
    comments: tables.comments.map((row) => ({
      id: String(row.id),
      taskId: String(row.task_id),
      body: String(row.body),
      createdAt: String(row.created_at),
    })),
    attachments: tables.attachments.map((row) => ({
      id: String(row.id),
      taskId: String(row.task_id),
      name: String(row.name),
      mime: String(row.mime),
      createdAt: String(row.created_at),
      size: num(row.size),
    })),
    reminders: tables.reminders.map((row) => ({
      id: String(row.id),
      taskId: String(row.task_id),
      fireAt: String(row.fire_at),
      offsetMinutes: row.offset_minutes === null || row.offset_minutes === undefined ? null : num(row.offset_minutes),
      status: String(row.status),
      createdAt: String(row.created_at),
    })),
    templates: tables.templates.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      payloadJson: String(row.payload_json),
      createdAt: String(row.created_at),
    })),
    filters: tables.filters.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      queryJson: String(row.query_json),
      sortOrder: num(row.sort_order),
    })),
    habitSections: tables.habitSections.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      sortOrder: num(row.sort_order),
    })),
    habits: tables.habits.map((row) => ({
      id: String(row.id),
      sectionId: text(row.section_id),
      name: String(row.name),
      preset: text(row.preset),
      period: String(row.period) === "weekly" ? "weekly" : "daily",
      targetCount: num(row.target_count),
      archived: flag(row.archived),
      createdAt: String(row.created_at),
    })),
    habitLogs: tables.habitLogs.map((row) => ({
      id: String(row.id),
      habitId: String(row.habit_id),
      day: String(row.day),
      status: String(row.status) as HabitLog["status"],
    })),
    sessions: tables.sessions.map((row) => ({
      id: String(row.id),
      mode: String(row.mode) as FocusSession["mode"],
      startedAt: String(row.started_at),
      endedAt: text(row.ended_at),
      plannedSeconds: num(row.planned_seconds),
      taskId: text(row.task_id),
    })),
    sources: tables.sources.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      url: text(row.url),
      createdAt: String(row.created_at),
    })),
    events: tables.events.map((row) => ({
      id: String(row.id),
      sourceId: text(row.source_id),
      title: String(row.title),
      startAt: String(row.start_at),
      endAt: text(row.end_at),
      allDay: flag(row.all_day),
    })),
    courses: tables.courses.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      teacher: String(row.teacher),
      room: String(row.room),
      weekday: num(row.weekday),
      startSlot: num(row.start_slot),
      endSlot: num(row.end_slot),
      color: String(row.color),
    })),
    periods: tables.periods.map((row) => ({
      slot: num(row.slot),
      startTime: String(row.start_time),
      endTime: String(row.end_time),
    })),
    countdowns: tables.countdowns.map((row) => ({
      id: String(row.id),
      title: String(row.title),
      targetOn: String(row.target_on),
      archived: flag(row.archived),
    })),
    timers: tables.timers.map((row) => ({
      id: String(row.id),
      title: String(row.title),
      durationSeconds: num(row.duration_seconds),
      remainingSeconds: num(row.remaining_seconds),
      runningSince: text(row.running_since),
      archived: flag(row.archived),
    })),
    searchHistory: tables.searchHistory.map((row) => ({
      id: String(row.id),
      query: String(row.query),
      createdAt: String(row.created_at),
    })),
    completions: tables.completions.map((row) => ({
      id: String(row.id),
      taskId: String(row.task_id),
      title: String(row.title),
      completedAt: String(row.completed_at),
    })),
  };
}

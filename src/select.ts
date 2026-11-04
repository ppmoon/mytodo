import { compareYmd, dueYmd, todayYmd, ymdString } from "./lib/dates";
import type { RepeatRule } from "./lib/nlp";
import type { AppState } from "./store";
import type { FilterQuery, Task } from "./types";

export type ListMode =
  | { kind: "inbox" }
  | { kind: "today" }
  | { kind: "upcoming" }
  | { kind: "completed" }
  | { kind: "trash" }
  | { kind: "project"; id: string }
  | { kind: "tag"; id: string }
  | { kind: "filter"; id: string }
  | { kind: "search"; query: string };

function tagsOf(state: AppState, taskId: string): string[] {
  const ids = state.taskTags.filter((link) => link.taskId === taskId).map((link) => link.tagId);
  return state.tags.filter((tag) => ids.includes(tag.id)).map((tag) => tag.name);
}

function matchesFilter(state: AppState, task: Task, query: FilterQuery, today: string): boolean {
  if (query.text && !`${task.title} ${task.notes}`.includes(query.text)) return false;
  if (query.priorities?.length && !query.priorities.includes(task.priority)) return false;
  if (query.projectId && task.projectId !== query.projectId) return false;
  if (query.tagIds?.length) {
    const ids = state.taskTags.filter((link) => link.taskId === task.id).map((link) => link.tagId);
    if (!query.tagIds.every((id) => ids.includes(id))) return false;
  }
  const ymd = dueYmd(task.dueAt, task.allDay, task.timezone);
  const due = ymd ? ymdString(ymd) : null;
  if (query.due === "none" && due) return false;
  if (query.due === "today" && due !== today) return false;
  if (query.due === "overdue" && (!due || due >= today || task.status === "completed")) return false;
  if (query.due === "upcoming" && (!due || due < today)) return false;
  return true;
}

export function tasksFor(state: AppState, mode: ListMode, now = new Date()): Task[] {
  const today = ymdString(todayYmd(now, state.settings.timezone));
  const upcoming = ymdString({ ...todayYmd(now, state.settings.timezone), ...(() => {
    const base = todayYmd(now, state.settings.timezone);
    const end = new Date(Date.UTC(base.y, base.m - 1, base.d + 7));
    return { y: end.getUTCFullYear(), m: end.getUTCMonth() + 1, d: end.getUTCDate() };
  })() });
  let tasks = state.tasks.filter((task) => (mode.kind === "trash" ? task.deletedAt : !task.deletedAt));
  if (mode.kind !== "trash" && mode.kind !== "completed") tasks = tasks.filter((task) => !task.parentId);
  if (mode.kind === "inbox") tasks = tasks.filter((task) => task.projectId === "inbox" && task.status === "open");
  if (mode.kind === "today") {
    tasks = tasks.filter((task) => {
      const due = dueYmd(task.dueAt, task.allDay, task.timezone);
      return task.status === "open" && due && ymdString(due) <= today;
    });
  }
  if (mode.kind === "upcoming") {
    tasks = tasks.filter((task) => {
      const due = dueYmd(task.dueAt, task.allDay, task.timezone);
      const key = due ? ymdString(due) : "";
      return task.status === "open" && key > today && key <= upcoming;
    });
  }
  if (mode.kind === "completed") tasks = tasks.filter((task) => task.status === "completed");
  if (mode.kind === "project") tasks = tasks.filter((task) => task.projectId === mode.id && task.status === "open");
  if (mode.kind === "tag") {
    const ids = new Set(state.taskTags.filter((link) => link.tagId === mode.id).map((link) => link.taskId));
    tasks = tasks.filter((task) => ids.has(task.id) && task.status === "open");
  }
  if (mode.kind === "filter") {
    const filter = state.filters.find((item) => item.id === mode.id);
    const query = filter ? (JSON.parse(filter.queryJson) as FilterQuery) : {};
    tasks = tasks.filter((task) => task.status === "open" && matchesFilter(state, task, query, today));
  }
  if (mode.kind === "search") {
    const needle = mode.query.trim();
    tasks = tasks.filter((task) => {
      const comments = state.comments.filter((comment) => comment.taskId === task.id).map((comment) => comment.body).join(" ");
      return `${task.title} ${task.notes} ${tagsOf(state, task.id).join(" ")} ${comments}`.includes(needle);
    });
  }
  const sort = state.settings.listSort;
  return tasks.sort((a, b) => {
    if (sort === "pinned" && a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (sort === "priority" && a.priority !== b.priority) return b.priority - a.priority;
    if (sort === "tag") return tagsOf(state, a.id).join(",").localeCompare(tagsOf(state, b.id).join(","), "zh");
    if (sort === "due" || sort === "pinned") {
      const ad = dueYmd(a.dueAt, a.allDay, a.timezone);
      const bd = dueYmd(b.dueAt, b.allDay, b.timezone);
      if (ad && bd) return compareYmd(ad, bd);
      if (ad) return -1;
      if (bd) return 1;
    }
    return a.sortOrder - b.sortOrder;
  });
}

export function childTasks(state: AppState, parentId: string): Task[] {
  return state.tasks.filter((task) => task.parentId === parentId && !task.deletedAt);
}

export function repeatOrNull(rule: RepeatRule | null): RepeatRule | null {
  if (!rule) return null;
  return { freq: rule.freq, interval: Math.max(1, rule.interval || 1), weekdays: rule.weekdays };
}

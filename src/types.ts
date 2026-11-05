import type { RepeatRule } from "./lib/nlp";

export type Settings = {
  theme: "light" | "dark";
  accent: string;
  timezone: string;
  tabs: string[];
  swipeRight: "complete" | "pin";
  swipeLeft: "delete" | "postpone";
  pomodoroWork: number;
  pomodoroBreak: number;
  listSort: "manual" | "due" | "priority" | "tag" | "pinned";
};

export type Folder = { id: string; name: string; sortOrder: number };
export type Project = {
  id: string;
  folderId: string | null;
  name: string;
  color: string;
  pinned: boolean;
  archived: boolean;
  sortOrder: number;
  createdAt: string;
};
export type Column = { id: string; projectId: string; name: string; sortOrder: number };
export type Task = {
  id: string;
  projectId: string | null;
  columnId: string | null;
  parentId: string | null;
  title: string;
  notes: string;
  priority: number;
  startAt: string | null;
  dueAt: string | null;
  allDay: boolean;
  timezone: string;
  repeat: RepeatRule | null;
  status: "open" | "completed";
  progress: number;
  pinned: boolean;
  pinnedAt: string | null;
  completedAt: string | null;
  deletedAt: string | null;
  sortOrder: number;
  locationName: string | null;
  locationLat: number | null;
  locationLng: number | null;
  locationRadius: number | null;
  createdAt: string;
  updatedAt: string;
};
export type ChecklistItem = { id: string; taskId: string; title: string; done: boolean; sortOrder: number };
export type Tag = { id: string; name: string; color: string };
export type Comment = { id: string; taskId: string; body: string; createdAt: string };
export type AttachmentMeta = { id: string; taskId: string; name: string; mime: string; createdAt: string; size: number };
export type Reminder = {
  id: string;
  taskId: string;
  fireAt: string;
  offsetMinutes: number | null;
  status: string;
  createdAt: string;
};
export type Template = { id: string; name: string; payloadJson: string; createdAt: string };
export type SmartFilter = { id: string; name: string; queryJson: string; sortOrder: number };
export type HabitSection = { id: string; name: string; sortOrder: number };
export type Habit = {
  id: string;
  sectionId: string | null;
  name: string;
  preset: string | null;
  period: "daily" | "weekly";
  targetCount: number;
  archived: boolean;
  createdAt: string;
};
export type HabitLog = { id: string; habitId: string; day: string; status: "check" | "skip" | "freeze" };
export type FocusSession = {
  id: string;
  mode: "pomodoro-work" | "pomodoro-break" | "stopwatch";
  startedAt: string;
  endedAt: string | null;
  plannedSeconds: number;
  taskId: string | null;
};
export type CalendarSource = { id: string; name: string; url: string | null; createdAt: string };
export type CalEvent = { id: string; sourceId: string | null; title: string; startAt: string; endAt: string | null; allDay: boolean };
export type Course = {
  id: string;
  name: string;
  teacher: string;
  room: string;
  weekday: number;
  startSlot: number;
  endSlot: number;
  color: string;
};
export type Period = { slot: number; startTime: string; endTime: string };
export type Countdown = { id: string; title: string; targetOn: string; archived: boolean };
export type TimerItem = {
  id: string;
  title: string;
  durationSeconds: number;
  remainingSeconds: number;
  runningSince: string | null;
  archived: boolean;
};
export type SearchEntry = { id: string; query: string; createdAt: string };
export type Completion = { id: string; taskId: string; title: string; completedAt: string };

export type FilterQuery = {
  text?: string;
  priorities?: number[];
  tagIds?: string[];
  projectId?: string;
  due?: "any" | "overdue" | "today" | "none" | "upcoming";
};

export const DEFAULT_TABS = ["today", "calendar", "matrix", "habits", "more"];

export const defaultSettings = (): Settings => ({
  theme: "light",
  accent: "#1f6b4a",
  timezone: "Asia/Shanghai",
  tabs: DEFAULT_TABS,
  swipeRight: "complete",
  swipeLeft: "delete",
  pomodoroWork: 25,
  pomodoroBreak: 5,
  listSort: "pinned",
});

export const HABIT_PRESETS = [
  ["water", "喝水"],
  ["rise", "早起"],
  ["sleep", "早睡"],
  ["breakfast", "吃早餐"],
  ["fruit", "吃水果"],
  ["exercise", "运动"],
  ["jog", "跑步"],
  ["calm", "保持平静"],
  ["diary", "写日记"],
  ["language", "学语言"],
  ["words", "背单词"],
  ["meditate", "冥想"],
  ["snack", "健康加餐"],
  ["read", "阅读"],
  ["stretch", "拉伸"],
  ["medicine", "吃药"],
  ["yoga", "瑜伽"],
  ["homework", "做作业"],
  ["checkin", "每日打卡"],
] as const;

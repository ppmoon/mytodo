export const SCHEMA = `
CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  folder_id TEXT,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS columns (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  column_id TEXT,
  parent_id TEXT,
  title TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  priority INTEGER NOT NULL DEFAULT 0,
  start_at TEXT,
  due_at TEXT,
  all_day INTEGER NOT NULL DEFAULT 0,
  timezone TEXT NOT NULL,
  repeat_json TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  progress INTEGER NOT NULL DEFAULT 0,
  pinned INTEGER NOT NULL DEFAULT 0,
  pinned_at TEXT,
  completed_at TEXT,
  deleted_at TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  location_name TEXT,
  location_lat REAL,
  location_lng REAL,
  location_radius INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS checklist_items (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  title TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS task_tags (
  task_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  PRIMARY KEY (task_id, tag_id)
);
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  data BLOB NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  fire_at TEXT NOT NULL,
  offset_minutes INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS smart_filters (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  query_json TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS habit_sections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS habits (
  id TEXT PRIMARY KEY,
  section_id TEXT,
  name TEXT NOT NULL,
  preset TEXT,
  period TEXT NOT NULL DEFAULT 'daily',
  target_count INTEGER NOT NULL DEFAULT 1,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS habit_logs (
  id TEXT PRIMARY KEY,
  habit_id TEXT NOT NULL,
  day TEXT NOT NULL,
  status TEXT NOT NULL,
  UNIQUE (habit_id, day)
);
CREATE TABLE IF NOT EXISTS focus_sessions (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  planned_seconds INTEGER NOT NULL,
  task_id TEXT
);
CREATE TABLE IF NOT EXISTS calendar_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  source_id TEXT,
  title TEXT NOT NULL,
  start_at TEXT NOT NULL,
  end_at TEXT,
  all_day INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  teacher TEXT NOT NULL DEFAULT '',
  room TEXT NOT NULL DEFAULT '',
  weekday INTEGER NOT NULL,
  start_slot INTEGER NOT NULL,
  end_slot INTEGER NOT NULL,
  color TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS periods (
  slot INTEGER PRIMARY KEY,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS countdowns (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  target_on TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS timers (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL,
  remaining_seconds INTEGER NOT NULL,
  running_since TEXT,
  archived INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS search_history (
  id TEXT PRIMARY KEY,
  query TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS completions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  title TEXT NOT NULL,
  completed_at TEXT NOT NULL
);
`;

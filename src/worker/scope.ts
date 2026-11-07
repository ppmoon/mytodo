export const OWNED_TABLES = [
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

const OWNED = new Set<string>(OWNED_TABLES);
const SETTINGS_UPSERT = "insert into settings (key, value) values ('settings', ?) on conflict(user_id, key) do update set value = excluded.value";

export type ScopedStatement = { sql: string; params: unknown[] };

function placeholderCount(sql: string): number {
  let count = 0;
  let quote: string | null = null;
  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === "\"") {
      quote = char;
      continue;
    }
    if (char === "?") count += 1;
  }
  return count;
}

function assertSafe(sql: string): void {
  if (sql.includes(";")) throw new Error("只接受单条语句");
  if (/--|\/\*/.test(sql)) throw new Error("不接受注释");
  if (/\b(union|join|pragma|attach|detach|vacuum|reindex|drop|alter)\b/i.test(sql)) throw new Error("不接受这种语句");
  const selects = sql.match(/\bselect\b/gi)?.length ?? 0;
  if (selects > 1 || (selects === 1 && !/^select\b/i.test(sql))) throw new Error("不接受嵌套查询");
  if ((sql.match(/\bfrom\b/gi) ?? []).length > 1) throw new Error("不接受嵌套查询");
}

function ownTable(table: string | undefined): string {
  const name = table?.toLowerCase() ?? "";
  if (!OWNED.has(name)) throw new Error("不能访问这张表");
  return name;
}

function tableOf(sql: string, verb: string): string {
  if (verb === "select") return ownTable(/\bfrom\s+([a-z_]+)/i.exec(sql)?.[1]);
  if (verb === "insert") return ownTable(/\binto\s+([a-z_]+)/i.exec(sql)?.[1]);
  if (verb === "update") return ownTable(/^update\s+([a-z_]+)/i.exec(sql)?.[1]);
  return ownTable(/^delete\s+from\s+([a-z_]+)/i.exec(sql)?.[1]);
}

function withOwner(sql: string, params: unknown[], userId: string): ScopedStatement {
  const next = params.slice();
  const whereMatch = /\bwhere\b/i.exec(sql);
  if (whereMatch) {
    const whereStart = whereMatch.index + whereMatch[0].length;
    const boundary = /\b(order\s+by|group\s+by|limit)\b/i.exec(sql.slice(whereStart));
    const whereEnd = boundary ? whereStart + boundary.index : sql.length;
    const body = sql.slice(whereStart, whereEnd).trim();
    if (!body) throw new Error("查询缺少条件");
    const tail = sql.slice(whereEnd).trim();
    const scoped = `${sql.slice(0, whereStart)} user_id = ? AND (${body})${tail ? ` ${tail}` : ""}`;
    next.splice(placeholderCount(sql.slice(0, whereStart)), 0, userId);
    if (placeholderCount(scoped) !== next.length) throw new Error("参数数量不匹配");
    return { sql: scoped, params: next };
  }
  const boundary = /\b(order\s+by|group\s+by|limit)\b/i.exec(sql);
  const at = boundary?.index ?? sql.length;
  const tail = sql.slice(at).trim();
  const scoped = `${sql.slice(0, at).trimEnd()} WHERE user_id = ?${tail ? ` ${tail}` : ""}`;
  next.splice(placeholderCount(sql.slice(0, at)), 0, userId);
  if (placeholderCount(scoped) !== next.length) throw new Error("参数数量不匹配");
  return { sql: scoped, params: next };
}

function scopeInsert(sql: string, params: unknown[], userId: string): ScopedStatement {
  const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
  if (/\bon\s+conflict\b/i.test(sql) && normalized !== SETTINGS_UPSERT) throw new Error("不接受这种写入");
  const stripped = sql.replace(/on\s+conflict\s*\(\s*user_id\s*,\s*key\s*\)/i, "");
  if (/\buser_id\b/i.test(stripped)) throw new Error("不能指定 user_id");
  const into = /\binto\s+[a-z_]+\s*\(/i.exec(sql);
  if (!into) throw new Error("写入语句无法识别");
  const columnOpen = into.index + into[0].length - 1;
  const columnClose = sql.indexOf(")", columnOpen);
  const columns = sql.slice(columnOpen + 1, columnClose).split(",").map((column) => column.trim()).filter(Boolean);
  if (!columns.length || columns.some((column) => column.toLowerCase() === "user_id")) throw new Error("写入语句无法识别");
  const values = /\bvalues\s*\(/i.exec(sql.slice(columnClose));
  if (!values || values.index === undefined) throw new Error("写入语句无法识别");
  const valuesOpen = columnClose + values.index + values[0].length - 1;
  const withValue = `${sql.slice(0, valuesOpen + 1)}?, ${sql.slice(valuesOpen + 1)}`;
  const scoped = `${withValue.slice(0, columnOpen + 1)}user_id, ${withValue.slice(columnOpen + 1)}`;
  const next = params.slice();
  next.splice(placeholderCount(sql.slice(0, valuesOpen + 1)), 0, userId);
  if (placeholderCount(scoped) !== next.length) throw new Error("参数数量不匹配");
  return { sql: scoped, params: next };
}

export function scopeStatement(sql: string, params: unknown[], userId: string): ScopedStatement {
  const trimmed = sql.trim();
  assertSafe(trimmed);
  const verb = /^(select|insert|update|delete)\b/i.exec(trimmed)?.[1].toLowerCase();
  if (!verb) throw new Error("只接受查询或写入");
  tableOf(trimmed, verb);
  if (verb === "insert") return scopeInsert(trimmed, params, userId);
  if (/\buser_id\b/i.test(trimmed)) throw new Error("不能指定 user_id");
  if (verb === "update") {
    const setAt = /^update\s+[a-z_]+\s+set\s+/i.exec(trimmed);
    if (!setAt) throw new Error("写入语句无法识别");
    const whereAt = trimmed.search(/\bwhere\b/i);
    const setClause = whereAt === -1 ? trimmed.slice(setAt[0].length) : trimmed.slice(setAt[0].length, whereAt);
    if (/\buser_id\b/i.test(setClause)) throw new Error("不能指定 user_id");
  }
  return withOwner(trimmed, params, userId);
}

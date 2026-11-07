import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import type { SqlRow } from "../src/db/bundle";
import { loginAccount, userForToken } from "../src/worker/accounts";
import { ensureDatabase, execute, loadState, readRows, resetDatabaseCache, type D1Database, type D1Prepared, type D1Result } from "../src/worker/d1";
import { hashPassword } from "../src/worker/password";
import worker from "../src/worker/index";

class Statement implements D1Prepared {
  private params: unknown[] = [];

  constructor(private readonly db: DatabaseSync, private readonly sql: string) {}

  bind(...values: unknown[]): D1Prepared {
    this.params = values;
    return this;
  }

  private returnsRows(): boolean {
    const verb = this.sql.trim().toLowerCase();
    return verb.startsWith("select") || verb.startsWith("pragma") || verb.startsWith("with");
  }

  async all(): Promise<D1Result> {
    const statement = this.db.prepare(this.sql);
    if (!this.returnsRows()) {
      statement.run(...(this.params as never[]));
      return { results: [] };
    }
    return { results: statement.all(...(this.params as never[])) as SqlRow[] };
  }

  async first<T>(): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...(this.params as never[])) as T | undefined;
    return row ?? null;
  }

  async run(): Promise<unknown> {
    return this.db.prepare(this.sql).run(...(this.params as never[]));
  }
}

function openDb(): D1Database {
  const db = new DatabaseSync(":memory:");
  return {
    prepare(query: string) {
      return new Statement(db, query);
    },
    async batch(statements) {
      db.exec("BEGIN");
      try {
        const results: D1Result[] = [];
        for (const statement of statements) results.push(await statement.all());
        db.exec("COMMIT");
        return results;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    async exec(query: string) {
      db.exec(query);
    },
  };
}

async function taskCount(db: D1Database, userId: string, title: string): Promise<number> {
  const rows = await readRows(db, "SELECT id FROM tasks WHERE title = ?", [title], userId);
  return rows.length;
}

async function provision(db: D1Database, email: string, name: string, password: string) {
  await db.prepare("INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)").bind(
    crypto.randomUUID(),
    email,
    name,
    await hashPassword(password),
    new Date().toISOString(),
  ).run();
  return loginAccount(db, { email, password });
}

describe("accounts", () => {
  beforeEach(() => resetDatabaseCache());

  it("gives an existing account an empty inbox and refuses new signups", async () => {
    const db = openDb();
    await ensureDatabase(db);
    const first = await provision(db, "ada@example.com", "阿达", "long-enough");
    const state = await loadState(db, first.user.id);
    expect(state.projects.map((project) => project.id)).toEqual([`inbox:${first.user.id}`]);
    expect(state.tasks).toEqual([]);
    expect(state.periods).toHaveLength(8);
    expect(await userForToken(db, first.token)).toEqual(first.user);
    await expect(loginAccount(db, { email: "ada@example.com", password: "nope" })).rejects.toThrow("邮箱或密码不正确");
    const refused = await worker.fetch(new Request("https://mytodo.test/api/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "new@example.com", name: "新人", password: "long-enough" }),
    }), { DB: db });
    expect(refused.status).toBe(403);
    expect(await refused.text()).toBe("暂不开放注册");
    const count = await db.prepare("SELECT COUNT(*) AS n FROM users").first<{ n: number }>();
    expect(Number(count?.n)).toBe(1);
  });

  it("keeps a second account from seeing tasks, including rows left before login existed", async () => {
    const db = openDb();
    db.exec(readFileSync(new URL("../migrations/0001_init.sql", import.meta.url), "utf8"));
    await db.prepare("INSERT INTO projects (id, name, color, sort_order, created_at) VALUES ('inbox', '收集箱', '#1f6b4a', 0, '2026-01-01T00:00:00.000Z')").run();
    await db.prepare("INSERT INTO tasks (id, project_id, title, timezone, created_at, updated_at) VALUES ('task-1', 'inbox', '旧任务', 'Asia/Shanghai', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')").run();
    await db.prepare("INSERT INTO settings (key, value) VALUES ('settings', ?)").bind(JSON.stringify({ theme: "dark" })).run();
    await ensureDatabase(db);

    const first = await provision(db, "ada@example.com", "阿达", "long-enough");
    const inherited = await loadState(db, first.user.id);
    expect(inherited.tasks.map((task) => task.title)).toEqual(["旧任务"]);
    expect(inherited.projects[0]?.id).toBe(`inbox:${first.user.id}`);
    expect(inherited.settings.theme).toBe("dark");

    const second = await provision(db, "bao@example.com", "阿宝", "another-secret");
    const own = await loadState(db, second.user.id);
    expect(own.tasks).toEqual([]);
    expect(own.projects[0]?.id).toBe(`inbox:${second.user.id}`);
    await execute(db, [{ sql: "UPDATE tasks SET title = ? WHERE id = ?", params: ["被改掉", "task-1"] }], second.user.id);
    expect(await taskCount(db, first.user.id, "旧任务")).toBe(1);
    expect(await taskCount(db, second.user.id, "旧任务")).toBe(0);
    expect(await taskCount(db, second.user.id, "被改掉")).toBe(0);

    const stamp = "2026-11-07T00:00:00.000Z";
    await execute(db, [{
      sql: "INSERT INTO tasks (id, project_id, title, notes, priority, all_day, timezone, status, progress, pinned, sort_order, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
      params: ["task-2", own.projects[0]?.id, "阿宝的任务", "", 0, 0, "Asia/Shanghai", "open", 0, 0, 1, stamp, stamp],
    }], second.user.id);
    expect(await taskCount(db, second.user.id, "阿宝的任务")).toBe(1);
    expect(await taskCount(db, first.user.id, "阿宝的任务")).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import { scopeStatement } from "./scope";

const userId = "user-1";

describe("scopeStatement", () => {
  it("adds the signed-in user to a filtered select", () => {
    const scoped = scopeStatement("SELECT id FROM tags WHERE name = ?", ["生活"], userId);
    expect(scoped.sql).toBe("SELECT id FROM tags WHERE user_id = ? AND (name = ?)");
    expect(scoped.params).toEqual([userId, "生活"]);
  });

  it("keeps an or-clause inside the owner predicate", () => {
    const scoped = scopeStatement("SELECT * FROM tasks WHERE 1 = 1 OR title = ?", ["秘密"], userId);
    expect(scoped.sql).toBe("SELECT * FROM tasks WHERE user_id = ? AND (1 = 1 OR title = ?)");
    expect(scoped.params).toEqual([userId, "秘密"]);
  });

  it("scopes an update without letting the set clause move rows", () => {
    const sql = `UPDATE tasks SET project_id=?, column_id=?, parent_id=?, title=?, notes=?, priority=?, start_at=?, due_at=?,
      all_day=?, timezone=?, repeat_json=?, status=?, progress=?, pinned=?, pinned_at=?, completed_at=?, deleted_at=?,
      sort_order=?, location_name=?, location_lat=?, location_lng=?, location_radius=?, updated_at=? WHERE id=?`;
    const params = Array.from({ length: 24 }, (_, index) => index);
    const scoped = scopeStatement(sql, params, userId);
    expect(scoped.sql).toContain("WHERE user_id = ? AND (id=?)");
    expect(scoped.params[23]).toBe(userId);
    expect(scoped.params[24]).toBe(23);
  });

  it("stamps user_id onto inserts, including the settings upsert", () => {
    const settings = "INSERT INTO settings (key, value) VALUES ('settings', ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value";
    const scoped = scopeStatement(settings, ["{}"], userId);
    expect(scoped.sql).toBe("INSERT INTO settings (user_id, key, value) VALUES (?, 'settings', ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value");
    expect(scoped.params).toEqual([userId, "{}"]);
  });

  it("rejects statements that can cross accounts", () => {
    expect(() => scopeStatement("SELECT * FROM users", [], userId)).toThrow("不能访问这张表");
    expect(() => scopeStatement("SELECT * FROM tasks UNION SELECT * FROM tasks", [], userId)).toThrow("不接受这种语句");
    expect(() => scopeStatement("INSERT INTO tasks (id, title) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET title = 'x'", ["a", "b"], userId)).toThrow("不接受这种写入");
    expect(() => scopeStatement("UPDATE tasks SET user_id = ? WHERE id = ?", ["other", "a"], userId)).toThrow("不能指定 user_id");
  });
});

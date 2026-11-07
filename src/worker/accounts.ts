import type { D1Database } from "./d1";
import { parseLogin, parsePasswordChange, parseRegister } from "./account";
import { HttpError } from "./http";
import { hashPassword, randomHex, sha256Hex, verifyPassword } from "./password";

export type PublicUser = { id: string; email: string; name: string };

const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

type UserRow = { id: string; email: string; name: string; password_hash: string; expires_at?: string };

async function dummyHash(): Promise<string> {
  return hashPassword("not-a-real-password");
}

let cachedDummy: Promise<string> | null = null;

function placeholderHash(): Promise<string> {
  cachedDummy ??= dummyHash();
  return cachedDummy;
}

async function createSession(db: D1Database, userId: string): Promise<string> {
  const token = randomHex(32);
  const expiresAt = new Date(Date.now() + SESSION_MS).toISOString();
  await db.prepare("INSERT INTO auth_sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)").bind(
    crypto.randomUUID(),
    userId,
    await sha256Hex(token),
    expiresAt,
    new Date().toISOString(),
  ).run();
  return token;
}

export async function registerAccount(db: D1Database, input: unknown): Promise<{ user: PublicUser; token: string }> {
  const parsed = parseRegister(input);
  const existing = await db.prepare("SELECT id FROM users WHERE email = ?").bind(parsed.email).first<{ id: string }>();
  if (existing) throw new HttpError("这个邮箱已经注册");
  const user = { id: crypto.randomUUID(), email: parsed.email, name: parsed.name };
  await db.prepare("INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)").bind(
    user.id,
    user.email,
    user.name,
    await hashPassword(parsed.password),
    new Date().toISOString(),
  ).run();
  return { user, token: await createSession(db, user.id) };
}

export async function loginAccount(db: D1Database, input: unknown): Promise<{ user: PublicUser; token: string }> {
  const parsed = parseLogin(input);
  const row = await db.prepare("SELECT id, email, name, password_hash FROM users WHERE email = ?").bind(parsed.email).first<UserRow>();
  const ok = await verifyPassword(parsed.password, row?.password_hash ?? await placeholderHash());
  if (!row || !ok) throw new HttpError("邮箱或密码不正确");
  return { user: { id: row.id, email: row.email, name: row.name }, token: await createSession(db, row.id) };
}

export async function logoutAccount(db: D1Database, token: string | null): Promise<void> {
  if (!token) return;
  await db.prepare("DELETE FROM auth_sessions WHERE token_hash = ?").bind(await sha256Hex(token)).run();
}

export async function userForToken(db: D1Database, token: string | null): Promise<PublicUser | null> {
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const row = await db.prepare(
    `SELECT users.id AS id, users.email AS email, users.name AS name, auth_sessions.expires_at AS expires_at
     FROM auth_sessions JOIN users ON users.id = auth_sessions.user_id
     WHERE auth_sessions.token_hash = ?`,
  ).bind(tokenHash).first<UserRow>();
  if (!row) return null;
  if (new Date(row.expires_at ?? 0).getTime() <= Date.now()) {
    await db.prepare("DELETE FROM auth_sessions WHERE token_hash = ?").bind(tokenHash).run();
    return null;
  }
  return { id: row.id, email: row.email, name: row.name };
}

export async function changeAccountPassword(db: D1Database, userId: string, input: unknown): Promise<void> {
  const parsed = parsePasswordChange(input);
  const row = await db.prepare("SELECT password_hash FROM users WHERE id = ?").bind(userId).first<{ password_hash: string }>();
  if (!row || !(await verifyPassword(parsed.currentPassword, row.password_hash))) throw new HttpError("当前密码不正确");
  await db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(await hashPassword(parsed.nextPassword), userId).run();
}

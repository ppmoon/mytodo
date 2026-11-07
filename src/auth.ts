import type { AuthUser } from "./types";

let onLeave: () => void = () => {};

export function setLeaveHandler(handler: () => void): void {
  onLeave = handler;
}

export function leaveSession(): void {
  onLeave();
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (response.status === 401) {
    leaveSession();
    throw new Error(text || "请先登录");
  }
  if (!response.ok) throw new Error(text || "请求失败");
  return (text ? JSON.parse(text) : undefined) as T;
}

export async function currentUser(): Promise<AuthUser | null> {
  const response = await fetch("/api/me");
  if (!response.ok) throw new Error((await response.text()) || "无法确认登录状态");
  const body = await response.json() as { user: AuthUser | null };
  return body.user;
}

export async function registerAccount(input: { email: string; name: string; password: string }): Promise<AuthUser> {
  const body = await postJson<{ user: AuthUser }>("/api/register", input);
  return body.user;
}

export async function loginAccount(input: { email: string; password: string }): Promise<AuthUser> {
  const body = await postJson<{ user: AuthUser }>("/api/login", input);
  return body.user;
}

export async function logoutAccount(): Promise<void> {
  try {
    await fetch("/api/logout", { method: "POST" });
  } finally {
    leaveSession();
  }
}

export async function changePassword(currentPassword: string, nextPassword: string): Promise<void> {
  await postJson("/api/password", { currentPassword, nextPassword });
}

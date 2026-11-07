import { HttpError } from "./http";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type LoginInput = { email: string; password: string };

function record(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new HttpError("请求格式不正确");
  return input as Record<string, unknown>;
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function parseLogin(input: unknown): LoginInput {
  const body = record(input);
  const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!EMAIL.test(email) || !password) throw new HttpError("请填写邮箱和密码");
  return { email, password };
}

export function parsePasswordChange(input: unknown): { currentPassword: string; nextPassword: string } {
  const body = record(input);
  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const nextPassword = typeof body.nextPassword === "string" ? body.nextPassword : "";
  if (!currentPassword) throw new HttpError("请填写当前密码");
  if (nextPassword.length < 8 || nextPassword.length > 72) throw new HttpError("密码至少 8 位，最多 72 位");
  return { currentPassword, nextPassword };
}

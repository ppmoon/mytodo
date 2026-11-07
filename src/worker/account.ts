import { HttpError } from "./http";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type RegisterInput = { email: string; name: string; password: string };
export type LoginInput = { email: string; password: string };

function record(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new HttpError("请求格式不正确");
  return input as Record<string, unknown>;
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function parseRegister(input: unknown): RegisterInput {
  const body = record(input);
  const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!EMAIL.test(email) || email.length > 120) throw new HttpError("邮箱格式不正确");
  if (!name || name.length > 40) throw new HttpError("名字请填写 1 到 40 个字");
  if (password.length < 8 || password.length > 72) throw new HttpError("密码至少 8 位，最多 72 位");
  return { email, name, password };
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

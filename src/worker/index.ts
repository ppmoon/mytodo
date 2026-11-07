import { changeAccountPassword, loginAccount, logoutAccount, registerAccount, userForToken } from "./accounts";
import { ensureDatabase, execute, exportTables, importTables, loadState, readAttachment, readRows, saveAttachment, type Env } from "./d1";
import { HttpError, clearSessionCookie, isSecureRequest, readCookie, sessionCookie, SESSION_COOKIE } from "./http";

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extra },
  });
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new HttpError("请求格式不正确");
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return new Response(null, { status: 404 });
    const secure = isSecureRequest(request.url, request.headers.get("x-forwarded-proto"));
    const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
    try {
      await ensureDatabase(env.DB);
      if (request.method === "POST" && url.pathname === "/api/register") {
        const result = await registerAccount(env.DB, await readJson(request));
        return json({ user: result.user }, 200, { "set-cookie": sessionCookie(result.token, secure) });
      }
      if (request.method === "POST" && url.pathname === "/api/login") {
        const result = await loginAccount(env.DB, await readJson(request));
        return json({ user: result.user }, 200, { "set-cookie": sessionCookie(result.token, secure) });
      }
      if (request.method === "POST" && url.pathname === "/api/logout") {
        await logoutAccount(env.DB, token);
        return json({ ok: true }, 200, { "set-cookie": clearSessionCookie(secure) });
      }
      const user = await userForToken(env.DB, token);
      if (request.method === "GET" && url.pathname === "/api/me") return json({ user });
      if (!user) return new Response("请先登录", { status: 401 });
      if (request.method === "POST" && url.pathname === "/api/password") {
        await changeAccountPassword(env.DB, user.id, await readJson(request));
        return json({ ok: true });
      }
      if (request.method === "GET" && url.pathname === "/api/state") return json(await loadState(env.DB, user.id));
      if (request.method === "GET" && url.pathname === "/api/export") return json(await exportTables(env.DB, user.id));
      if (request.method === "POST" && url.pathname === "/api/import") {
        await importTables(env.DB, await request.json(), user.id);
        return json(await loadState(env.DB, user.id));
      }
      if (request.method === "POST" && url.pathname === "/api/query") {
        const body = await request.json() as { sql?: string; params?: unknown[] };
        const rows = await readRows(env.DB, String(body.sql ?? ""), body.params ?? [], user.id);
        return json({ rows });
      }
      if (request.method === "POST" && url.pathname === "/api/exec") {
        const body = await request.json() as { statements?: { sql: string; params: unknown[] }[] };
        await execute(env.DB, body.statements ?? [], user.id);
        return json({ ok: true });
      }
      if (request.method === "POST" && url.pathname === "/api/attachment") {
        await saveAttachment(env.DB, await request.json(), user.id);
        return json({ ok: true });
      }
      const attachment = url.pathname.match(/^\/api\/attachment\/([^/]+)$/);
      if (request.method === "GET" && attachment) {
        const file = await readAttachment(env.DB, decodeURIComponent(attachment[1]), user.id);
        if (!file) return new Response("找不到附件", { status: 404 });
        return new Response(file.data, {
          headers: {
            "content-type": file.mime || "application/octet-stream",
            "content-disposition": `inline; filename="${encodeURIComponent(file.name)}"`,
          },
        });
      }
      return new Response("没有这个接口", { status: 404 });
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 400;
      return new Response(error instanceof Error ? error.message : "请求失败", { status });
    }
  },
};

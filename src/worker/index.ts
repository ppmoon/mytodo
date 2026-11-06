import { execute, exportTables, importTables, loadState, readAttachment, readRows, saveAttachment, type Env } from "./d1";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return new Response(null, { status: 404 });
    try {
      if (request.method === "GET" && url.pathname === "/api/state") return json(await loadState(env.DB));
      if (request.method === "GET" && url.pathname === "/api/export") return json(await exportTables(env.DB));
      if (request.method === "POST" && url.pathname === "/api/import") {
        await importTables(env.DB, await request.json());
        return json(await loadState(env.DB));
      }
      if (request.method === "POST" && url.pathname === "/api/query") {
        const body = await request.json() as { sql?: string; params?: unknown[] };
        const rows = await readRows(env.DB, String(body.sql ?? ""), body.params ?? []);
        return json({ rows });
      }
      if (request.method === "POST" && url.pathname === "/api/exec") {
        const body = await request.json() as { statements?: { sql: string; params: unknown[] }[] };
        await execute(env.DB, body.statements ?? []);
        return json({ ok: true });
      }
      if (request.method === "POST" && url.pathname === "/api/attachment") {
        await saveAttachment(env.DB, await request.json());
        return json({ ok: true });
      }
      const attachment = url.pathname.match(/^\/api\/attachment\/([^/]+)$/);
      if (request.method === "GET" && attachment) {
        const file = await readAttachment(env.DB, decodeURIComponent(attachment[1]));
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
      return new Response(error instanceof Error ? error.message : "请求失败", { status: 400 });
    }
  },
};

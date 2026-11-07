# mytodo

待办 PWA。页面由 Cloudflare Workers 提供，任务、习惯、专注和日历写在 Cloudflare D1 里。需要登录。每个账号只能看到自己的数据。

## 功能

- 添加待办，标记完成或恢复为未完成，删除后可以撤销
- 清单、标签、筛选、多种查看方式
- 习惯、番茄钟、课程表、倒数日和计时器
- 数据保存在 D1，刷新页面后仍然存在

用邮箱和密码注册、登录、退出，也可以修改密码。登录状态放在 HttpOnly Cookie 里。第一个注册的账号会接手上一次没有账号时留下的数据。协作、会员，以及写回手机系统日历，这一版没有做。

## 开始使用

```bash
git clone https://github.com/ppmoon/mytodo.git
cd mytodo
npm install
npm run dev
```

`npm test` 检查日期解析和重复规则。`npm run dev` 用 Vite 和本地 D1 一起启动。`npm run build` 生成可部署的 Workers 静态资源和接口。

## 部署到 Cloudflare Workers

1. 安装依赖后登录：`npx wrangler login`
2. 创建数据库：`npx wrangler d1 create mytodo`
3. 把命令输出的 `database_id` 写进 `wrangler.jsonc` 的 `d1_databases`
4. 建表：`npx wrangler d1 migrations apply mytodo --remote`
5. 发布：`npm run deploy`

本地表结构用 `npm run db:migrate:local`。没有跑过迁移时，Worker 第一次接到请求也会自己建表并放入收集箱。

设置页可以导出或导入 JSON。D1 不提供整库文件下载，所以不再使用 `.sqlite` 文件。

## 数据

接口在 Worker 里，SQL 由 D1 执行。附件仍放在 D1 的 `BLOB` 列里，单个不超过 1.5 MB。

## 许可证

尚未添加。

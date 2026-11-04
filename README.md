# mytodo

本地优先的待办 PWA。任务、习惯、专注和日历都写在浏览器里的 SQLite 数据库中，不需要账号。

## 功能

- 添加待办，标记完成或恢复为未完成，删除后可以撤销
- 清单、标签、筛选、多种查看方式
- 习惯、番茄钟、课程表、倒数日和计时器
- 数据保存在本机，刷新页面后仍然存在

账号、协作、会员，以及写回手机系统日历，这一版没有做。

## 开始使用

```bash
git clone https://github.com/ppmoon/mytodo.git
cd mytodo
npm install
npm run dev
```

`npm test` 检查日期解析和重复规则。`npm run build` 生成可安装的 PWA。

## 数据

SQLite 通过 sql.js 跑在 WebAssembly 里，整个数据库文件保存在 IndexedDB。设置页可以导出或导入这个文件。

## 许可证

尚未添加。

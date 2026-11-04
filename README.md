# mytodo

本地优先的待办 PWA。任务、习惯、专注和日历都写在浏览器里的 SQLite 数据库中，不需要账号。

## 开发

```bash
npm install
npm run dev
```

`npm test` 检查日期解析和重复规则。`npm run build` 生成可安装的 PWA。

## 数据

SQLite 通过 sql.js 跑在 WebAssembly 里，整个数据库文件保存在 IndexedDB。设置页可以导出或导入这个文件。

## 范围

包含任务、清单、多种视图、习惯、番茄钟、课程表、倒数日、计时器、提醒、桌面小部件页面和手表尺寸页面。

账号、协作、会员，以及写回手机系统日历，这一版没有做。

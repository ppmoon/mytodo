import { useEffect, useState } from "react";
import { NavLink, Route, Routes, useParams, useSearchParams } from "react-router-dom";
import { parseQuickAdd } from "./lib/nlp";
import { store } from "./store";
import { useSyncExternalStore } from "react";
import { TaskList } from "./ui/TaskList";
import { TaskDialog } from "./ui/TaskDialog";
import { CalendarView, CountdownView, CoursesView, FocusView, HabitsView, MatrixView, SearchView, SettingsView, SummaryView, TimelineView, TimersView, WatchView, WidgetsView } from "./ui/views";
import type { ListMode } from "./select";
import { uid } from "./lib/id";

const LINKS: [string, string][] = [
  ["/today", "今天"],
  ["/upcoming", "最近 7 天"],
  ["/inbox", "收集箱"],
  ["/calendar", "日历"],
  ["/timeline", "时间线"],
  ["/matrix", "四象限"],
  ["/summary", "摘要"],
  ["/habits", "习惯"],
  ["/focus", "专注"],
  ["/courses", "课程表"],
  ["/countdowns", "倒数日"],
  ["/timers", "计时器"],
  ["/widgets", "小部件"],
  ["/watch", "手表"],
  ["/search", "搜索"],
  ["/completed", "已完成"],
  ["/trash", "垃圾桶"],
  ["/settings", "设置"],
];

const TAB_LABEL: Record<string, [string, string]> = {
  today: ["/today", "今天"],
  calendar: ["/calendar", "日历"],
  matrix: ["/matrix", "四象限"],
  habits: ["/habits", "习惯"],
  focus: ["/focus", "专注"],
  widgets: ["/widgets", "小部件"],
  more: ["", "更多"],
};

function useTodo() {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

export function App() {
  const state = useTodo();
  const [editor, setEditor] = useState<{ id: string | null; projectId: string | null } | null>(null);
  const [menu, setMenu] = useState(false);
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    document.documentElement.dataset.theme = state.settings.theme;
    document.documentElement.style.setProperty("--accent", state.settings.accent);
  }, [state.settings.theme, state.settings.accent]);
  useEffect(() => {
    const timer = window.setInterval(() => store.fireDueReminders(), 10000);
    const needsLocation = state.reminders.some((reminder) => reminder.fireAt === "location" && reminder.status === "pending");
    const watch = needsLocation ? navigator.geolocation?.watchPosition((pos) => store.checkLocation(pos.coords.latitude, pos.coords.longitude)) : undefined;
    return () => {
      window.clearInterval(timer);
      if (watch !== undefined) navigator.geolocation.clearWatch(watch);
    };
  }, [state.reminders]);
  useEffect(() => {
    const shared = [params.get("title"), params.get("text"), params.get("url")].filter(Boolean).join(" ");
    if (!shared) return;
    store.quickAdd(shared);
    setParams({}, { replace: true });
  }, [params, setParams]);

  const path = window.location.pathname;
  const title = LINKS.find((link) => link[0] === path)?.[1] ?? "任务";
  return (
    <div className="app">
      <aside className={menu ? "side open" : "side"}>
        <h1 className="brand">my<span>todo</span></h1>
        <p className="lede">只存在这台浏览器里的待办。</p>
        {LINKS.map(([href, label]) => <NavLink key={href} to={href} className="nav-link" onClick={() => setMenu(false)}>{label}</NavLink>)}
        <div className="group">清单</div>
        {state.projects.filter((project) => !project.archived).map((project) => (
          <NavLink key={project.id} to={`/project/${project.id}`} className="nav-link"><span><i className="dot" style={{ background: project.color }} /> {project.name}</span></NavLink>
        ))}
        <Creator label="新清单" onCreate={(name) => store.saveProject({ id: uid(), folderId: null, name, color: "#0f6e6e", pinned: false, archived: false, sortOrder: state.projects.length, createdAt: new Date().toISOString() })} />
        <Creator label="新文件夹" onCreate={(name) => store.saveFolder(uid(), name)} />
        <div className="group">标签</div>
        {state.tags.map((tag) => <NavLink key={tag.id} to={`/tag/${tag.id}`} className="nav-link">#{tag.name}</NavLink>)}
        <div className="group">筛选</div>
        {state.filters.map((filter) => <NavLink key={filter.id} to={`/filter/${filter.id}`} className="nav-link">{filter.name}</NavLink>)}
        <Creator label="新筛选（名称即关键词）" onCreate={(name) => store.saveFilter(uid(), name, { text: name })} />
        <div className="group">模板</div>
        {state.templates.map((template) => <button key={template.id} className="linkish" onClick={() => store.createFromTemplate(template.id)}>{template.name}</button>)}
      </aside>
      <main className="main">
        <header className="top">
          <div>
            <h1>{title}</h1>
          </div>
          <div className="row">
            <button className="ghost" onClick={() => setMenu(true)}>菜单</button>
            <button className="primary" onClick={() => setEditor({ id: null, projectId: path.startsWith("/project/") ? path.split("/")[2] : "inbox" })}>新任务</button>
          </div>
        </header>
        <QuickAdd timezone={state.settings.timezone} />
        <Routes>
          <Route path="/" element={<TaskList state={state} mode={{ kind: "today" }} onOpen={(task) => setEditor({ id: task.id, projectId: task.projectId })} />} />
          <Route path="/today" element={<TaskList state={state} mode={{ kind: "today" }} onOpen={(task) => setEditor({ id: task.id, projectId: task.projectId })} />} />
          <Route path="/upcoming" element={<TaskList state={state} mode={{ kind: "upcoming" }} onOpen={(task) => setEditor({ id: task.id, projectId: task.projectId })} />} />
          <Route path="/inbox" element={<TaskList state={state} mode={{ kind: "inbox" }} onOpen={(task) => setEditor({ id: task.id, projectId: task.projectId })} />} />
          <Route path="/completed" element={<TaskList state={state} mode={{ kind: "completed" }} onOpen={(task) => setEditor({ id: task.id, projectId: task.projectId })} />} />
          <Route path="/trash" element={<TaskList state={state} mode={{ kind: "trash" }} onOpen={(task) => setEditor({ id: task.id, projectId: task.projectId })} />} />
          <Route path="/project/:id" element={<ProjectPage state={state} onOpen={(id, projectId) => setEditor({ id, projectId })} />} />
          <Route path="/tag/:id" element={<TagPage state={state} onOpen={(id, projectId) => setEditor({ id, projectId })} />} />
          <Route path="/filter/:id" element={<FilterPage state={state} onOpen={(id, projectId) => setEditor({ id, projectId })} />} />
          <Route path="/calendar" element={<CalendarView state={state} />} />
          <Route path="/timeline" element={<TimelineView state={state} />} />
          <Route path="/matrix" element={<MatrixView state={state} />} />
          <Route path="/summary" element={<SummaryView state={state} />} />
          <Route path="/habits" element={<HabitsView state={state} />} />
          <Route path="/focus" element={<FocusView state={state} />} />
          <Route path="/courses" element={<CoursesView state={state} />} />
          <Route path="/countdowns" element={<CountdownView state={state} />} />
          <Route path="/timers" element={<TimersView state={state} />} />
          <Route path="/widgets" element={<WidgetsView state={state} />} />
          <Route path="/watch" element={<WatchView state={state} />} />
          <Route path="/search" element={<SearchView state={state} />} />
          <Route path="/settings" element={<SettingsView state={state} />} />
        </Routes>
      </main>
      <nav className="tabbar">
        {state.settings.tabs.map((tab) => {
          const meta = TAB_LABEL[tab] ?? TAB_LABEL.more;
          if (tab === "more") return <button key={tab} onClick={() => setMenu(true)}>{meta[1]}</button>;
          return <NavLink key={tab} to={meta[0]}>{meta[1]}</NavLink>;
        })}
      </nav>
      {editor && <TaskDialog state={state} taskId={editor.id} projectId={editor.projectId} onClose={() => setEditor(null)} />}
      {state.notice && (
        <div className="toast card">
          <div><strong>{state.notice.title}</strong><div className="meta">{state.notice.body}</div></div>
          {state.notice.reminderId && <button className="ghost" onClick={() => store.snooze(state.notice!.reminderId!, 10)}>推迟 10 分钟</button>}
          <button className="ghost" onClick={() => store.dismissNotice()}>知道了</button>
        </div>
      )}
      {state.undoLabel && <div className="toast card" style={{ bottom: state.notice ? 84 : 16 }}><span>{state.undoLabel}</span><button className="primary" onClick={() => store.undo()}>撤销</button></div>}
    </div>
  );
}

function QuickAdd({ timezone }: { timezone: string }) {
  const [text, setText] = useState("");
  const parsed = text.trim() ? parseQuickAdd(text, new Date(), timezone) : null;
  return (
    <form className="quick card" onSubmit={(event) => { event.preventDefault(); store.quickAdd(text); setText(""); }}>
      <input value={text} onChange={(event) => setText(event.target.value)} placeholder="明天上午9点 买牛奶 #生活 !高" aria-label="快速添加" />
      <button type="button" className="ghost" onClick={() => {
        const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!Ctor) { window.alert("当前浏览器不支持语音输入"); return; }
        const recognition = new Ctor();
        recognition.lang = "zh-CN";
        recognition.onresult = (event) => setText(event.results[0][0].transcript);
        recognition.start();
      }}>语音</button>
      <button className="primary">添加</button>
      {parsed?.dueAt && <span className="meta">{parsed.allDay ? parsed.dueAt : new Date(parsed.dueAt).toLocaleString("zh-CN", { timeZone: timezone })}</span>}
    </form>
  );
}

function Creator({ label, onCreate }: { label: string; onCreate: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <form className="row" onSubmit={(event) => { event.preventDefault(); if (name.trim()) { onCreate(name.trim()); setName(""); } }}>
      <input value={name} placeholder={label} onChange={(event) => setName(event.target.value)} />
    </form>
  );
}

function ProjectPage({ state, onOpen }: { state: ReturnType<typeof useTodo>; onOpen: (id: string, projectId: string | null) => void }) {
  const { id = "" } = useParams();
  const [column, setColumn] = useState("");
  const mode: ListMode = { kind: "project", id };
  return (
    <div>
      <form className="row" onSubmit={(event) => { event.preventDefault(); if (column.trim()) { store.saveColumn(id, uid(), column.trim()); setColumn(""); } }}>
        <input value={column} placeholder="新分栏" onChange={(event) => setColumn(event.target.value)} />
        <button className="ghost">添加分栏</button>
      </form>
      <TaskList state={state} mode={mode} onOpen={(task) => onOpen(task.id, task.projectId)} />
    </div>
  );
}

function TagPage({ state, onOpen }: { state: ReturnType<typeof useTodo>; onOpen: (id: string, projectId: string | null) => void }) {
  const { id = "" } = useParams();
  return <TaskList state={state} mode={{ kind: "tag", id }} onOpen={(task) => onOpen(task.id, task.projectId)} />;
}

function FilterPage({ state, onOpen }: { state: ReturnType<typeof useTodo>; onOpen: (id: string, projectId: string | null) => void }) {
  const { id = "" } = useParams();
  return <TaskList state={state} mode={{ kind: "filter", id }} onOpen={(task) => onOpen(task.id, task.projectId)} />;
}

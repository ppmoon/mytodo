import { useEffect, useState, useSyncExternalStore } from "react";
import { NavLink, Navigate, Route, Routes, useLocation, useParams, useSearchParams } from "react-router-dom";
import { todayYmd, ymdString } from "./lib/dates";
import { parseQuickAdd } from "./lib/nlp";
import { store } from "./store";
import { TaskList } from "./ui/TaskList";
import { TaskDialog } from "./ui/TaskDialog";
import { CalendarView, CountdownView, CoursesView, FocusView, HabitsView, MatrixView, SearchView, SettingsView, SummaryView, TimelineView, TimersView, WatchView, WidgetsView } from "./ui/views";
import { tasksFor, type ListMode } from "./select";
import { uid } from "./lib/id";

const GROUPS: { label: string; links: [string, string][] }[] = [
  { label: "今天", links: [["/today", "今天"], ["/upcoming", "最近 7 天"], ["/inbox", "收集箱"]] },
  { label: "计划", links: [["/calendar", "日历"], ["/timeline", "时间线"], ["/matrix", "四象限"]] },
  { label: "生活", links: [["/habits", "习惯"], ["/focus", "专注"], ["/courses", "课程表"], ["/countdowns", "倒数日"]] },
];

const MORE: [string, string][] = [
  ["/summary", "摘要"],
  ["/timers", "计时器"],
  ["/widgets", "小部件"],
  ["/watch", "手表"],
  ["/search", "搜索"],
  ["/completed", "已完成"],
  ["/trash", "垃圾桶"],
];

const LINKS: [string, string][] = [...GROUPS.flatMap((group) => group.links), ...MORE, ["/settings", "设置"]];

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

  const { pathname } = useLocation();
  const titled = LINKS.find((link) => link[0] === pathname)?.[1];
  const project = pathname.startsWith("/project/") ? state.projects.find((item) => item.id === pathname.split("/")[2]) : undefined;
  const tag = pathname.startsWith("/tag/") ? state.tags.find((item) => item.id === pathname.split("/")[2]) : undefined;
  const filter = pathname.startsWith("/filter/") ? state.filters.find((item) => item.id === pathname.split("/")[2]) : undefined;
  const title = titled ?? project?.name ?? (tag ? `#${tag.name}` : filter?.name) ?? "任务";
  const showToday = pathname === "/" || pathname === "/today";
  const openTask = (task: { id: string; projectId: string | null }) => setEditor({ id: task.id, projectId: task.projectId });
  return (
    <div className="app">
      {menu && <button className="scrim" aria-label="关闭菜单" onClick={() => setMenu(false)} />}
      <aside className={menu ? "side open" : "side"}>
        <div className="side-scroll">
        <h1 className="brand">mytodo</h1>
        <p className="lede">存在 Cloudflare 的 D1 里</p>
        {GROUPS.map((group) => (
          <div key={group.label}>
            <div className="group">{group.label}</div>
            {group.links.map(([href, label]) => <NavLink key={href} to={href} className="nav-link" onClick={() => setMenu(false)}>{label}</NavLink>)}
          </div>
        ))}
        <div className="group">清单</div>
        {state.projects.filter((item) => !item.archived).map((item) => (
          <NavLink key={item.id} to={`/project/${item.id}`} className="nav-link" onClick={() => setMenu(false)}><span><i className="dot" style={{ background: item.color }} /> {item.name}</span></NavLink>
        ))}
        <Creator label="新清单" onCreate={(name) => store.saveProject({ id: uid(), folderId: null, name, color: "#1f6b4a", pinned: false, archived: false, sortOrder: state.projects.length, createdAt: new Date().toISOString() })} />
        <Creator label="新文件夹" onCreate={(name) => store.saveFolder(uid(), name)} />
        <div className="group">标签</div>
        {state.tags.map((item) => <NavLink key={item.id} to={`/tag/${item.id}`} className="nav-link" onClick={() => setMenu(false)}>#{item.name}</NavLink>)}
        <div className="group">筛选</div>
        {state.filters.map((item) => <NavLink key={item.id} to={`/filter/${item.id}`} className="nav-link" onClick={() => setMenu(false)}>{item.name}</NavLink>)}
        <Creator label="新筛选（名称即关键词）" onCreate={(name) => store.saveFilter(uid(), name, { text: name })} />
        {state.templates.length > 0 && <div className="group">模板</div>}
        {state.templates.map((template) => <button key={template.id} className="linkish" onClick={() => store.createFromTemplate(template.id)}>{template.name}</button>)}
        <div className="group">其他</div>
        {MORE.map(([href, label]) => <NavLink key={href} to={href} className="nav-link" onClick={() => setMenu(false)}>{label}</NavLink>)}
        </div>
        <NavLink to="/settings" className="nav-link nav-foot" onClick={() => setMenu(false)}>设置</NavLink>
      </aside>
      <main className="main">
        <div className={showToday ? "today-layout" : undefined}>
        <div>
        <header className="top">
          <div>
            <DateKicker timezone={state.settings.timezone} />
            <h1>{title}</h1>
          </div>
          <div className="row">
            <button className="ghost menu-btn" onClick={() => setMenu(true)}>菜单</button>
            <button className="primary" onClick={() => setEditor({ id: null, projectId: pathname.startsWith("/project/") ? pathname.split("/")[2] : "inbox" })}>新任务</button>
          </div>
        </header>
        <QuickAdd timezone={state.settings.timezone} />
        <Routes>
          <Route path="/" element={<Navigate to="/today" replace />} />
          <Route path="/today" element={<TaskList state={state} mode={{ kind: "today" }} onOpen={openTask} />} />
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
        </div>
        {showToday && <TodayRail state={state} />}
        </div>
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
      {state.undoLabel && <div className={state.notice ? "toast card stacked" : "toast card"}><span>{state.undoLabel}</span><button className="primary" onClick={() => store.undo()}>撤销</button></div>}
    </div>
  );
}

function DateKicker({ timezone }: { timezone: string }) {
  const ymd = todayYmd(new Date(), timezone);
  const week = "日一二三四五六"[new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d)).getUTCDay()];
  return <p className="kicker">{ymd.m}月{ymd.d}日 周{week}</p>;
}

function TodayRail({ state }: { state: ReturnType<typeof useTodo> }) {
  const today = ymdString(todayYmd(new Date(), state.settings.timezone));
  const openToday = tasksFor(state, { kind: "today" }).length;
  const inbox = tasksFor(state, { kind: "inbox" }).length;
  const habitsLeft = state.habits.filter((habit) => !habit.archived && !state.habitLogs.some((log) => log.habitId === habit.id && log.day === today && log.status === "check")).length;
  const focusMinutes = Math.round(state.sessions.filter((session) => session.endedAt && session.startedAt.slice(0, 10) === today).reduce((sum, session) => sum + session.plannedSeconds, 0) / 60);
  return (
    <aside className="rail">
      <strong>今天还剩 {openToday} 件</strong>
      <p>收集箱 {inbox}</p>
      <p>习惯 {habitsLeft}</p>
      <p>专注 {focusMinutes > 0 ? focusMinutes : state.settings.pomodoroWork} 分钟</p>
    </aside>
  );
}

function QuickAdd({ timezone }: { timezone: string }) {
  const [text, setText] = useState("");
  const parsed = text.trim() ? parseQuickAdd(text, new Date(), timezone) : null;
  return (
    <form className="quick" onSubmit={(event) => { event.preventDefault(); store.quickAdd(text); setText(""); }}>
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

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { addDays, dueYmd, formatClock, todayYmd, ymdString, type Ymd } from "../lib/dates";
import { holidayOn } from "../lib/holidays";
import { lunarLabel } from "../lib/lunar";
import { store, type AppState } from "../store";
import { HABIT_PRESETS, type Course, type Habit } from "../types";
import { uid } from "../lib/id";

function monthCells(anchor: Ymd): (Ymd | null)[] {
  const first = (new Date(Date.UTC(anchor.y, anchor.m - 1, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(anchor.y, anchor.m, 0)).getUTCDate();
  const cells: (Ymd | null)[] = Array.from({ length: first }, () => null);
  for (let day = 1; day <= days; day += 1) cells.push({ y: anchor.y, m: anchor.m, d: day });
  return cells;
}

export function CalendarView({ state }: { state: AppState }) {
  const [mode, setMode] = useState<"month" | "week" | "three" | "day">("month");
  const [cursor, setCursor] = useState(() => todayYmd(new Date(), state.settings.timezone));
  const [ics, setIcs] = useState("");
  const today = ymdString(todayYmd(new Date(), state.settings.timezone));
  const cells = monthCells(cursor);
  const span = mode === "day" ? 1 : mode === "three" ? 3 : mode === "week" ? 7 : 0;
  const days = span ? Array.from({ length: span }, (_, index) => addDays(cursor, index - (mode === "week" ? (new Date(Date.UTC(cursor.y, cursor.m - 1, cursor.d)).getUTCDay() + 6) % 7 : 0))) : [];
  return (
    <div>
      <div className="row" style={{ marginBottom: 12 }}>
        {(["month", "week", "three", "day"] as const).map((item) => <button key={item} className={mode === item ? "primary" : "ghost"} onClick={() => setMode(item)}>{item === "month" ? "月" : item === "week" ? "周" : item === "three" ? "三日" : "日"}</button>)}
        <button className="ghost" onClick={() => setCursor(addDays(cursor, mode === "month" ? -30 : -span))}>上一页</button>
        <button className="ghost" onClick={() => setCursor(todayYmd(new Date(), state.settings.timezone))}>今天</button>
        <button className="ghost" onClick={() => setCursor(addDays(cursor, mode === "month" ? 30 : span || 1))}>下一页</button>
      </div>
      {mode === "month" ? (
        <div className="month">
          {cells.map((day, index) => {
            const key = day ? ymdString(day) : `e${index}`;
            const names = day ? state.tasks.filter((task) => !task.deletedAt && ymdString(dueYmd(task.dueAt, task.allDay, task.timezone) ?? { y: 0, m: 0, d: 0 }) === key).map((task) => task.title) : [];
            const holiday = day ? holidayOn(key) : null;
            return (
              <div key={key} className={key === today ? "daycell today" : "daycell"}>
                {day && <strong>{day.d} {holiday}</strong>}
                {day && <em>{lunarLabel(key)}</em>}
                {names.slice(0, 3).map((name) => <div key={name}>{name}</div>)}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="month" style={{ gridTemplateColumns: `repeat(${span}, 1fr)` }}>
          {days.map((day) => {
            const key = ymdString(day);
            const items = state.tasks.filter((task) => !task.deletedAt && ymdString(dueYmd(task.dueAt, task.allDay, task.timezone) ?? { y: 0, m: 0, d: 0 }) === key);
            const events = state.events.filter((event) => event.startAt.slice(0, 10) === key);
            return <div key={key} className={key === today ? "daycell today" : "daycell"}><strong>{key}</strong>{items.map((task) => <div key={task.id}>{task.allDay ? task.title : `${formatClock(task.dueAt!, task.timezone)} ${task.title}`}</div>)}{events.map((event) => <div key={event.id}>{event.title}</div>)}</div>;
          })}
        </div>
      )}
      <div className="panel" style={{ padding: 12, marginTop: 16 }}>
        <strong>导入日历</strong>
        <p className="meta">可以把系统日历导出的 .ics 贴进来，或填写订阅地址。浏览器跨域限制可能让地址订阅失败，这时改用文件内容。不能写回手机系统日历。</p>
        <textarea rows={4} value={ics} onChange={(event) => setIcs(event.target.value)} placeholder="BEGIN:VCALENDAR" />
        <div className="row">
          <button className="primary" onClick={async () => {
            const { parseIcs } = await import("../lib/ics");
            const events = parseIcs(ics);
            const source = store.saveSource("导入的日历", null);
            store.addEvents(source, events);
            setIcs("");
          }}>导入文本</button>
          <input type="file" accept=".ics,text/calendar" onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            const { parseIcs } = await import("../lib/ics");
            const source = store.saveSource(file.name, null);
            store.addEvents(source, parseIcs(await file.text()));
          }} />
        </div>
        {state.sources.map((source) => <p key={source.id}>{source.name} <button className="ghost" onClick={() => store.deleteSource(source.id)}>移除</button></p>)}
      </div>
    </div>
  );
}

export function TimelineView({ state }: { state: AppState }) {
  const groups = new Map<string, string[]>();
  state.tasks.filter((task) => !task.deletedAt && task.dueAt).forEach((task) => {
    const key = task.dueAt!.slice(0, 10);
    groups.set(key, [...(groups.get(key) ?? []), `${task.allDay ? "全天" : formatClock(task.dueAt!, task.timezone)} ${task.title}`]);
  });
  return <div>{[...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, items]) => <section key={day} className="panel" style={{ padding: 12, marginBottom: 8 }}><strong>{day}</strong>{items.map((item) => <p key={item}>{item}</p>)}</section>)}</div>;
}

export function MatrixView({ state }: { state: AppState }) {
  const today = todayYmd(new Date(), state.settings.timezone);
  const soon = ymdString(addDays(today, 2));
  const quadrants = [
    ["重要且紧急", (task: { priority: number; dueAt: string | null; allDay: boolean; timezone: string }) => task.priority >= 2 && !!task.dueAt && (dueYmd(task.dueAt, task.allDay, task.timezone) ? ymdString(dueYmd(task.dueAt, task.allDay, task.timezone)!) <= soon : false)],
    ["重要不紧急", (task: { priority: number; dueAt: string | null; allDay: boolean; timezone: string }) => task.priority >= 2 && (!task.dueAt || ymdString(dueYmd(task.dueAt, task.allDay, task.timezone)!) > soon)],
    ["紧急不重要", (task: { priority: number; dueAt: string | null; allDay: boolean; timezone: string }) => task.priority < 2 && !!task.dueAt && ymdString(dueYmd(task.dueAt, task.allDay, task.timezone)!) <= soon],
    ["不紧急不重要", (task: { priority: number; dueAt: string | null; allDay: boolean; timezone: string }) => task.priority < 2 && (!task.dueAt || ymdString(dueYmd(task.dueAt, task.allDay, task.timezone)!) > soon)],
  ] as const;
  const open = state.tasks.filter((task) => task.status === "open" && !task.deletedAt && !task.parentId);
  return (
    <div className="matrix">
      {quadrants.map(([title, match]) => (
        <section key={title} className="panel">
          <strong>{title}</strong>
          {open.filter((task) => match(task)).map((task) => <p key={task.id}>{task.title}</p>)}
        </section>
      ))}
    </div>
  );
}

export function SummaryView({ state }: { state: AppState }) {
  const open = state.tasks.filter((task) => task.status === "open" && !task.deletedAt).length;
  const done = state.completions.length;
  return (
    <div className="widgets">
      <article className="widget"><h3>未完成</h3><p className="focus-clock" style={{ fontSize: 56 }}>{open}</p></article>
      <article className="widget"><h3>最近完成</h3>{state.completions.map((item) => <p key={item.id}>{item.title}</p>)}</article>
      <article className="widget"><h3>完成记录</h3><p>{done} 条留在本机</p></article>
    </div>
  );
}

export function HabitsView({ state }: { state: AppState }) {
  const today = ymdString(todayYmd(new Date(), state.settings.timezone));
  const [name, setName] = useState("");
  const [preset, setPreset] = useState<string>(HABIT_PRESETS[0][0]);
  const [section, setSection] = useState("");
  return (
    <div>
      <form className="row" onSubmit={(event) => {
        event.preventDefault();
        const found = HABIT_PRESETS.find((item) => item[0] === preset);
        const habit: Habit = { id: uid(), sectionId: null, name: name || found?.[1] || "习惯", preset, period: "daily", targetCount: 1, archived: false, createdAt: new Date().toISOString() };
        store.saveHabit(habit);
        setName("");
      }}>
        <select value={preset} onChange={(event) => setPreset(event.target.value)}>{HABIT_PRESETS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
        <input value={name} placeholder="自定义名称" onChange={(event) => setName(event.target.value)} />
        <button className="primary">添加习惯</button>
      </form>
      <form className="row" onSubmit={(event) => { event.preventDefault(); if (section.trim()) { store.saveHabitSection(uid(), section.trim()); setSection(""); } }}>
        <input value={section} placeholder="新分组" onChange={(event) => setSection(event.target.value)} />
        <button className="ghost">添加分组</button>
      </form>
      {state.habits.filter((habit) => !habit.archived).map((habit) => {
        const log = state.habitLogs.find((item) => item.habitId === habit.id && item.day === today);
        const sectionName = state.habitSections.find((item) => item.id === habit.sectionId)?.name;
        return (
          <article key={habit.id} className="habit card">
            <div><strong>{habit.name}</strong><div className="meta">{sectionName || "未分组"} · {habit.period === "daily" ? "每天" : "每周"}</div></div>
            <div className="chips">
              <button className={log?.status === "check" ? "primary" : "ghost"} onClick={() => store.logHabit(habit.id, today, log?.status === "check" ? null : "check")}>打卡</button>
              <button className="ghost" onClick={() => store.logHabit(habit.id, today, "skip")}>跳过</button>
              <button className="ghost" onClick={() => store.logHabit(habit.id, today, "freeze")}>冻结</button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function FocusView({ state }: { state: AppState }) {
  const [full, setFull] = useState(false);
  const running = state.sessions.find((session) => !session.endedAt);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const elapsed = running ? Math.floor((now - new Date(running.startedAt).getTime()) / 1000) : 0;
  const left = running && running.mode !== "stopwatch" ? Math.max(0, running.plannedSeconds - elapsed) : elapsed;
  const label = running?.mode === "stopwatch" ? "正计时" : running?.mode === "pomodoro-break" ? "休息" : "番茄钟";
  const clock = `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;
  const days = Array.from({ length: 7 }, (_, index) => addDays(todayYmd(new Date(), state.settings.timezone), index - 6));
  const body = (
    <div>
      <p className="meta">{label}</p>
      <div className="focus-clock">{clock}</div>
      <div className="row">
        <button className="primary" onClick={() => store.startFocus("pomodoro-work", state.settings.pomodoroWork * 60, null)}>开始番茄</button>
        <button className="ghost" onClick={() => store.startFocus("pomodoro-break", state.settings.pomodoroBreak * 60, null)}>休息</button>
        <button className="ghost" onClick={() => store.startFocus("stopwatch", 0, null)}>正计时</button>
        <button className="ghost" onClick={() => store.stopFocus()}>停止</button>
        <button className="ghost" onClick={() => setFull(true)}>全屏</button>
      </div>
      <div className="bars" style={{ marginTop: 24 }}>
        {days.map((day) => {
          const key = ymdString(day);
          const minutes = state.sessions.filter((session) => session.startedAt.slice(0, 10) === key && session.endedAt).reduce((sum, session) => sum + session.plannedSeconds, 0) / 60;
          return <i key={key} title={key} style={{ height: Math.max(8, Math.min(120, minutes)) }} />;
        })}
      </div>
    </div>
  );
  if (full) return <div className="fullscreen"><div>{body}<button className="ghost" onClick={() => setFull(false)}>退出全屏</button></div></div>;
  return body;
}

export function CoursesView({ state }: { state: AppState }) {
  const [draft, setDraft] = useState<Course>({ id: uid(), name: "", teacher: "", room: "", weekday: 0, startSlot: 1, endSlot: 1, color: "#0f6e6e" });
  return (
    <div>
      <form className="fields" onSubmit={(event) => { event.preventDefault(); if (!draft.name.trim()) return; store.saveCourse(draft); setDraft({ ...draft, id: uid(), name: "" }); }}>
        <label className="field">课程<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
        <label className="field">老师<input value={draft.teacher} onChange={(event) => setDraft({ ...draft, teacher: event.target.value })} /></label>
        <label className="field">教室<input value={draft.room} onChange={(event) => setDraft({ ...draft, room: event.target.value })} /></label>
        <label className="field">星期<select value={draft.weekday} onChange={(event) => setDraft({ ...draft, weekday: Number(event.target.value) })}>{"一二三四五六日".split("").map((label, index) => <option value={index} key={label}>周{label}</option>)}</select></label>
        <label className="field">开始节<select value={draft.startSlot} onChange={(event) => setDraft({ ...draft, startSlot: Number(event.target.value) })}>{state.periods.map((period) => <option key={period.slot} value={period.slot}>{period.slot}</option>)}</select></label>
        <label className="field">结束节<select value={draft.endSlot} onChange={(event) => setDraft({ ...draft, endSlot: Number(event.target.value) })}>{state.periods.map((period) => <option key={period.slot} value={period.slot}>{period.slot}</option>)}</select></label>
        <button className="primary">保存课程</button>
      </form>
      <div className="course" style={{ marginTop: 16 }}>
        <div />
        {"一二三四五六日".split("").map((label) => <div key={label}>周{label}</div>)}
        {state.periods.map((period) => (
          <>
            <div key={`p${period.slot}`}>{period.startTime}</div>
            {Array.from({ length: 7 }, (_, weekday) => {
              const course = state.courses.find((item) => item.weekday === weekday && period.slot >= item.startSlot && period.slot <= item.endSlot);
              return <div key={`${period.slot}-${weekday}`} style={{ background: course ? course.color : undefined, color: course ? "#fff" : undefined }}>{course ? `${course.name} ${course.room}` : ""}</div>;
            })}
          </>
        ))}
      </div>
    </div>
  );
}

export function CountdownView({ state }: { state: AppState }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const today = ymdString(todayYmd(new Date(), state.settings.timezone));
  return (
    <div>
      <form className="row" onSubmit={(event) => { event.preventDefault(); store.saveCountdown({ id: uid(), title, targetOn: date, archived: false }); setTitle(""); }}>
        <input value={title} placeholder="倒数日" onChange={(event) => setTitle(event.target.value)} />
        <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        <button className="primary">添加</button>
      </form>
      {state.countdowns.filter((item) => !item.archived).map((item) => {
        const days = Math.ceil((Date.parse(item.targetOn) - Date.parse(today)) / 86400000);
        return <article key={item.id} className="habit card"><div><strong>{item.title}</strong><div className="meta">{item.targetOn}</div></div><b>{days} 天</b></article>;
      })}
    </div>
  );
}

export function TimersView({ state }: { state: AppState }) {
  const [title, setTitle] = useState("计时");
  const [minutes, setMinutes] = useState(15);
  return (
    <div>
      <form className="row" onSubmit={(event) => { event.preventDefault(); store.saveTimer({ id: uid(), title, durationSeconds: minutes * 60, remainingSeconds: minutes * 60, runningSince: null, archived: false }); }}>
        <input value={title} onChange={(event) => setTitle(event.target.value)} />
        <input type="number" value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} />
        <button className="primary">添加计时器</button>
      </form>
      {state.timers.filter((timer) => !timer.archived).map((timer) => {
        const remaining = timer.runningSince ? Math.max(0, timer.remainingSeconds - Math.floor((Date.now() - Date.parse(timer.runningSince)) / 1000)) : timer.remainingSeconds;
        return (
          <article key={timer.id} className="habit card">
            <div><strong>{timer.title}</strong><div className="meta">{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</div></div>
            <div className="row">
              <button className="ghost" onClick={() => store.saveTimer({ ...timer, runningSince: timer.runningSince ? null : new Date().toISOString(), remainingSeconds: remaining })}>{timer.runningSince ? "暂停" : "开始"}</button>
              <button className="ghost" onClick={() => store.saveTimer({ ...timer, archived: true, runningSince: null })}>归档</button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function WidgetsView({ state }: { state: AppState }) {
  const today = ymdString(todayYmd(new Date(), state.settings.timezone));
  const due = state.tasks.filter((task) => task.status === "open" && !task.deletedAt && ymdString(dueYmd(task.dueAt, task.allDay, task.timezone) ?? { y: 0, m: 0, d: 0 }) === today);
  const habits = state.habitLogs.filter((log) => log.day === today && log.status === "check").length;
  return (
    <div className="widgets">
      <article className="widget"><h3>今日</h3>{due.map((task) => <p key={task.id}>{task.title}</p>)}</article>
      <article className="widget"><h3>未完成数量</h3><p className="focus-clock" style={{ fontSize: 48 }}>{state.tasks.filter((task) => task.status === "open" && !task.deletedAt).length}</p></article>
      <article className="widget"><h3>习惯打卡</h3><p>{habits} / {state.habits.filter((habit) => !habit.archived).length}</p></article>
      <article className="widget"><h3>专注</h3><p>{state.sessions.filter((session) => session.endedAt).length} 段已结束</p></article>
      <article className="widget"><h3>倒数日</h3>{state.countdowns.filter((item) => !item.archived).slice(0, 3).map((item) => <p key={item.id}>{item.title}</p>)}</article>
      <article className="widget"><h3>快速添加</h3><QuickInline /></article>
    </div>
  );
}

function QuickInline() {
  const [text, setText] = useState("");
  return <form onSubmit={(event) => { event.preventDefault(); store.quickAdd(text); setText(""); }}><input value={text} onChange={(event) => setText(event.target.value)} placeholder="明天 交报告" /><button className="primary">添加</button></form>;
}

export function WatchView({ state }: { state: AppState }) {
  const today = ymdString(todayYmd(new Date(), state.settings.timezone));
  const tasks = state.tasks.filter((task) => task.status === "open" && !task.deletedAt && ymdString(dueYmd(task.dueAt, task.allDay, task.timezone) ?? { y: 0, m: 0, d: 0 }) <= today);
  return <div className="watch">{tasks.map((task) => <article key={task.id} className="task"><button className="check" onClick={() => store.toggleComplete(task.id)} /><h3>{task.title}</h3></article>)}{!tasks.length && <p className="empty">今天没有待办。</p>}</div>;
}

export function SearchView({ state }: { state: AppState }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const results = query.trim() ? state.tasks.filter((task) => `${task.title} ${task.notes}`.includes(query.trim()) && !task.deletedAt) : [];
  return (
    <div>
      <form className="search" onSubmit={(event) => { event.preventDefault(); store.rememberSearch(query); }}>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、备注" />
      </form>
      <div className="chips">{state.searchHistory.map((item) => <button key={item.id} className="chip" onClick={() => setQuery(item.query)}>{item.query}</button>)}</div>
      {results.map((task) => <p key={task.id}><button className="linkish" onClick={() => navigate(`/project/${task.projectId ?? "inbox"}`)}>{task.title}</button></p>)}
    </div>
  );
}

export function SettingsView({ state }: { state: AppState }) {
  const settings = state.settings;
  const tabs = ["today", "calendar", "matrix", "habits", "focus", "widgets", "more"];
  return (
    <div className="fields">
      <label className="field">外观
        <select value={settings.theme} onChange={(event) => store.updateSettings({ theme: event.target.value as "light" | "dark" })}>
          <option value="light">纸色</option><option value="dark">夜色</option>
        </select>
      </label>
      <label className="field">强调色<input type="color" value={settings.accent} onChange={(event) => store.updateSettings({ accent: event.target.value })} /></label>
      <label className="field">时区
        <select value={settings.timezone} onChange={(event) => store.updateSettings({ timezone: event.target.value })}>
          {["Asia/Shanghai", "Asia/Tokyo", "Europe/London", "America/New_York", "UTC"].map((zone) => <option key={zone}>{zone}</option>)}
        </select>
      </label>
      <label className="field">列表排序
        <select value={settings.listSort} onChange={(event) => store.updateSettings({ listSort: event.target.value as typeof settings.listSort })}>
          <option value="manual">手动</option><option value="due">日期</option><option value="priority">优先级</option><option value="tag">标签</option><option value="pinned">置顶优先</option>
        </select>
      </label>
      <label className="field">右滑
        <select value={settings.swipeRight} onChange={(event) => store.updateSettings({ swipeRight: event.target.value as typeof settings.swipeRight })}>
          <option value="complete">完成</option><option value="pin">置顶</option>
        </select>
      </label>
      <label className="field">左滑
        <select value={settings.swipeLeft} onChange={(event) => store.updateSettings({ swipeLeft: event.target.value as typeof settings.swipeLeft })}>
          <option value="delete">删除</option><option value="postpone">推迟一天</option>
        </select>
      </label>
      <label className="field">番茄分钟<input type="number" value={settings.pomodoroWork} onChange={(event) => store.updateSettings({ pomodoroWork: Number(event.target.value) })} /></label>
      <label className="field">休息分钟<input type="number" value={settings.pomodoroBreak} onChange={(event) => store.updateSettings({ pomodoroBreak: Number(event.target.value) })} /></label>
      <div className="field wide">底部标签
        <div className="chips">
          {tabs.map((tab) => <button type="button" key={tab} className="chip" onClick={() => {
            const next = settings.tabs.includes(tab) ? settings.tabs.filter((item) => item !== tab) : [...settings.tabs, tab];
            store.updateSettings({ tabs: next.slice(0, 5) });
          }}>{settings.tabs.includes(tab) ? "● " : ""}{tab}</button>)}
        </div>
      </div>
      <button className="ghost" onClick={() => Notification.requestPermission()}>允许提醒通知</button>
      <button className="ghost" onClick={async () => {
        const bytes = await store.exportFile();
        const blob = new Blob([bytes as BlobPart], { type: "application/octet-stream" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "mytodo.sqlite";
        link.click();
        URL.revokeObjectURL(url);
      }}>导出 SQLite</button>
      <label className="ghost">导入 SQLite<input type="file" onChange={async (event) => {
        const file = event.target.files?.[0];
        if (file) await store.importFile(new Uint8Array(await file.arrayBuffer()));
      }} /></label>
      <p className="meta">数据只在这台浏览器里。账号、协作和会员没有做。节假日列出的是节日当天，调休以当年公布为准。</p>
    </div>
  );
}

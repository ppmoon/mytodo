import { useEffect, useMemo, useState } from "react";
import { isoToLocalInput, wallTimeToUtc } from "../lib/dates";
import { describeRepeat, type RepeatRule } from "../lib/nlp";
import { store } from "../store";
import type { AppState } from "../store";
import { blankTask } from "../store";
import type { ChecklistItem, Reminder, Task } from "../types";

const ZONES = ["Asia/Shanghai", "Asia/Tokyo", "Europe/London", "America/New_York", "UTC"];

export function TaskDialog({
  state,
  taskId,
  projectId,
  onClose,
}: {
  state: AppState;
  taskId: string | null;
  projectId: string | null;
  onClose: () => void;
}) {
  const existing = state.tasks.find((task) => task.id === taskId);
  const [task, setTask] = useState<Task>(() => existing ?? blankTask(projectId));
  const [tagIds, setTagIds] = useState<string[]>(() => state.taskTags.filter((link) => link.taskId === task.id).map((link) => link.tagId));
  const [items, setItems] = useState<ChecklistItem[]>(() => state.checklist.filter((item) => item.taskId === task.id));
  const [reminders, setReminders] = useState<Reminder[]>(() => state.reminders.filter((item) => item.taskId === task.id));
  const [comment, setComment] = useState("");
  const [tagName, setTagName] = useState("");
  const [error, setError] = useState("");
  const columns = state.columns.filter((column) => column.projectId === task.projectId);
  const comments = state.comments.filter((item) => item.taskId === task.id);
  const attachments = state.attachments.filter((item) => item.taskId === task.id);
  const preview = useMemo(() => attachments.map((file) => ({ ...file, url: store.attachmentUrl(file.id) })), [attachments]);

  useEffect(() => () => preview.forEach((file) => file.url && URL.revokeObjectURL(file.url)), [preview]);

  function patch(partial: Partial<Task>) {
    setTask((current) => ({ ...current, ...partial }));
  }

  function dueInput(value: string) {
    if (!value) {
      patch({ dueAt: null });
      return;
    }
    patch({ dueAt: task.allDay ? value.slice(0, 10) : wallTimeToUtc(value, task.timezone).toISOString() });
  }

  function toggleOffset(minutes: number) {
    setReminders((current) => {
      if (minutes < 0) {
        const found = current.find((item) => item.fireAt === "location");
        if (found) return current.filter((item) => item !== found);
        return [...current, { id: crypto.randomUUID(), taskId: task.id, fireAt: "location", offsetMinutes: null, status: "pending", createdAt: new Date().toISOString() }];
      }
      const found = current.find((item) => item.offsetMinutes === minutes);
      if (found) return current.filter((item) => item !== found);
      return [...current, { id: crypto.randomUUID(), taskId: task.id, fireAt: new Date().toISOString(), offsetMinutes: minutes, status: "pending", createdAt: new Date().toISOString() }];
    });
  }

  return (
    <div className="dialog-back" onMouseDown={onClose}>
      <form
        className="dialog"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          if (!task.title.trim()) return;
          store.saveTask({ ...task, title: task.title.trim() }, tagIds, items.filter((item) => item.title.trim()), reminders);
          onClose();
        }}
      >
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ fontFamily: "var(--serif)", margin: 0 }}>{existing ? "编辑任务" : "新任务"}</h2>
          <button type="button" className="ghost" onClick={onClose}>关闭</button>
        </div>
        <div className="fields" style={{ marginTop: 12 }}>
          <label className="field wide">标题<input value={task.title} onChange={(event) => patch({ title: event.target.value })} /></label>
          <label className="field wide">备注<textarea rows={3} value={task.notes} onChange={(event) => patch({ notes: event.target.value })} /></label>
          <label className="field">优先级
            <select value={task.priority} onChange={(event) => patch({ priority: Number(event.target.value) })}>
              <option value={0}>无</option><option value={1}>低</option><option value={2}>中</option><option value={3}>高</option>
            </select>
          </label>
          <label className="field">进度 {task.progress}%
            <input type="range" min={0} max={100} value={task.progress} onChange={(event) => patch({ progress: Number(event.target.value) })} disabled={items.length > 0} />
          </label>
          <label className="field">清单
            <select value={task.projectId ?? ""} onChange={(event) => patch({ projectId: event.target.value || null, columnId: null })}>
              {state.projects.filter((project) => !project.archived).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </label>
          <label className="field">分栏
            <select value={task.columnId ?? ""} onChange={(event) => patch({ columnId: event.target.value || null })}>
              <option value="">未分栏</option>
              {columns.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}
            </select>
          </label>
          <label className="field">父任务
            <select value={task.parentId ?? ""} onChange={(event) => patch({ parentId: event.target.value || null })}>
              <option value="">无</option>
              {state.tasks.filter((item) => item.id !== task.id && !item.deletedAt && !item.parentId).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
          </label>
          <label className="field">时区
            <select value={task.timezone} onChange={(event) => patch({ timezone: event.target.value })}>
              {ZONES.map((zone) => <option key={zone}>{zone}</option>)}
            </select>
          </label>
          <label className="field"><span>全天</span><input type="checkbox" checked={task.allDay} onChange={(event) => patch({ allDay: event.target.checked })} /></label>
          <label className="field">开始
            <input type={task.allDay ? "date" : "datetime-local"} value={task.startAt ? (task.allDay ? task.startAt.slice(0, 10) : isoToLocalInput(task.startAt, task.timezone)) : ""} onChange={(event) => patch({ startAt: event.target.value ? (task.allDay ? event.target.value : wallTimeToUtc(event.target.value, task.timezone).toISOString()) : null })} />
          </label>
          <label className="field">截止
            <input type={task.allDay ? "date" : "datetime-local"} value={task.dueAt ? (task.allDay ? task.dueAt.slice(0, 10) : isoToLocalInput(task.dueAt, task.timezone)) : ""} onChange={(event) => dueInput(event.target.value)} />
          </label>
          <label className="field">重复
            <select value={task.repeat?.freq ?? ""} onChange={(event) => patch({ repeat: event.target.value ? { freq: event.target.value as RepeatRule["freq"], interval: task.repeat?.interval ?? 1, weekdays: task.repeat?.weekdays ?? [] } : null })}>
              <option value="">不重复</option><option value="daily">每天</option><option value="weekly">每周</option><option value="monthly">每月</option>
            </select>
          </label>
          <label className="field">间隔
            <input type="number" min={1} value={task.repeat?.interval ?? 1} onChange={(event) => task.repeat && patch({ repeat: { ...task.repeat, interval: Number(event.target.value) } })} />
          </label>
          {task.repeat?.freq === "weekly" && (
            <div className="field wide">星期
              <div className="chips">
                {"一二三四五六日".split("").map((label, index) => (
                  <button type="button" className="chip" key={label} onClick={() => {
                    const weekdays = new Set(task.repeat?.weekdays ?? []);
                    if (weekdays.has(index)) weekdays.delete(index); else weekdays.add(index);
                    patch({ repeat: { ...task.repeat!, weekdays: [...weekdays] } });
                  }}>{(task.repeat?.weekdays ?? []).includes(index) ? "●" : ""}周{label}</button>
                ))}
              </div>
            </div>
          )}
          <p className="meta">{describeRepeat(task.repeat)}</p>
          <div className="field wide">提醒
            <div className="chips">
              {[0, 10, 60, 1440].map((minutes) => (
                <button type="button" className="chip" key={minutes} onClick={() => toggleOffset(minutes)}>
                  {reminders.some((item) => item.offsetMinutes === minutes) ? "● " : ""}{minutes === 0 ? "准时" : minutes === 1440 ? "提前 1 天" : `提前 ${minutes} 分钟`}
                </button>
              ))}
              <button type="button" className="chip" onClick={() => toggleOffset(-1)}>{reminders.some((item) => item.fireAt === "location") ? "● " : ""}到达地点</button>
            </div>
          </div>
          <label className="field">地点<input value={task.locationName ?? ""} onChange={(event) => patch({ locationName: event.target.value })} /></label>
          <label className="field">范围（米）<input type="number" value={task.locationRadius ?? 300} onChange={(event) => patch({ locationRadius: Number(event.target.value) })} /></label>
          <button type="button" className="ghost" onClick={() => navigator.geolocation?.getCurrentPosition((pos) => patch({ locationLat: pos.coords.latitude, locationLng: pos.coords.longitude, locationName: task.locationName || "当前位置" }))}>使用当前位置</button>
          <div className="field wide">标签
            <div className="chips">
              {state.tags.map((tag) => (
                <button type="button" className="chip" key={tag.id} onClick={() => setTagIds((current) => current.includes(tag.id) ? current.filter((id) => id !== tag.id) : [...current, tag.id])}>
                  {tagIds.includes(tag.id) ? "● " : ""}{tag.name}
                </button>
              ))}
            </div>
            <div className="row">
              <input value={tagName} placeholder="新标签" onChange={(event) => setTagName(event.target.value)} />
              <button type="button" className="ghost" onClick={() => { if (tagName.trim()) { store.saveTag(tagName.trim(), "#9a3412"); setTagName(""); } }}>添加</button>
            </div>
          </div>
          <div className="field wide">子任务清单
            {items.map((item, index) => (
              <div className="row" key={item.id}>
                <input type="checkbox" checked={item.done} onChange={(event) => setItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, done: event.target.checked } : row))} />
                <input value={item.title} onChange={(event) => setItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, title: event.target.value } : row))} />
              </div>
            ))}
            <button type="button" className="ghost" onClick={() => setItems((current) => [...current, { id: crypto.randomUUID(), taskId: task.id, title: "", done: false, sortOrder: current.length }])}>添加一项</button>
          </div>
          {existing && (
            <div className="field wide">评论
              {comments.map((item) => <p key={item.id}>{item.body} <button type="button" className="ghost" onClick={() => store.deleteComment(item.id)}>删除</button></p>)}
              <div className="row">
                <input value={comment} onChange={(event) => setComment(event.target.value)} />
                <button type="button" className="ghost" onClick={() => { if (comment.trim()) { store.addComment(task.id, comment.trim()); setComment(""); } }}>发送</button>
              </div>
            </div>
          )}
          {existing && (
            <div className="field wide">附件
              {preview.map((file) => <p key={file.id}>{file.mime.startsWith("image/") && file.url ? <img alt="" src={file.url} style={{ maxWidth: 120 }} /> : null} {file.name} <button type="button" className="ghost" onClick={() => store.deleteAttachment(file.id)}>移除</button></p>)}
              <input type="file" onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                store.addAttachment(task.id, file).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "附件没有保存"));
              }} />
              {error && <span className="meta">{error}</span>}
            </div>
          )}
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="primary" type="submit">保存</button>
          {existing && <button type="button" className="ghost" onClick={() => { const name = window.prompt("模板名称", task.title); if (name) store.saveTemplate(task.id, name); }}>存为模板</button>}
          <label className="chip"><input type="checkbox" checked={task.pinned} onChange={(event) => patch({ pinned: event.target.checked })} /> 置顶</label>
        </div>
      </form>
    </div>
  );
}

import { useState } from "react";
import { formatWhen } from "../lib/dates";
import { childTasks, tasksFor, type ListMode } from "../select";
import { store, type AppState } from "../store";
import type { Task } from "../types";

export function TaskList({ state, mode, onOpen }: { state: AppState; mode: ListMode; onOpen: (task: Task) => void }) {
  const tasks = tasksFor(state, mode);
  const [dragId, setDragId] = useState<string | null>(null);
  const projectColumns = mode.kind === "project" ? state.columns.filter((column) => column.projectId === mode.id) : [];
  if (projectColumns.length) {
    return (
      <div className="board">
        {projectColumns.map((column) => (
          <article key={column.id} className="panel" onDragOver={(event) => event.preventDefault()} onDrop={() => dragId && store.moveTaskToColumn(dragId, column.id)}>
            <strong>{column.name}</strong>
            {tasks.filter((task) => task.columnId === column.id || (!task.columnId && column.sortOrder === 0)).map((task) => (
              <div key={task.id} draggable onDragStart={() => setDragId(task.id)}>
                <TaskRow state={state} task={task} onOpen={onOpen} />
              </div>
            ))}
          </article>
        ))}
      </div>
    );
  }
  if (!tasks.length) return <p className="empty">这里还没有任务。用上面的框快速添加，例如「明天上午9点 买牛奶 #生活 !高」。</p>;
  return <div>{tasks.map((task) => <TaskRow key={task.id} state={state} task={task} onOpen={onOpen} />)}</div>;
}

function TaskRow({ state, task, onOpen }: { state: AppState; task: Task; onOpen: (task: Task) => void }) {
  const [shift, setShift] = useState(0);
  const tags = state.tags.filter((tag) => state.taskTags.some((link) => link.taskId === task.id && link.tagId === tag.id));
  const children = childTasks(state, task.id);
  return (
    <article
      className="task"
      style={{ transform: `translateX(${shift}px)` }}
      onPointerDown={(event) => {
        const start = event.clientX;
        const move = (ev: PointerEvent) => setShift(ev.clientX - start);
        const up = (ev: PointerEvent) => {
          const delta = ev.clientX - start;
          if (delta > 90) state.settings.swipeRight === "complete" ? store.toggleComplete(task.id) : store.togglePin(task.id);
          if (delta < -90) state.settings.swipeLeft === "delete" ? store.trashTask(task.id) : store.postpone(task.id);
          setShift(0);
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      }}
    >
      <button className={task.status === "completed" ? "check on" : "check"} onClick={() => store.toggleComplete(task.id)} aria-label="完成" />
      <button style={{ border: 0, background: "transparent", textAlign: "left" }} onClick={() => onOpen(task)}>
        <h3>{task.pinned ? "📌 " : ""}{task.title}</h3>
        <div className="meta">
          <span>{formatWhen(task.dueAt, task.allDay, task.timezone) || "没有日期"}</span>
          {task.priority > 0 && <span>{["", "低", "中", "高"][task.priority]}优先级</span>}
          {task.progress > 0 && <span>{task.progress}%</span>}
          {tags.map((tag) => <span key={tag.id}>#{tag.name}</span>)}
        </div>
        {children.length > 0 && <div className="meta">{children.filter((item) => item.status === "completed").length}/{children.length} 个子任务</div>}
      </button>
      <i className="prio" style={{ background: ["transparent", "#a8a29e", "#d97706", "#c2410c"][task.priority] }} />
    </article>
  );
}

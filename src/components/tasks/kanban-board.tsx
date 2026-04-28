"use client";

import { useMemo, useState, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useDroppable,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, X, Trash2, User } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import {
  createTask,
  updateTask,
  moveTask,
  deleteTask,
  type Task,
  type TaskStatus,
  type TaskPriority,
} from "@/lib/actions/tasks";

type Member = { user_id: string; email: string; name: string | null };

const COLUMNS: { id: TaskStatus; title: string; tone: string }[] = [
  { id: "todo", title: "To do", tone: "bg-neutral-100 dark:bg-neutral-800" },
  { id: "in_progress", title: "In progress", tone: "bg-blue-50 dark:bg-blue-950/40" },
  { id: "in_review", title: "In review", tone: "bg-amber-50 dark:bg-amber-950/40" },
  { id: "done", title: "Done", tone: "bg-emerald-50 dark:bg-emerald-950/40" },
];

const PRIORITY_TONE: Record<TaskPriority, string> = {
  low: "text-neutral-500 bg-neutral-100 dark:bg-neutral-800",
  normal: "text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800",
  high: "text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/40",
  urgent: "text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/40",
};

export function KanbanBoard({
  initialTasks,
  members,
}: {
  initialTasks: Task[];
  members: Member[];
}) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);
  const [composerStatus, setComposerStatus] = useState<TaskStatus | null>(null);
  const [, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const memberByUserId = useMemo(() => {
    const m = new Map<string, Member>();
    for (const x of members) m.set(x.user_id, x);
    return m;
  }, [members]);

  const byColumn = useMemo(() => {
    const groups: Record<TaskStatus, Task[]> = {
      todo: [],
      in_progress: [],
      in_review: [],
      done: [],
    };
    for (const t of [...tasks].sort((a, b) => a.position - b.position)) {
      groups[t.status].push(t);
    }
    return groups;
  }, [tasks]);

  function findColumn(id: string): TaskStatus | null {
    if ((COLUMNS as ReadonlyArray<{ id: string }>).some((c) => c.id === id)) return id as TaskStatus;
    return tasks.find((t) => t.id === id)?.status ?? null;
  }

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function onDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const activeColumn = findColumn(String(active.id));
    const overColumn = findColumn(String(over.id));
    if (!activeColumn || !overColumn || activeColumn === overColumn) return;
    setTasks((prev) =>
      prev.map((t) => (t.id === active.id ? { ...t, status: overColumn } : t)),
    );
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const activeTask = tasks.find((t) => t.id === activeId);
    if (!activeTask) return;

    const targetColumn = findColumn(overId);
    if (!targetColumn) return;

    const columnTasks = tasks
      .filter((t) => t.status === targetColumn && t.id !== activeId)
      .sort((a, b) => a.position - b.position);

    let newIndex: number;
    if (overId === targetColumn) {
      newIndex = columnTasks.length;
    } else {
      const overIdx = columnTasks.findIndex((t) => t.id === overId);
      newIndex = overIdx === -1 ? columnTasks.length : overIdx;
    }

    const reordered = [
      ...columnTasks.slice(0, newIndex).map((t, i) => ({ ...t, position: i })),
      { ...activeTask, status: targetColumn, position: newIndex },
      ...columnTasks.slice(newIndex).map((t, i) => ({ ...t, position: newIndex + 1 + i })),
    ];

    setTasks((prev) => {
      const others = prev.filter((t) => t.status !== targetColumn || t.id === activeId).filter(
        (t) => t.id !== activeId,
      );
      const allOthers = prev
        .filter((t) => t.status !== targetColumn)
        .filter((t) => t.id !== activeId);
      void others;
      return [...allOthers, ...reordered];
    });

    startTransition(async () => {
      try {
        await moveTask({ id: activeId, status: targetColumn, position: newIndex });
      } catch (err) {
        console.error("moveTask failed", err);
      }
    });
  }

  async function handleCreate(status: TaskStatus, title: string) {
    if (!title.trim()) return;
    const created = await createTask({ title: title.trim(), status });
    setTasks((prev) => [...prev, created]);
    setComposerStatus(null);
  }

  async function handleSave(patch: {
    id: string;
    title?: string;
    description?: string | null;
    priority?: TaskPriority;
    assignee_user_id?: string | null;
    due_date?: string | null;
  }) {
    const updated = await updateTask(patch);
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    setEditing(null);
  }

  async function handleDelete(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    setEditing(null);
    try {
      await deleteTask({ id });
    } catch (err) {
      console.error("deleteTask failed", err);
    }
  }

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {COLUMNS.map((col) => (
          <Column
            key={col.id}
            id={col.id}
            title={col.title}
            tone={col.tone}
            tasks={byColumn[col.id]}
            members={memberByUserId}
            onAdd={() => setComposerStatus(col.id)}
            onClick={(t) => setEditing(t)}
            composerOpen={composerStatus === col.id}
            onComposerCancel={() => setComposerStatus(null)}
            onComposerSubmit={(title) => handleCreate(col.id, title)}
          />
        ))}
      </div>

      <DragOverlay>
        {activeTask ? <TaskCard task={activeTask} members={memberByUserId} dragging /> : null}
      </DragOverlay>

      {editing && (
        <TaskModal
          task={editing}
          members={members}
          onClose={() => setEditing(null)}
          onSave={handleSave}
          onDelete={() => handleDelete(editing.id)}
        />
      )}
    </DndContext>
  );
}

function Column({
  id,
  title,
  tone,
  tasks,
  members,
  onAdd,
  onClick,
  composerOpen,
  onComposerCancel,
  onComposerSubmit,
}: {
  id: TaskStatus;
  title: string;
  tone: string;
  tasks: Task[];
  members: Map<string, Member>;
  onAdd: () => void;
  onClick: (t: Task) => void;
  composerOpen: boolean;
  onComposerCancel: () => void;
  onComposerSubmit: (title: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const ids = tasks.map((t) => t.id);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-lg border border-neutral-200 dark:border-neutral-800 flex flex-col min-h-[200px]",
        tone,
        isOver && "ring-2 ring-blue-400/40",
      )}
    >
      <div className="px-3 py-2 flex items-center justify-between border-b border-neutral-200/60 dark:border-neutral-700/60">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{title}</span>
          <span className="text-xs text-neutral-500 tabular-nums">{tasks.length}</span>
        </div>
        <button
          onClick={onAdd}
          className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5"
          aria-label={`Add task to ${title}`}
        >
          <Plus className="size-4" />
        </button>
      </div>

      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className="flex-1 p-2 space-y-2">
          {tasks.map((t) => (
            <SortableCard key={t.id} task={t} members={members} onClick={() => onClick(t)} />
          ))}
          {composerOpen && (
            <Composer onCancel={onComposerCancel} onSubmit={onComposerSubmit} />
          )}
          {!composerOpen && tasks.length === 0 && (
            <div className="text-xs text-neutral-400 text-center py-6">
              Drop tasks here
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

function SortableCard({
  task,
  members,
  onClick,
}: {
  task: Task;
  members: Map<string, Member>;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} onClick={onClick}>
      <TaskCard task={task} members={members} />
    </div>
  );
}

function TaskCard({
  task,
  members,
  dragging,
}: {
  task: Task;
  members: Map<string, Member>;
  dragging?: boolean;
}) {
  const assignee = task.assignee_user_id ? members.get(task.assignee_user_id) : null;
  const due = task.due_date ? new Date(task.due_date) : null;
  const overdue = due && task.status !== "done" && due < new Date(new Date().toDateString());

  return (
    <div
      className={cn(
        "p-3 rounded-md bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800",
        "hover:border-neutral-300 dark:hover:border-neutral-700 cursor-pointer transition-colors",
        dragging && "shadow-lg rotate-1",
      )}
    >
      <div className="text-sm font-medium leading-snug">{task.title}</div>
      {task.description && (
        <div className="text-xs text-neutral-500 mt-1 line-clamp-2">{task.description}</div>
      )}
      <div className="flex items-center justify-between mt-2 gap-2">
        <div className="flex items-center gap-1.5">
          {task.priority !== "normal" && (
            <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", PRIORITY_TONE[task.priority])}>
              {task.priority}
            </span>
          )}
          {due && (
            <span
              className={cn(
                "text-[10px] tabular-nums",
                overdue ? "text-red-600 font-medium" : "text-neutral-500",
              )}
            >
              {due.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </span>
          )}
        </div>
        {assignee ? (
          <span
            className="text-[10px] size-5 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 flex items-center justify-center font-medium"
            title={assignee.name || assignee.email}
          >
            {(assignee.name || assignee.email).slice(0, 1).toUpperCase()}
          </span>
        ) : (
          <User className="size-3.5 text-neutral-300 dark:text-neutral-600" />
        )}
      </div>
    </div>
  );
}

function Composer({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (title: string) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(value);
        setValue("");
      }}
      className="p-2 rounded-md bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700"
    >
      <textarea
        autoFocus
        rows={2}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSubmit(value);
            setValue("");
          }
          if (e.key === "Escape") onCancel();
        }}
        placeholder="What needs to be done?"
        className="w-full text-sm bg-transparent outline-none resize-none"
      />
      <div className="flex justify-end gap-2 mt-1">
        <button
          type="button"
          onClick={onCancel}
          className="text-xs px-2 py-1 text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!value.trim()}
          className="text-xs px-2 py-1 rounded bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </form>
  );
}

function TaskModal({
  task,
  members,
  onClose,
  onSave,
  onDelete,
}: {
  task: Task;
  members: Member[];
  onClose: () => void;
  onSave: (p: {
    id: string;
    title?: string;
    description?: string | null;
    priority?: TaskPriority;
    assignee_user_id?: string | null;
    due_date?: string | null;
  }) => Promise<void>;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [assignee, setAssignee] = useState<string>(task.assignee_user_id ?? "");
  const [dueDate, setDueDate] = useState(task.due_date ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await onSave({
        id: task.id,
        title: title.trim() || task.title,
        description: description.trim() ? description.trim() : null,
        priority,
        assignee_user_id: assignee || null,
        due_date: dueDate || null,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-neutral-900 rounded-xl w-full max-w-xl shadow-xl border border-neutral-200 dark:border-neutral-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-neutral-200 dark:border-neutral-800 flex items-start justify-between gap-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="text-lg font-semibold flex-1 bg-transparent outline-none"
          />
          <button onClick={onClose} className="p-1 text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
            <X className="size-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Description</label>
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add details…"
              className="w-full px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Assignee</label>
              <select
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                className="w-full px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm"
              >
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.name || m.email}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Due</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm"
              />
            </div>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
          <button
            onClick={onDelete}
            className="text-xs flex items-center gap-1 text-red-600 hover:text-red-700"
          >
            <Trash2 className="size-3.5" /> Delete
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="text-sm px-3 py-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              Cancel
            </button>
            <button
              disabled={saving}
              onClick={save}
              className="text-sm px-3 py-1.5 rounded-md bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

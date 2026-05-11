import { supabase } from "./supabase";
import type { Task } from "./types";

/**
 * Tasks visible to the signed-in user. Filters to tasks assigned to them
 * specifically — workers shouldn't see the whole team's kanban.
 *
 * The web's tasks system stores the assignee as `assignee_user_id` (auth user)
 * — for workers, that gets set when the owner picks a member-profile dropdown
 * whose `user_id` is now linked.
 */
export async function fetchMyTasks(): Promise<Task[]> {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user.id;
  if (!uid) return [];

  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("assignee_user_id", uid)
    .neq("status", "done")
    .order("priority", { ascending: false })
    .order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Task[];
}

/** All my tasks including done — used by the "Done" tab. */
export async function fetchMyTasksAll(): Promise<Task[]> {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user.id;
  if (!uid) return [];

  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("assignee_user_id", uid)
    .order("status", { ascending: true })
    .order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Task[];
}

export async function setTaskStatus(id: string, status: Task["status"]): Promise<void> {
  const patch: Record<string, unknown> = { status };
  if (status === "done") patch.completed_at = new Date().toISOString();
  else                  patch.completed_at = null;
  const { error } = await supabase.from("tasks").update(patch).eq("id", id);
  if (error) throw error;
}

/** All tasks for the active business — owner/admin view (not just mine). */
export async function fetchAllTasks(businessId: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("business_id", businessId)
    .order("status", { ascending: true })
    .order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Task[];
}

export interface TaskInput {
  title:        string;
  description?: string | null;
  status?:      Task["status"];
  priority?:    Task["priority"];
  due_date?:    string | null;
  assignee_user_id?: string | null;
  tags?:        string[];
}

/** Create a task. business_id is required so RLS scopes correctly. */
export async function createTask(businessId: string, input: TaskInput): Promise<Task> {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user.id;
  if (!uid) throw new Error("Not signed in");

  // Compute next position so the new task lands at the bottom of its column
  const { data: maxRow } = await supabase
    .from("tasks")
    .select("position")
    .eq("business_id", businessId)
    .eq("status", input.status ?? "todo")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = ((maxRow as { position?: number } | null)?.position ?? 0) + 1;

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      business_id:      businessId,
      user_id:          uid,
      title:            input.title.trim(),
      description:      input.description?.trim() || null,
      status:           input.status ?? "todo",
      priority:         input.priority ?? "normal",
      due_date:         input.due_date || null,
      assignee_user_id: input.assignee_user_id ?? uid,
      tags:             input.tags ?? [],
      position,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Task;
}

export async function updateTask(id: string, patch: Partial<TaskInput>): Promise<void> {
  const update: Record<string, unknown> = {};
  if (patch.title       !== undefined) update.title       = patch.title.trim();
  if (patch.description !== undefined) update.description = patch.description?.trim() || null;
  if (patch.status      !== undefined) update.status      = patch.status;
  if (patch.priority    !== undefined) update.priority    = patch.priority;
  if (patch.due_date    !== undefined) update.due_date    = patch.due_date || null;
  if (patch.assignee_user_id !== undefined) update.assignee_user_id = patch.assignee_user_id;
  if (patch.tags        !== undefined) update.tags        = patch.tags;
  const { error } = await supabase.from("tasks").update(update).eq("id", id);
  if (error) throw error;
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw error;
}

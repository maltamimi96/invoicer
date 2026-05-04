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
  const { error } = await supabase.from("tasks").update(patch).eq("id", id);
  if (error) throw error;
}

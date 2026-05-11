"use server";

/**
 * Task (kanban) server actions. Each function is designed AI-tool-first:
 * flat scalar args, narrow effects, return either the affected row(s) or void.
 * The current user's session enforces tenancy via RLS.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getUser } from "@/lib/auth";

export type TaskStatus = "todo" | "in_progress" | "in_review" | "done";
export type TaskPriority = "low" | "normal" | "high" | "urgent";

export type Task = {
  id: string;
  business_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_user_id: string | null;
  due_date: string | null;
  position: number;
  created_by: string;
  completed_at: string | null;
  tags: string[];
  related_work_order_id: string | null;
  related_customer_id: string | null;
  related_contact_id: string | null;
  created_at: string;
  updated_at: string;
};

const STATUSES = ["todo", "in_progress", "in_review", "done"] as const;
const PRIORITIES = ["low", "normal", "high", "urgent"] as const;

async function ctx() {
  const supabase = await createClient();
  const user = await getUser();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const businessId = await getActiveBizId(supabase as any, user.id);
  return { supabase, user, businessId };
}

export async function listTasks(): Promise<Task[]> {
  const { supabase, businessId } = await ctx();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("tasks")
    .select("*")
    .eq("business_id", businessId)
    .order("status", { ascending: true })
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Task[];
}

const createSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(5000).optional().nullable(),
  status: z.enum(STATUSES).default("todo"),
  priority: z.enum(PRIORITIES).default("normal"),
  assignee_user_id: z.string().uuid().optional().nullable(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  related_work_order_id: z.string().uuid().optional().nullable(),
  related_customer_id: z.string().uuid().optional().nullable(),
  related_contact_id: z.string().uuid().optional().nullable(),
});

export async function createTask(input: z.input<typeof createSchema>): Promise<Task> {
  const args = createSchema.parse(input);
  const { supabase, user, businessId } = await ctx();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: maxRow } = await (supabase as any)
    .from("tasks")
    .select("position")
    .eq("business_id", businessId)
    .eq("status", args.status)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextPosition = (maxRow?.position ?? -1) + 1;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("tasks")
    .insert({
      business_id: businessId,
      title: args.title,
      description: args.description ?? null,
      status: args.status,
      priority: args.priority,
      assignee_user_id: args.assignee_user_id ?? null,
      due_date: args.due_date ?? null,
      tags: args.tags ?? [],
      related_work_order_id: args.related_work_order_id ?? null,
      related_customer_id: args.related_customer_id ?? null,
      related_contact_id: args.related_contact_id ?? null,
      position: nextPosition,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/tasks");
  return data as Task;
}

const updateSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(5000).nullable().optional(),
  priority: z.enum(PRIORITIES).optional(),
  assignee_user_id: z.string().uuid().nullable().optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  related_work_order_id: z.string().uuid().nullable().optional(),
  related_customer_id: z.string().uuid().nullable().optional(),
  related_contact_id: z.string().uuid().nullable().optional(),
});

export async function updateTask(input: z.input<typeof updateSchema>): Promise<Task> {
  const args = updateSchema.parse(input);
  const { supabase, businessId } = await ctx();
  const patch: Record<string, unknown> = {};
  for (const k of [
    "title", "description", "priority", "assignee_user_id", "due_date",
    "tags", "related_work_order_id", "related_customer_id", "related_contact_id",
  ] as const) {
    if (args[k] !== undefined) patch[k] = args[k];
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("tasks")
    .update(patch)
    .eq("id", args.id)
    .eq("business_id", businessId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/tasks");
  return data as Task;
}

const moveSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(STATUSES),
  position: z.number().int().min(0),
});

/**
 * Move a task to (status, position). Re-numbers the destination column so the
 * task lands at the requested index; other columns are left alone. Source-column
 * positions are not compacted (gaps are harmless for ordering).
 */
export async function moveTask(input: z.input<typeof moveSchema>): Promise<void> {
  const args = moveSchema.parse(input);
  const { supabase, businessId } = await ctx();

  // Pull all tasks currently in the destination column (excluding the one being moved)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: dest } = await (supabase as any)
    .from("tasks")
    .select("id, position")
    .eq("business_id", businessId)
    .eq("status", args.status)
    .neq("id", args.id)
    .order("position", { ascending: true });

  const ordered = (dest as Array<{ id: string; position: number }>) ?? [];
  const idx = Math.min(args.position, ordered.length);

  // Insert the moved id at idx, then renumber sequentially
  const newOrder = [
    ...ordered.slice(0, idx).map((r) => r.id),
    args.id,
    ...ordered.slice(idx).map((r) => r.id),
  ];

  // Apply via individual updates (small N — one column at a time)
  for (let i = 0; i < newOrder.length; i++) {
    const id = newOrder[i];
    const patch: Record<string, unknown> = { position: i };
    if (id === args.id) patch.status = args.status;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("tasks")
      .update(patch)
      .eq("id", id)
      .eq("business_id", businessId);
    if (error) throw new Error(error.message);
  }

  revalidatePath("/tasks");
}

const assignSchema = z.object({
  id: z.string().uuid(),
  assignee_user_id: z.string().uuid().nullable(),
});

export async function assignTask(input: z.input<typeof assignSchema>): Promise<Task> {
  const args = assignSchema.parse(input);
  return updateTask({ id: args.id, assignee_user_id: args.assignee_user_id });
}

const deleteSchema = z.object({ id: z.string().uuid() });

export async function deleteTask(input: z.input<typeof deleteSchema>): Promise<void> {
  const args = deleteSchema.parse(input);
  const { supabase, businessId } = await ctx();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("tasks")
    .delete()
    .eq("id", args.id)
    .eq("business_id", businessId);
  if (error) throw new Error(error.message);
  revalidatePath("/tasks");
}

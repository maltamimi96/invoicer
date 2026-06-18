"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getUser } from "@/lib/auth";
import { canEdit, type Role } from "@/lib/permissions";
import type { WorkOrderTemplate } from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

async function ctx(requireWrite = true) {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: biz } = await (supabase as any).from("businesses").select("user_id").eq("id", businessId).single();
  let role: Role = "owner";
  if (biz?.user_id !== user.id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: m } = await (supabase as any).from("business_members")
      .select("role").eq("business_id", businessId).eq("user_id", user.id).eq("status", "active").maybeSingle();
    role = (m?.role ?? "viewer") as Role;
  }
  if (requireWrite && !canEdit(role)) throw new Error("Forbidden");
  return { supabase, businessId };
}

function revalidate() {
  revalidatePath("/settings/work-order-templates");
  revalidatePath("/work-orders/new");
}

export async function listWorkOrderTemplates(): Promise<WorkOrderTemplate[]> {
  const { supabase, businessId } = await ctx(false);
  const { data, error } = await tbl(supabase, "work_order_templates").select("*")
    .eq("business_id", businessId).order("sort_order").order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as WorkOrderTemplate[];
}

export async function createWorkOrderTemplate(input: {
  name: string;
  title?: string;
  description?: string;
  scope_of_work?: string;
  worker_notes?: string;
  reported_issue?: string;
  default_duration_minutes?: number | null;
  sort_order?: number;
}): Promise<WorkOrderTemplate> {
  const { supabase, businessId } = await ctx();
  const { data, error } = await tbl(supabase, "work_order_templates").insert({
    business_id: businessId,
    name: input.name.trim(),
    title: input.title?.trim() || null,
    description: input.description?.trim() || null,
    scope_of_work: input.scope_of_work?.trim() || null,
    worker_notes: input.worker_notes?.trim() || null,
    reported_issue: input.reported_issue?.trim() || null,
    default_duration_minutes: input.default_duration_minutes ?? null,
    sort_order: input.sort_order ?? 0,
  }).select("*").single();
  if (error) throw new Error(error.message);
  revalidate();
  return data as WorkOrderTemplate;
}

export async function updateWorkOrderTemplate(id: string, patch: Partial<Omit<WorkOrderTemplate,
  "id" | "business_id" | "created_at" | "updated_at">>): Promise<void> {
  const { supabase, businessId } = await ctx();
  const { error } = await tbl(supabase, "work_order_templates").update(patch).eq("id", id).eq("business_id", businessId);
  if (error) throw new Error(error.message);
  revalidate();
}

export async function deleteWorkOrderTemplate(id: string): Promise<void> {
  const { supabase, businessId } = await ctx();
  await tbl(supabase, "work_order_templates").delete().eq("id", id).eq("business_id", businessId);
  revalidate();
}

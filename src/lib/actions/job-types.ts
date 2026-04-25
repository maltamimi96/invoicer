"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";

export interface ChecklistItem {
  text: string;
  required?: boolean;
}

export interface JobType {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  color: string;
  default_duration_minutes: number;
  default_price: number | null;
  default_checklist: ChecklistItem[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const checklistItemSchema = z.object({
  text: z.string().min(1).max(200),
  required: z.boolean().optional(),
});

const jobTypeInputSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(500).nullish(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#3b82f6"),
  default_duration_minutes: z.number().int().positive().max(60 * 24 * 7).default(60),
  default_price: z.number().nonnegative().nullish(),
  default_checklist: z.array(checklistItemSchema).default([]),
  is_active: z.boolean().default(true),
});

export type JobTypeInput = z.infer<typeof jobTypeInputSchema>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: Awaited<ReturnType<typeof createClient>>, name: string) => (sb as any).from(name);

async function authedBiz() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const businessId = await getActiveBizId(supabase, user.id);
  return { supabase, businessId };
}

export async function listJobTypes(opts?: { includeInactive?: boolean }): Promise<JobType[]> {
  const { supabase, businessId } = await authedBiz();
  let q = tbl(supabase, "job_types")
    .select("*")
    .eq("business_id", businessId)
    .order("name", { ascending: true });
  if (!opts?.includeInactive) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw error;
  return data as JobType[];
}

export async function getJobType(id: string): Promise<JobType> {
  const { supabase, businessId } = await authedBiz();
  const { data, error } = await tbl(supabase, "job_types")
    .select("*")
    .eq("id", id)
    .eq("business_id", businessId)
    .single();
  if (error) throw error;
  return data as JobType;
}

export async function createJobType(input: JobTypeInput): Promise<JobType> {
  const parsed = jobTypeInputSchema.parse(input);
  const { supabase, businessId } = await authedBiz();
  const { data, error } = await tbl(supabase, "job_types")
    .insert({ ...parsed, business_id: businessId })
    .select()
    .single();
  if (error) throw error;
  revalidatePath("/settings/job-types");
  return data as JobType;
}

export async function updateJobType(id: string, input: Partial<JobTypeInput>): Promise<JobType> {
  const parsed = jobTypeInputSchema.partial().parse(input);
  const { supabase, businessId } = await authedBiz();
  const { data, error } = await tbl(supabase, "job_types")
    .update(parsed)
    .eq("id", id)
    .eq("business_id", businessId)
    .select()
    .single();
  if (error) throw error;
  revalidatePath("/settings/job-types");
  return data as JobType;
}

export async function deleteJobType(id: string): Promise<void> {
  const { supabase, businessId } = await authedBiz();
  const { error } = await tbl(supabase, "job_types")
    .delete()
    .eq("id", id)
    .eq("business_id", businessId);
  if (error) throw error;
  revalidatePath("/settings/job-types");
}

// AI tool descriptors — each action exposed as a callable tool for the agent.
// Voice-first rule: every workflow must be invocable from a text/voice prompt.
export const jobTypeTools = {
  list_job_types: {
    description: "List all active job types for the active business.",
    schema: z.object({}),
    run: async () => listJobTypes(),
  },
  create_job_type: {
    description: "Create a new job type (template) with default duration, price, color, and checklist.",
    schema: jobTypeInputSchema,
    run: createJobType,
  },
  update_job_type: {
    description: "Update fields on an existing job type.",
    schema: z.object({ id: z.string().uuid() }).and(jobTypeInputSchema.partial()),
    run: ({ id, ...rest }: { id: string } & Partial<JobTypeInput>) => updateJobType(id, rest),
  },
  delete_job_type: {
    description: "Delete a job type. Existing jobs that referenced it keep their data; the link becomes null.",
    schema: z.object({ id: z.string().uuid() }),
    run: ({ id }: { id: string }) => deleteJobType(id),
  },
} as const;

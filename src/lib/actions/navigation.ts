"use server";

/**
 * Settings → Navigation: rename, reorder and hide sidebar items.
 *
 * Only owners and admins can change it — it's a business-wide change, and an
 * editor renaming "Invoices" would change it for everyone.
 *
 * Expected failures are RETURNED, not thrown: Next masks thrown server-action
 * messages in production, and "something went wrong" is not a validation error.
 */
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getUser } from "@/lib/auth";
import { validateNavConfig, type NavConfig } from "@/lib/nav/config";
import type { Role } from "@/lib/permissions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

/** Owner is derived from businesses.user_id and never stored in members. */
async function callerRole(
  supabase: Awaited<ReturnType<typeof createClient>>, userId: string, businessId: string,
): Promise<Role> {
  const { data: biz } = await tbl(supabase, "businesses").select("user_id").eq("id", businessId).single();
  if (biz?.user_id === userId) return "owner";
  const { data: member } = await tbl(supabase, "business_members")
    .select("role").eq("business_id", businessId).eq("user_id", userId)
    .eq("status", "active").maybeSingle();
  return (member?.role ?? "viewer") as Role;
}

export type NavConfigResult = { ok: true } | { ok: false; error: string };

export async function saveNavConfig(config: NavConfig): Promise<NavConfigResult> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const role = await callerRole(supabase, user.id, businessId);
  if (role !== "owner" && role !== "admin") {
    return { ok: false, error: "Only an owner or admin can change the navigation" };
  }

  const problem = validateNavConfig(config);
  if (problem) return { ok: false, error: problem };

  // Drop labels that match nothing / empty arrays, so an untouched config
  // stores NULL and keeps following the industry preset rather than freezing
  // today's preset values into the row.
  const labels = Object.fromEntries(
    Object.entries(config.labels ?? {}).filter(([, v]) => v.trim().length > 0),
  );
  const clean: NavConfig = {};
  if (Object.keys(labels).length) clean.labels = labels;
  if (config.hidden?.length) clean.hidden = config.hidden;
  if (config.order?.length) clean.order = config.order;
  const value = Object.keys(clean).length ? clean : null;

  const { error } = await tbl(supabase, "businesses")
    .update({ nav_config: value }).eq("id", businessId);
  if (error) return { ok: false, error: error.message };

  // The sidebar is rendered by the dashboard layout, so the whole tree needs
  // revalidating — revalidating one page would leave the old names up.
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function getNavConfig(): Promise<NavConfig | null> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  const { data } = await tbl(supabase, "businesses")
    .select("nav_config").eq("id", businessId).maybeSingle();
  return (data?.nav_config ?? null) as NavConfig | null;
}

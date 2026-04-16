"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveBizId } from "@/lib/active-business";
import { canManageSettings, type Role } from "@/lib/permissions";
import type { BusinessWebhook, WebhookEvent, WebhookDelivery } from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

async function getCallerContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const businessId = await getActiveBizId(supabase, user.id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: biz } = await (supabase as any).from("businesses").select("user_id").eq("id", businessId).single();
  let role: Role = "owner";
  if (biz?.user_id !== user.id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: member } = await (supabase as any)
      .from("business_members")
      .select("role")
      .eq("business_id", businessId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    role = (member?.role ?? "viewer") as Role;
  }

  if (!canManageSettings(role)) throw new Error("Forbidden");
  return { user, businessId };
}

export async function listWebhooks(): Promise<BusinessWebhook[]> {
  const { businessId } = await getCallerContext();
  const sb = createAdminClient();
  const { data, error } = await tbl(sb, "business_webhooks")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });
  if (error) throw new Error("Failed to list webhooks");
  return (data ?? []) as BusinessWebhook[];
}

export async function createWebhook(input: {
  url: string;
  label: string;
  events: WebhookEvent[];
  secret?: string;
}): Promise<BusinessWebhook> {
  const { businessId } = await getCallerContext();

  if (!input.url || !input.label) throw new Error("URL and label are required");
  if (!input.events.length) throw new Error("Select at least one event");

  try { new URL(input.url); } catch { throw new Error("Invalid URL"); }

  const sb = createAdminClient();
  const { data, error } = await tbl(sb, "business_webhooks")
    .insert({
      business_id: businessId,
      url: input.url,
      label: input.label,
      events: input.events,
      secret: input.secret || null,
      enabled: true,
    })
    .select("*")
    .single();

  if (error) throw new Error("Failed to create webhook");
  revalidatePath("/settings");
  return data as BusinessWebhook;
}

export async function updateWebhookEnabled(id: string, enabled: boolean): Promise<void> {
  const { businessId } = await getCallerContext();
  const sb = createAdminClient();
  const { error } = await tbl(sb, "business_webhooks")
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("business_id", businessId);
  if (error) throw new Error("Failed to update webhook");
  revalidatePath("/settings");
}

export async function deleteWebhook(id: string): Promise<void> {
  const { businessId } = await getCallerContext();
  const sb = createAdminClient();
  const { error } = await tbl(sb, "business_webhooks")
    .delete()
    .eq("id", id)
    .eq("business_id", businessId);
  if (error) throw new Error("Failed to delete webhook");
  revalidatePath("/settings");
}

export async function getRecentDeliveries(webhookId: string): Promise<WebhookDelivery[]> {
  const { businessId } = await getCallerContext();

  // Verify webhook belongs to business
  const sb = createAdminClient();
  const { data: wh } = await tbl(sb, "business_webhooks")
    .select("id")
    .eq("id", webhookId)
    .eq("business_id", businessId)
    .single();
  if (!wh) throw new Error("Webhook not found");

  const { data } = await tbl(sb, "webhook_deliveries")
    .select("*")
    .eq("webhook_id", webhookId)
    .order("created_at", { ascending: false })
    .limit(10);

  return (data ?? []) as WebhookDelivery[];
}

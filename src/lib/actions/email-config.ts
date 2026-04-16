"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveBizId } from "@/lib/active-business";
import { canManageSettings, type Role } from "@/lib/permissions";
import { testImapConnection } from "@/lib/email-reader";
import type { BusinessEmailConfig, EmailProvider } from "@/types/database";

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

/**
 * Get email config for the active business. Returns null if not configured.
 * Password is masked for display — only shows last 4 chars.
 */
export async function getEmailConfig(): Promise<(Omit<BusinessEmailConfig, "imap_pass"> & { imap_pass_masked: string }) | null> {
  const { businessId } = await getCallerContext();

  const sb = createAdminClient();
  const { data, error } = await tbl(sb, "business_email_config")
    .select("*")
    .eq("business_id", businessId)
    .maybeSingle();

  if (error || !data) return null;

  const config = data as BusinessEmailConfig;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { imap_pass, ...rest } = config;
  return {
    ...rest,
    imap_pass_masked: imap_pass
      ? "••••••••" + imap_pass.slice(-4)
      : "",
  };
}

/**
 * Save (upsert) email config for the active business.
 * If imap_pass is empty string, keep the existing password.
 */
export async function saveEmailConfig(input: {
  enabled: boolean;
  provider: EmailProvider;
  imap_host: string;
  imap_port: number;
  imap_user: string;
  imap_pass: string; // empty = keep existing
}): Promise<void> {
  const { businessId } = await getCallerContext();

  if (!input.imap_host || !input.imap_user) {
    throw new Error("Host and email are required");
  }

  const sb = createAdminClient();

  // Check if config exists
  const { data: existing } = await tbl(sb, "business_email_config")
    .select("id, imap_pass")
    .eq("business_id", businessId)
    .maybeSingle();

  const password = input.imap_pass || existing?.imap_pass || "";
  if (!password && input.enabled) {
    throw new Error("Password is required to enable email scanning");
  }

  const payload = {
    enabled: input.enabled,
    provider: input.provider,
    imap_host: input.imap_host,
    imap_port: input.imap_port,
    imap_user: input.imap_user,
    imap_pass: password,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { error } = await tbl(sb, "business_email_config")
      .update(payload)
      .eq("id", existing.id);
    if (error) throw new Error("Failed to save email config");
  } else {
    const { error } = await tbl(sb, "business_email_config")
      .insert({ ...payload, business_id: businessId });
    if (error) throw new Error("Failed to save email config");
  }

  revalidatePath("/settings");
}

/**
 * Test IMAP connection with provided credentials.
 * If password is empty, uses the stored password.
 */
export async function testEmailConnectionAction(input: {
  imap_host: string;
  imap_port: number;
  imap_user: string;
  imap_pass: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { businessId } = await getCallerContext();

  let password = input.imap_pass;
  if (!password) {
    // Try stored password
    const sb = createAdminClient();
    const { data } = await tbl(sb, "business_email_config")
      .select("imap_pass")
      .eq("business_id", businessId)
      .maybeSingle();
    password = data?.imap_pass || "";
  }

  if (!password) {
    return { ok: false, error: "Password is required" };
  }

  return testImapConnection({
    host: input.imap_host,
    port: input.imap_port,
    user: input.imap_user,
    pass: password,
  });
}

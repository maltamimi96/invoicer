"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";
import { getActiveBizId } from "@/lib/active-business";
import { canManageSettings, type Role } from "@/lib/permissions";
import { encryptSecret, decryptSecret, encryptionAvailable } from "@/lib/crypto";
import { revolutKeyWorks, type RevolutMode } from "@/lib/revolut";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: Awaited<ReturnType<typeof createClient>>, name: string) => (sb as any).from(name);

async function resolveRole(
  supabase: Awaited<ReturnType<typeof createClient>>, userId: string, businessId: string,
): Promise<Role> {
  const { data: owned } = await tbl(supabase, "businesses").select("user_id").eq("id", businessId).maybeSingle();
  if (owned?.user_id === userId) return "owner";
  const { data: m } = await tbl(supabase, "business_members")
    .select("role").eq("business_id", businessId).eq("user_id", userId).eq("status", "active").maybeSingle();
  return (m?.role as Role) ?? "viewer";
}

export interface RevolutStatus {
  enabled: boolean;
  mode: RevolutMode;
  hasSecret: boolean;
  hasWebhookSecret: boolean;
  encryptionReady: boolean;
}

export async function getRevolutStatus(): Promise<RevolutStatus> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const { data: biz } = await tbl(supabase, "businesses")
    .select("revolut_enabled, revolut_mode, revolut_secret_enc, revolut_webhook_secret_enc")
    .eq("id", businessId)
    .single();

  return {
    enabled: !!biz?.revolut_enabled,
    mode: (biz?.revolut_mode as RevolutMode) ?? "sandbox",
    hasSecret: !!biz?.revolut_secret_enc,
    hasWebhookSecret: !!biz?.revolut_webhook_secret_enc,
    encryptionReady: encryptionAvailable(),
  };
}

/**
 * Save Revolut credentials. Secrets are encrypted at rest and never returned to
 * the client. An empty/undefined secret keeps the stored one (so the user isn't
 * forced to re-enter it on every edit).
 */
export async function saveRevolutCredentials(input: {
  secret?: string;
  webhookSecret?: string;
  mode: RevolutMode;
  enabled: boolean;
}): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  const role = await resolveRole(supabase, user.id, businessId);
  if (!canManageSettings(role)) throw new Error("Only owners and admins can manage Revolut settings.");

  const secret = input.secret?.trim();
  const webhookSecret = input.webhookSecret?.trim();

  if ((secret || webhookSecret) && !encryptionAvailable()) {
    throw new Error("Credential storage needs APP_ENCRYPTION_KEY set on the server.");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: Record<string, any> = {
    revolut_mode: input.mode === "live" ? "live" : "sandbox",
    revolut_enabled: input.enabled,
  };
  if (secret) update.revolut_secret_enc = encryptSecret(secret);
  if (webhookSecret) update.revolut_webhook_secret_enc = encryptSecret(webhookSecret);

  const { error } = await tbl(supabase, "businesses").update(update).eq("id", businessId);
  if (error) throw error;

  revalidatePath("/settings");
}

export async function disconnectRevolut(): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  const role = await resolveRole(supabase, user.id, businessId);
  if (!canManageSettings(role)) throw new Error("Only owners and admins can manage Revolut settings.");

  await tbl(supabase, "businesses").update({
    revolut_secret_enc: null,
    revolut_webhook_secret_enc: null,
    revolut_enabled: false,
  }).eq("id", businessId);

  revalidatePath("/settings");
}

/** Validate the stored key against Revolut (used by the "Test connection" button). */
export async function testRevolutConnection(): Promise<{ ok: boolean; message: string }> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const { data: biz } = await tbl(supabase, "businesses")
    .select("revolut_secret_enc, revolut_mode").eq("id", businessId).single();
  if (!biz?.revolut_secret_enc) return { ok: false, message: "No Revolut key saved yet." };

  try {
    const secret = decryptSecret(biz.revolut_secret_enc);
    const ok = await revolutKeyWorks(secret, (biz.revolut_mode as RevolutMode) ?? "sandbox");
    return ok
      ? { ok: true, message: `Connected to Revolut (${biz.revolut_mode ?? "sandbox"}).` }
      : { ok: false, message: "Revolut rejected the key — check it's the Merchant Secret key for the right mode." };
  } catch {
    return { ok: false, message: "Couldn't read the stored key (encryption key changed?)." };
  }
}

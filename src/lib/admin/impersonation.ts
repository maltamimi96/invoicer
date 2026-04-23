/**
 * Impersonation helpers.
 *
 * Impersonation does NOT swap the auth session. Instead, we set two signed
 * cookies: active_business_id (overrides the normal active business selector)
 * and admin_impersonation_id (the session row). When admin_impersonation_id
 * is set, the dashboard renders a top banner; tenant writes are blocked
 * unless the operator explicitly escalated the session to read_only=false.
 *
 * This keeps the operator's identity on every server-side log line, and
 * preserves a clean audit trail ("operator X acted as business Y").
 */

import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "./audit";
import type { Operator } from "./auth";

const IMP_COOKIE = "admin_impersonation_id";
const BIZ_COOKIE = "active_business_id";

export type ImpersonationSession = {
  id: string;
  operator_id: string;
  target_business_id: string;
  target_user_id: string | null;
  read_only: boolean;
  started_at: string;
  expires_at: string;
};

export async function startImpersonation(
  operator: Operator,
  targetBusinessId: string,
  opts: { reason?: string; readOnly?: boolean } = {},
): Promise<ImpersonationSession> {
  const admin = createAdminClient();

  // End any existing active session for this operator first.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any)
    .from("admin_impersonation_sessions")
    .update({ ended_at: new Date().toISOString() })
    .is("ended_at", null)
    .eq("operator_user_id", operator.user_id);

  // Pick the business owner as the effective target user (for audit context).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: biz } = await (admin as any)
    .from("businesses")
    .select("user_id")
    .eq("id", targetBusinessId)
    .single();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("admin_impersonation_sessions")
    .insert({
      operator_id: operator.id,
      operator_user_id: operator.user_id,
      target_business_id: targetBusinessId,
      target_user_id: biz?.user_id ?? null,
      reason: opts.reason ?? null,
      read_only: opts.readOnly ?? true,
    })
    .select()
    .single();

  if (error || !data) throw new Error(`Failed to start impersonation: ${error?.message}`);

  const session: ImpersonationSession = data;
  const jar = await cookies();
  jar.set(IMP_COOKIE, session.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 30 * 60, // 30 min, matches DB default
  });
  jar.set(BIZ_COOKIE, targetBusinessId, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 30 * 60,
  });

  await logAdminAction({
    operator,
    action: "impersonation.start",
    targetType: "business",
    targetId: targetBusinessId,
    targetBusinessId,
    metadata: { reason: opts.reason, read_only: session.read_only },
  });

  return session;
}

export async function stopImpersonation(operator: Operator): Promise<void> {
  const jar = await cookies();
  const id = jar.get(IMP_COOKIE)?.value;
  if (!id) return;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any)
    .from("admin_impersonation_sessions")
    .update({ ended_at: new Date().toISOString() })
    .eq("id", id);

  jar.delete(IMP_COOKIE);
  jar.delete(BIZ_COOKIE);

  await logAdminAction({
    operator,
    action: "impersonation.stop",
    targetType: "impersonation_session",
    targetId: id,
  });
}

/**
 * Read the active impersonation from cookies. Returns null if cookie missing,
 * expired, or already ended. Used by the dashboard shell to render a banner.
 */
export async function getActiveImpersonation(): Promise<ImpersonationSession | null> {
  const jar = await cookies();
  const id = jar.get(IMP_COOKIE)?.value;
  if (!id) return null;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (admin as any)
    .from("admin_impersonation_sessions")
    .select("*")
    .eq("id", id)
    .single();

  if (!data || data.ended_at) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;

  return data as ImpersonationSession;
}

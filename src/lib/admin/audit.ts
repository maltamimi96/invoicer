/**
 * Admin audit logging. Every admin mutation should call logAdminAction().
 */

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Operator } from "./auth";

export type AdminAction =
  | "operator.invite"
  | "operator.revoke"
  | "operator.role_change"
  | "tenant.view"
  | "tenant.extend_trial"
  | "tenant.change_plan"
  | "tenant.disable"
  | "tenant.enable"
  | "tenant.delete"
  | "tenant.resend_welcome"
  | "impersonation.start"
  | "impersonation.stop"
  | "impersonation.escalate_write"
  | "billing.refund"
  | "billing.apply_credit";

export type LogArgs = {
  operator: Operator;
  action: AdminAction;
  targetType?: string;
  targetId?: string;
  targetBusinessId?: string;
  metadata?: Record<string, unknown>;
};

export async function logAdminAction(args: LogArgs): Promise<void> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  const ua = h.get("user-agent") || null;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any).from("admin_audit_log").insert({
    operator_id: args.operator.id,
    operator_user_id: args.operator.user_id,
    action: args.action,
    target_type: args.targetType ?? null,
    target_id: args.targetId ?? null,
    target_business_id: args.targetBusinessId ?? null,
    metadata: args.metadata ?? {},
    ip_address: ip,
    user_agent: ua,
  });
}

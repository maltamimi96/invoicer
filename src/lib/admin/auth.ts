/**
 * Admin-side auth helpers. Used by every /admin page and server action.
 *
 * requireAdmin() — must be the first call in any admin server component or
 * action. Throws a redirect() if the caller isn't a logged-in operator.
 *
 * requireAdminRole(roles) — additionally asserts the operator has one of the
 * given roles. Use on sensitive routes.
 *
 * All admin data reads in this file use the service-role client to bypass
 * tenant RLS — BUT the operator identity is verified against the regular
 * session cookie first. Never call createAdminClient() before calling
 * requireAdmin().
 */

import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type AdminRole = "superadmin" | "billing" | "support" | "read_only";

export type Operator = {
  id: string;
  user_id: string;
  email: string;
  role: AdminRole;
  display_name: string | null;
};

/**
 * Returns the operator for the current session, or null.
 * Does NOT redirect — use for optional checks (e.g. showing a nav link).
 */
export const getOperator = cache(async (): Promise<Operator | null> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("admin_operators")
    .select("id, user_id, role, display_name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data) return null;

  // Update last_seen (fire and forget)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  void (admin as any)
    .from("admin_operators")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", data.id);

  return {
    id: data.id,
    user_id: data.user_id,
    email: user.email ?? "",
    role: data.role as AdminRole,
    display_name: data.display_name,
  };
});

/**
 * Enforce that the caller is an operator. Redirects to /auth/login if not
 * signed in, or to /dashboard (no 404 leak) if signed in but not an operator.
 */
export async function requireAdmin(): Promise<Operator> {
  const op = await getOperator();
  if (!op) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/auth/login?next=/admin");
    // Signed in but not an admin — bounce to tenant dashboard.
    // Deliberately no flash of /admin UI.
    redirect("/dashboard");
  }
  return op;
}

export async function requireAdminRole(allowed: AdminRole[]): Promise<Operator> {
  const op = await requireAdmin();
  if (!allowed.includes(op.role)) {
    throw new Error(`Forbidden: role ${op.role} is not permitted here`);
  }
  return op;
}

/**
 * Roles that can write (mutate tenants, manage operators, extend trials).
 * read_only sees everything but can do nothing.
 */
export function canWrite(role: AdminRole): boolean {
  return role === "superadmin" || role === "billing" || role === "support";
}

export function canManageOperators(role: AdminRole): boolean {
  return role === "superadmin";
}

export function canManageBilling(role: AdminRole): boolean {
  return role === "superadmin" || role === "billing";
}

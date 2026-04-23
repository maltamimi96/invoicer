"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  requireAdmin,
  requireAdminRole,
  canManageOperators,
} from "@/lib/admin/auth";
import { logAdminAction } from "@/lib/admin/audit";
import {
  startImpersonation,
  stopImpersonation,
} from "@/lib/admin/impersonation";

// ------------------------------------------------------------------
// Impersonation
// ------------------------------------------------------------------

export async function startImpersonationAction(formData: FormData) {
  const operator = await requireAdmin();
  const businessId = z.string().uuid().parse(formData.get("business_id"));
  const reason = (formData.get("reason") as string | null) || undefined;

  await startImpersonation(operator, businessId, { reason, readOnly: true });
  revalidatePath("/admin", "layout");
  redirect("/dashboard");
}

export async function stopImpersonationAction() {
  const operator = await requireAdmin();
  await stopImpersonation(operator);
  revalidatePath("/admin", "layout");
}

// ------------------------------------------------------------------
// Operator management (superadmin only)
// ------------------------------------------------------------------

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["superadmin", "billing", "support", "read_only"]),
  display_name: z.string().optional(),
});

export async function inviteOperatorAction(formData: FormData) {
  const operator = await requireAdminRole(["superadmin"]);
  const parsed = inviteSchema.parse({
    email: formData.get("email"),
    role: formData.get("role"),
    display_name: formData.get("display_name") || undefined,
  });

  const admin = createAdminClient();

  // Find the user by email (they must already have a Supabase account).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: users } = await (admin as any).auth.admin.listUsers({ page: 1, perPage: 1000 });
  const found = users?.users?.find((u: { email?: string }) => u.email?.toLowerCase() === parsed.email.toLowerCase());
  if (!found) {
    throw new Error(`No Supabase user with email ${parsed.email}. Ask them to sign up first.`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any)
    .from("admin_operators")
    .insert({
      user_id: found.id,
      role: parsed.role,
      display_name: parsed.display_name ?? null,
      created_by: operator.user_id,
    });

  if (error) {
    if (error.code === "23505") throw new Error("That user is already an operator.");
    throw new Error(error.message);
  }

  await logAdminAction({
    operator,
    action: "operator.invite",
    targetType: "user",
    targetId: found.id,
    metadata: { email: parsed.email, role: parsed.role },
  });

  revalidatePath("/admin/operators");
}

export async function revokeOperatorAction(formData: FormData) {
  const operator = await requireAdminRole(["superadmin"]);
  const operatorId = z.string().uuid().parse(formData.get("operator_id"));

  if (operatorId === operator.id) {
    throw new Error("You can't revoke your own access.");
  }

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: target } = await (admin as any)
    .from("admin_operators")
    .select("user_id, role")
    .eq("id", operatorId)
    .single();

  if (!target) throw new Error("Operator not found.");

  // Don't allow removing the last superadmin.
  if (target.role === "superadmin") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count } = await (admin as any)
      .from("admin_operators")
      .select("*", { count: "exact", head: true })
      .eq("role", "superadmin");
    if ((count ?? 0) <= 1) throw new Error("Cannot remove the last superadmin.");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any).from("admin_operators").delete().eq("id", operatorId);

  await logAdminAction({
    operator,
    action: "operator.revoke",
    targetType: "user",
    targetId: target.user_id,
    metadata: { role: target.role },
  });

  revalidatePath("/admin/operators");
}

export async function changeOperatorRoleAction(formData: FormData) {
  const operator = await requireAdminRole(["superadmin"]);
  const operatorId = z.string().uuid().parse(formData.get("operator_id"));
  const role = z.enum(["superadmin", "billing", "support", "read_only"]).parse(formData.get("role"));

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: before } = await (admin as any)
    .from("admin_operators")
    .select("role")
    .eq("id", operatorId)
    .single();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any).from("admin_operators").update({ role }).eq("id", operatorId);

  await logAdminAction({
    operator,
    action: "operator.role_change",
    targetType: "admin_operator",
    targetId: operatorId,
    metadata: { from: before?.role, to: role },
  });

  revalidatePath("/admin/operators");
}

// ------------------------------------------------------------------
// Bootstrap — only works when no operators exist yet.
// ------------------------------------------------------------------

export async function bootstrapFirstOperatorAction(formData: FormData) {
  void formData; // reserved for future use
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count } = await (admin as any)
    .from("admin_operators")
    .select("*", { count: "exact", head: true });

  if ((count ?? 0) > 0) {
    throw new Error("Admin is already bootstrapped.");
  }

  // The caller is whoever is currently logged in.
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/admin");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any).from("admin_operators").insert({
    user_id: user.id,
    role: "superadmin",
    display_name: user.email,
    created_by: user.id,
  });

  redirect("/admin");
}

// Silence unused-import warnings where helpers are re-exported conditionally.
void canManageOperators;

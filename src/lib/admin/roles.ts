/**
 * Pure role-type + permission helpers. No server-only imports — safe to use
 * from client components.
 */

export type AdminRole = "superadmin" | "billing" | "support" | "read_only";

export type Operator = {
  id: string;
  user_id: string;
  email: string;
  role: AdminRole;
  display_name: string | null;
};

export function canWrite(role: AdminRole): boolean {
  return role === "superadmin" || role === "billing" || role === "support";
}

export function canManageOperators(role: AdminRole): boolean {
  return role === "superadmin";
}

export function canManageBilling(role: AdminRole): boolean {
  return role === "superadmin" || role === "billing";
}

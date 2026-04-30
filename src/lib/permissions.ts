import type { MemberRole } from "@/types/database";

// The full role set — 'owner' is derived from businesses.user_id, never stored in business_members
export type Role = 'owner' | MemberRole;

export function canEdit(role: Role): boolean {
  return role === 'owner' || role === 'admin' || role === 'editor';
}

export function canManageTeam(role: Role): boolean {
  return role === 'owner' || role === 'admin';
}

export function canManageSettings(role: Role): boolean {
  return role === 'owner' || role === 'admin';
}

export function isOwner(role: Role): boolean {
  return role === 'owner';
}

export function isWorker(role: Role): boolean {
  return role === 'worker';
}

/** Tables/pages a worker should never see (financials, customers, leads, etc.). */
export function canSeeFinancials(role: Role): boolean {
  return role !== 'worker';
}

/** Routes the sidebar should hide and pages should redirect away from for workers. */
export const WORKER_ALLOWED_PATHS = [
  "/dashboard",
  "/work-orders",
  "/schedule",
  "/help",
  "/settings/profile",
] as const;

export function isPathAllowedForWorker(path: string): boolean {
  return WORKER_ALLOWED_PATHS.some((p) => path === p || path.startsWith(p + "/") || path.startsWith(p + "?"));
}

export const ROLE_LABELS: Record<Role, string> = {
  owner:  'Owner',
  admin:  'Admin',
  editor: 'Editor',
  viewer: 'Viewer',
  worker: 'Worker',
};

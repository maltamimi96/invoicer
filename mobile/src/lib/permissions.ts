/**
 * MIRROR of src/lib/permissions.ts in the web app. Keep these in sync —
 * the policy in CLAUDE.md / docs/MOBILE_PARITY_PLAN.md requires it.
 */

export type MemberRole = 'admin' | 'editor' | 'viewer' | 'worker';
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

/** Tabs/pages a worker should never see. */
export function canSeeFinancials(role: Role): boolean {
  return role !== 'worker';
}

export const ROLE_LABELS: Record<Role, string> = {
  owner:  'Owner',
  admin:  'Admin',
  editor: 'Editor',
  viewer: 'Viewer',
  worker: 'Worker',
};

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

/** Workers can capture from-site job data (photos/time/materials/notes) on
 *  their assigned jobs. Viewers stay read-only. */
export function canCaptureJobData(role: Role): boolean {
  return role === 'owner' || role === 'admin' || role === 'editor' || role === 'worker';
}

/** Top-level route segments a worker must NEVER reach. The tab bar hides the
 *  admin areas, but this guards deep links + programmatic navigation too —
 *  a worker is hard-isolated to their jobs + tasks. */
export const WORKER_BLOCKED_SEGMENTS = [
  'invoices', 'leads', 'customers', 'quotes', 'products', 'reports',
  'recurring', 'team', 'analytics', 'agents', 'agent', 'assistant', 'messages',
] as const;

/** True if a worker should be bounced off this route. `segments` is expo-router's
 *  useSegments() output (e.g. ['invoices'] or ['settings','bank']). */
export function isRouteBlockedForWorker(segments: string[]): boolean {
  const top = segments[0];
  if (!top) return false;
  if ((WORKER_BLOCKED_SEGMENTS as readonly string[]).includes(top)) return true;
  // Settings: only the appearance (theme) screen is allowed for workers.
  if (top === 'settings' && segments[1] && segments[1] !== 'appearance') return true;
  return false;
}

export const ROLE_LABELS: Record<Role, string> = {
  owner:  'Owner',
  admin:  'Admin',
  editor: 'Editor',
  viewer: 'Viewer',
  worker: 'Worker',
};

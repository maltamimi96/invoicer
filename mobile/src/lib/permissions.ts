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
 *  a worker is hard-isolated to their own jobs. */
export const WORKER_BLOCKED_SEGMENTS = [
  'invoices', 'leads', 'customers', 'quotes', 'products', 'reports',
  'recurring', 'team', 'analytics', 'agents', 'agent', 'assistant', 'messages',
  // Every settings screen. Workers no longer have a Profile tab to reach these
  // from, and a route you can only arrive at by accident is worse than one that
  // doesn't exist. Dark mode still follows the OS, so nothing is lost.
  'settings',
] as const;

/** Tab routes a worker must not land on. These are NOT caught by the top-level
 *  list because expo-router reports them as ['(tabs)', 'tasks'] — segments[0]
 *  is the group, not the screen. `href: null` removes them from the bar, but
 *  programmatic navigation and restored deep links still resolve. */
export const WORKER_BLOCKED_TABS = ['tasks', 'sales', 'profile'] as const;

/** True if a worker should be bounced off this route. `segments` is expo-router's
 *  useSegments() output — e.g. ['invoices'], ['settings','bank'],
 *  ['(tabs)','tasks']. */
export function isRouteBlockedForWorker(segments: string[]): boolean {
  const top = segments[0];
  if (!top) return false;

  if ((WORKER_BLOCKED_SEGMENTS as readonly string[]).includes(top)) return true;

  // Hidden tabs: the group is segments[0], the screen is segments[1].
  if (top === '(tabs)' && segments[1]
      && (WORKER_BLOCKED_TABS as readonly string[]).includes(segments[1])) {
    return true;
  }

  return false;
}

export const ROLE_LABELS: Record<Role, string> = {
  owner:  'Owner',
  admin:  'Admin',
  editor: 'Editor',
  viewer: 'Viewer',
  worker: 'Worker',
};

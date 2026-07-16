"use server";

import { getMyRoleCached } from "@/lib/role";
import type { Role } from "@/lib/permissions";

/** Resolve the caller's role in the active business. Thin "use server"
 *  delegate — the implementation (React-cache()d, parallel lookups) lives in
 *  src/lib/role.ts so the layout + pages share one resolution per request. */
export async function getMyRole(): Promise<Role> {
  return getMyRoleCached();
}

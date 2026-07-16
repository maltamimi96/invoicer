/**
 * Translate a member's role into the API scopes the assistant may use.
 *
 * ⚠️ This is a real security boundary, not a formality.
 *
 * The shared tool registry runs against the **admin Supabase client**, which
 * bypasses RLS and is scoped only by a manually-passed business_id (see
 * lib/mcp/context.ts). Everywhere else in Kirei, RLS is the only gate; on this
 * path the gate is this file. Two rules follow:
 *
 *  1. Never hand the assistant a blanket "admin" scope just because the tools
 *     accept one. Scopes must track what the person is actually allowed to do.
 *  2. Workers get nothing. The worker role is enforced *in the database* via
 *     is_business_worker() / my_member_profile_ids() — precisely the layer the
 *     admin client steps around. A worker with assistant access could read
 *     every customer and invoice in the business, which is the exact isolation
 *     the schema exists to guarantee.
 */

import { ALL_API_SCOPES, type ApiScope } from "@/types/database";
import type { Role } from "@/lib/permissions";

const EVERY_SCOPE = ALL_API_SCOPES.map((s) => s.value).filter((s) => s !== "admin");

const READ_SCOPES = EVERY_SCOPE.filter((s) => s.endsWith(":read"));
const WRITE_SCOPES = EVERY_SCOPE.filter((s) => s.endsWith(":write"));

/**
 * Scopes for a role, or `null` if the role may not use the assistant at all.
 * `null` is deliberately distinct from `[]` — "denied" and "granted nothing"
 * should not be conflated by callers.
 */
export function assistantScopesForRole(role: Role): ApiScope[] | null {
  switch (role) {
    case "worker":
      // See the note above: RLS-enforced isolation, admin client bypasses it.
      return null;

    case "owner":
    case "admin":
      return ["admin"];

    case "editor":
      // Everything except changing the business's own configuration.
      return [
        ...READ_SCOPES,
        ...WRITE_SCOPES.filter((s) => s !== "settings:write"),
        "email:send",
        "agent:access",
      ];

    case "viewer":
      return [...READ_SCOPES, "agent:access"];

    default: {
      // Fail closed on an unrecognised role rather than defaulting to access.
      // Mirrors mobile's fetchRoleForBusiness, which returns the most
      // restricted role on an unknown value instead of the least.
      const _exhaustive: never = role;
      void _exhaustive;
      return null;
    }
  }
}

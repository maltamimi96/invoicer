import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * Request-scoped cached user lookup.
 *
 * `supabase.auth.getUser()` hits GoTrue over the network — it's not a free
 * cookie read. Every server action / page that called it independently was
 * stacking the same round-trip 5-10× per request. React's `cache()` dedupes
 * inside the same React render scope (server-only).
 *
 * There is exactly ONE memoized fetch (`getUserOrNull`) — `getUser` is a thin
 * throwing wrapper over it, so a layout using getUserOrNull and a page using
 * getUser share a single GoTrue round trip per request instead of two.
 */

/** Returns the user or null. Use in server components that need to handle
 *  anonymous visitors gracefully. */
export const getUserOrNull = cache(async () => {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  return user;
});

/** Throws if there is no user — pages/actions should redirect or catch. */
export async function getUser() {
  const user = await getUserOrNull();
  if (!user) throw new Error("Unauthorized");
  return user;
}

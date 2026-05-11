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
 * Throws if there is no user — pages/actions should redirect or catch.
 */
export const getUser = cache(async () => {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  return user;
});

/** Variant that returns null instead of throwing. Use in server components
 *  that need to handle anonymous visitors gracefully. */
export const getUserOrNull = cache(async () => {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  return user;
});

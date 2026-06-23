import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

// NEXT_PUBLIC_* vars are inlined at build time. If a deployment environment
// (e.g. Preview) is missing them, @supabase/ssr throws "URL and API key are
// required" while statically prerendering any client page that constructs a
// client — failing the whole build. Fall back to harmless placeholders so
// construction never throws during prerender; real values are present wherever
// the env is configured (production + any env with the vars set). At runtime a
// genuinely missing var surfaces as a failed request, not a build crash.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function createClient() {
  if ((!SUPABASE_URL || !SUPABASE_ANON_KEY) && typeof window !== "undefined") {
    // Only warn in the browser — during prerender this is expected when an env
    // is intentionally not configured (e.g. preview deploys without the vars).
    console.warn(
      "[supabase] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set — Supabase requests will fail. Configure them for this environment."
    );
  }
  return createBrowserClient<Database>(
    SUPABASE_URL || "https://placeholder.supabase.co",
    SUPABASE_ANON_KEY || "placeholder-anon-key"
  );
}

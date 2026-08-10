import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Where a Supabase email link lands.
 *
 * Two things this used to get wrong:
 *
 *  1. It ignored `?error=` entirely. Supabase sends the reason for a failed
 *     recovery link; we discarded it and said "Could not authenticate", which
 *     tells the user nothing and told us nothing either.
 *  2. It reported every failure identically, so an expired link and a genuine
 *     exchange failure were indistinguishable in the logs.
 *
 * Note the errors Supabase puts in the URL FRAGMENT never reach here at all —
 * fragments aren't sent to servers. AuthErrorNotice reads those client-side.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  // Supabase said no before we even got a code — forward its reason verbatim
  // so the user reads something true.
  const providerError = searchParams.get("error");
  if (providerError) {
    const to = new URL("/auth/login", origin);
    to.searchParams.set("error", providerError);
    const code2 = searchParams.get("error_code");
    const desc = searchParams.get("error_description");
    if (code2) to.searchParams.set("error_code", code2);
    if (desc) to.searchParams.set("error_description", desc);
    console.error("[auth/callback] provider error", { providerError, code2, desc });
    return NextResponse.redirect(to);
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);

    // Nearly always one of: link already used, link expired, or the PKCE
    // verifier cookie is missing because the link was opened in a different
    // browser from the one that requested it.
    console.error("[auth/callback] exchange failed:", error.message);
    const to = new URL("/auth/login", origin);
    to.searchParams.set("error", "access_denied");
    to.searchParams.set("error_description", error.message);
    return NextResponse.redirect(to);
  }

  const to = new URL("/auth/login", origin);
  to.searchParams.set("error", "missing_code");
  to.searchParams.set("error_description", "That link didn't carry a sign-in code.");
  return NextResponse.redirect(to);
}

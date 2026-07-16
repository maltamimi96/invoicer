import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserOrNull } from "@/lib/auth";
import { getActiveBizId } from "@/lib/active-business";
import { appUrl } from "@/lib/app-url";
import {
  githubAppConfigured, verifyState, signState, listInstallationRepos,
} from "@/lib/seo/github-app";

/**
 * GitHub App Setup URL — where GitHub sends the user's browser after they pick
 * which repos to grant. Deliberately NOT in the middleware public whitelist:
 * the user is logged in, so cookie auth applies (same shape as the Stripe
 * connect return route).
 *
 * GitHub appends: ?installation_id=…&setup_action=install|update&state=<ours>
 *
 * One granted repo → connect it and land back done (the one-click case).
 * Several → hand the browser a re-signed state and let the UI show a picker.
 */
function back(siteId: string | null, params: string): NextResponse {
  const base = appUrl() || "https://www.kireihq.com";
  const path = siteId ? `/seo/${siteId}` : "/seo";
  return NextResponse.redirect(new URL(`${path}?tab=connections&${params}`, base));
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const installationId = searchParams.get("installation_id");
  const rawState = searchParams.get("state");

  if (!githubAppConfigured()) return back(null, "github=unconfigured");

  // State proves this callback belongs to a flow *we* started, and carries the
  // site through GitHub (which has no idea what a Kirei site is).
  const state = verifyState(rawState);
  if (!state) return back(null, "github=expired");

  const user = await getUserOrNull();
  if (!user || user.id !== state.u) return back(state.s, "github=auth");
  if (!installationId) return back(state.s, "github=cancelled");

  try {
    const supabase = await createClient();
    const businessId = await getActiveBizId(supabase, user.id);

    // Re-check the site is still in the caller's active business — the cookie
    // could have switched businesses mid-flow.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: site } = await (supabase as any)
      .from("seo_sites").select("id").eq("id", state.s).eq("business_id", businessId).maybeSingle();
    if (!site) return back(null, "github=site");

    const repos = await listInstallationRepos(installationId);
    if (repos.length === 0) return back(state.s, "github=norepos");

    // Carry the installation forward in a freshly signed state so the follow-up
    // server action can trust it without us persisting anything half-done.
    const token = signState({ u: user.id, s: state.s, i: installationId });

    if (repos.length === 1) {
      // The common case: they granted exactly the repo they want → one click.
      const { finalizeGithubConnection } = await import("@/lib/actions/seo-connections");
      await finalizeGithubConnection({ token, repo: repos[0].full_name });
      return back(state.s, "github=connected");
    }

    return back(state.s, `github=pick&gh=${encodeURIComponent(token)}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "GitHub connect failed";
    return back(state.s, `github=error&msg=${encodeURIComponent(msg.slice(0, 140))}`);
  }
}

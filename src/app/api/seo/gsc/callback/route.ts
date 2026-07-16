import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserOrNull } from "@/lib/auth";
import { getActiveBizId } from "@/lib/active-business";
import { appUrl } from "@/lib/app-url";
import { verifyState, signState } from "@/lib/seo/connect-state";
import { gscConfigured, exchangeCode, listProperties, guessProperty } from "@/lib/seo/gsc";

/**
 * Google OAuth redirect URI — where Google sends the user back after consent.
 * Same shape as the GitHub App callback: NOT middleware-whitelisted, because
 * the user is logged in and cookie auth is exactly what we want here.
 *
 * Google appends: ?code=…&state=<ours>&scope=… (or ?error=access_denied)
 *
 * One property → connect it and land back done. Several → hand the browser a
 * re-signed state carrying the refresh token and let the UI show a picker.
 */
function back(siteId: string | null, params: string): NextResponse {
  const base = appUrl() || "https://www.kireihq.com";
  const path = siteId ? `/seo/${siteId}` : "/seo";
  return NextResponse.redirect(new URL(`${path}?tab=connections&${params}`, base));
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const rawState = searchParams.get("state");
  const oauthError = searchParams.get("error");

  if (!gscConfigured()) return back(null, "gsc=unconfigured");

  const state = verifyState(rawState);
  if (!state) return back(null, "gsc=expired");

  const user = await getUserOrNull();
  if (!user || user.id !== state.u) return back(state.s, "gsc=auth");
  if (oauthError || !code) return back(state.s, "gsc=cancelled");

  try {
    const supabase = await createClient();
    const businessId = await getActiveBizId(supabase, user.id);

    // The business cookie could have switched mid-flow — re-check the site.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: site } = await (supabase as any)
      .from("seo_sites").select("id, domain").eq("id", state.s).eq("business_id", businessId).maybeSingle();
    if (!site) return back(null, "gsc=site");

    const { refreshToken } = await exchangeCode(code);
    const accessToken = await (await import("@/lib/seo/gsc")).accessTokenFor(refreshToken);
    const props = await listProperties(accessToken);
    if (props.length === 0) return back(state.s, "gsc=noprops");

    // Carry the refresh token forward in a signed state rather than persisting
    // anything half-done. Short TTL — it's only alive for the picker round trip.
    const token = signState({ u: user.id, s: state.s, i: refreshToken }, 600);
    const { finalizeGscConnection } = await import("@/lib/actions/seo-connections");

    if (props.length === 1) {
      await finalizeGscConnection({ token, site_url: props[0].siteUrl });
      return back(state.s, "gsc=connected");
    }

    const guess = guessProperty(String(site.domain ?? ""), props);
    return back(state.s, `gsc=pick&g=${encodeURIComponent(token)}${guess ? `&guess=${encodeURIComponent(guess)}` : ""}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Search Console connect failed";
    return back(state.s, `gsc=error&msg=${encodeURIComponent(msg.slice(0, 160))}`);
  }
}

/**
 * Start a hunt and return immediately.
 *
 * A hunt is minutes of work — searches, then one model call per candidate,
 * then the audit. As a blocking server action that meant a spinner with no
 * information for two minutes, which is indistinguishable from a hang, and
 * anything that outlived the function limit lost its results entirely.
 *
 * So: authorise, create the run row, hand back its id, and do the work in
 * `after()`. The client polls the run's stage/processed/total and its event
 * feed, which is where the progress bar and the live log come from.
 *
 * The background half uses the ADMIN client on purpose — the cookie-bound
 * client's session isn't reliably usable once the response has been sent. It
 * is scoped to the business_id resolved from the caller's own session BEFORE
 * backgrounding, never from anything the request body claims.
 */
import { after, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveBizId } from "@/lib/active-business";
import { getUser } from "@/lib/auth";
import { runHunt, type HuntRow } from "@/lib/prospecting/run";

export const maxDuration = 300;

export async function POST(request: Request) {
  let businessId: string;
  try {
    const supabase = await createClient();
    const user = await getUser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    businessId = await getActiveBizId(supabase as any, user.id);
  } catch {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const huntId = typeof body.hunt_id === "string" ? body.hunt_id : null;
  if (!huntId) return NextResponse.json({ error: "hunt_id is required" }, { status: 400 });

  // The generated Database type predates these tables, same as everywhere else
  // that touches them (see `tbl()` in lib/actions and `t()` in lib/mcp).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Scoped by the session's business, so a guessed id from another tenant
  // simply isn't found.
  const { data: hunt } = await admin.from("prospect_hunts").select("*")
    .eq("id", huntId).eq("business_id", businessId).maybeSingle();
  if (!hunt) return NextResponse.json({ error: "Hunt not found" }, { status: 404 });

  // One run at a time per hunt. Two concurrent runs would double-spend and
  // race each other on the same place_id upserts.
  const { data: active } = await admin.from("prospect_hunt_runs").select("id")
    .eq("hunt_id", huntId).eq("status", "running").limit(1).maybeSingle();
  if (active) {
    return NextResponse.json({ run_id: active.id, already_running: true });
  }

  const { data: run, error } = await admin.from("prospect_hunt_runs").insert({
    business_id: businessId, hunt_id: huntId, status: "running", stage: "queued",
  }).select("id").single();
  if (error || !run) {
    return NextResponse.json({ error: "Couldn't start the run" }, { status: 500 });
  }

  after(async () => {
    try {
      await runHunt(admin, hunt as HuntRow, run.id);
    } catch (e) {
      // The run row is the only place a background failure can surface.
      await admin.from("prospect_hunt_runs").update({
        status: "failed",
        stage: "finished",
        error: e instanceof Error ? e.message : "The hunt failed unexpectedly",
        finished_at: new Date().toISOString(),
      }).eq("id", run.id);
    }
  });

  return NextResponse.json({ run_id: run.id });
}

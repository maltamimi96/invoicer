/**
 * DB-backed integration tests for the booking guarantees:
 *   - Concurrency: N simultaneous bookings at one slot → exactly ONE wins
 *     (the GiST exclusion constraint, not app logic).
 *   - RLS isolation: an unauthenticated (anon) client cannot read or write
 *     appointments.
 *
 * ---------------------------------------------------------------------------
 * SAFETY — read this before changing the gating below.
 *
 * This file previously ran whenever Supabase env vars merely *existed*, and
 * `npm run env:pull` fills .env.local with PRODUCTION values, so the documented
 * onboarding path pointed this suite at the live database. It then took
 * `businesses ... limit(1)` — whichever real tenant sorted first — and wrote a
 * booking resource and eight year-2099 appointments into it.
 *
 * Three rules now stand between this file and a real database:
 *   1. It is OFF by default. `npm test` skips it entirely. You must opt in with
 *      RUN_DB_TESTS=1.
 *   2. Even opted in, it REFUSES to run against the production project ref, and
 *      refuses any remote host unless you also set ALLOW_REMOTE_DB_TESTS=1.
 *      These refusals throw — they do not skip — because a silent skip would
 *      hide the fact that someone just tried to point this at production.
 *   3. It creates its own throwaway user + business and tears them down in a
 *      finally block. It never touches a tenant it did not create.
 *
 * Intended target is the local stack: `supabase start`, then
 * `RUN_DB_TESTS=1 npm run test:db`.
 * ---------------------------------------------------------------------------
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

/** The production Supabase project. This suite must never reach it. */
const PRODUCTION_PROJECT_REF = "huwlasrvbtbyxvmmfpwm";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const optedIn = process.env.RUN_DB_TESTS === "1";
const hasEnv = Boolean(URL && SERVICE && ANON);

function isLocalHost(rawUrl: string): boolean {
  try {
    const { hostname } = new global.URL(rawUrl);
    return (
      hostname === "127.0.0.1" ||
      hostname === "localhost" ||
      hostname === "::1" ||
      hostname === "host.docker.internal" ||
      hostname.endsWith(".local")
    );
  } catch {
    return false;
  }
}

/**
 * Decide whether it is safe to talk to whatever NEXT_PUBLIC_SUPABASE_URL points
 * at. Throws rather than returning false when the answer is "you are aimed at
 * something you should not be aimed at" — the caller asked for DB tests, so
 * silence would be the wrong answer.
 */
function assertSafeTarget(): void {
  if (!URL) throw new Error("RUN_DB_TESTS=1 but NEXT_PUBLIC_SUPABASE_URL is unset.");

  if (URL.includes(PRODUCTION_PROJECT_REF)) {
    throw new Error(
      `REFUSING TO RUN: NEXT_PUBLIC_SUPABASE_URL points at the production project ` +
        `(${PRODUCTION_PROJECT_REF}). These tests write real rows. ` +
        `Start the local stack with \`supabase start\` and point the env at it, ` +
        `or use a staging project. Note that \`npm run env:pull\` writes PRODUCTION ` +
        `values into .env.local — that is very likely how you got here.`,
    );
  }

  if (!isLocalHost(URL) && process.env.ALLOW_REMOTE_DB_TESTS !== "1") {
    throw new Error(
      `REFUSING TO RUN: ${URL} is not a local Supabase stack. If this really is a ` +
        `disposable staging project, set ALLOW_REMOTE_DB_TESTS=1 to confirm you ` +
        `know these tests create and delete rows there.`,
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let admin: any = null;

let userId = "";
let businessId = "";
let resourceId = "";
const SLOT_START = "2099-03-01T03:00:00.000Z";
const SLOT_END = "2099-03-01T04:00:00.000Z";

describe.skipIf(!optedIn || !hasEnv)("booking DB guarantees", () => {
  beforeAll(async () => {
    // Throws loudly if we are aimed at production or an unconfirmed remote.
    assertSafeTarget();

    admin = createClient(URL!, SERVICE!, { auth: { persistSession: false } });

    // Build our own tenant rather than borrowing `businesses ... limit(1)`.
    // businesses.user_id is NOT NULL and references auth.users, so the fixture
    // starts with a throwaway auth user; deleting it cascades the business away.
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const { data: created, error: userErr } = await admin.auth.admin.createUser({
      email: `vitest-booking-${stamp}@example.invalid`,
      password: `vitest-${stamp}-${Math.random().toString(36).slice(2)}`,
      email_confirm: true,
    });
    if (userErr) throw userErr;
    userId = created.user.id;

    const { data: biz, error: bizErr } = await admin
      .from("businesses")
      .insert({ user_id: userId, name: `VITEST_TMP ${stamp}` })
      .select("id")
      .single();
    if (bizErr) throw bizErr;
    businessId = biz.id;

    const { data: res, error: resErr } = await admin
      .from("booking_resources")
      .insert({ business_id: businessId, display_name: "VITEST_TMP" })
      .select("id")
      .single();
    if (resErr) throw resErr;
    resourceId = res.id;
  });

  afterAll(async () => {
    if (!admin) return;
    // Each step is independent: an early failure must not strand the rest.
    try {
      if (resourceId) {
        await admin.from("appointments").delete().eq("resource_id", resourceId);
        await admin.from("booking_resources").delete().eq("id", resourceId);
      }
    } finally {
      // Deleting the auth user cascades the business (and its rows) away, so
      // this single call is the real cleanup even if the above threw.
      if (userId) await admin.auth.admin.deleteUser(userId);
    }
  });

  it("rejects all-but-one of N concurrent bookings at the same slot", async () => {
    const N = 8;
    const attempts = Array.from({ length: N }, (_, i) =>
      admin.from("appointments").insert({
        business_id: businessId, resource_id: resourceId,
        customer_name: `Racer ${i}`, starts_at: SLOT_START, ends_at: SLOT_END,
      }).select("id"),
    );
    const results = await Promise.all(attempts);
    const successes = results.filter((r: { error: unknown }) => !r.error);
    const failures = results.filter((r: { error: unknown }) => r.error);

    // THE guarantee: the GiST exclusion constraint lets exactly one racer in.
    // If it were dropped, every insert would succeed and this is what catches it.
    expect(successes.length).toBe(1);
    expect(failures.length).toBe(N - 1);

    // The losers should be rejected BY THE CONSTRAINT (23P01), not by something
    // incidental. Against a remote project a racer can also die of transport
    // weather — a timeout, a pooler blip, a 5xx — which carries no Postgres
    // SQLSTATE. Demanding all N-1 be exactly 23P01 made this flaky while the
    // guarantee itself held. (Against the local stack there is no network to
    // blame, so in practice every loser here should be 23P01.)
    //
    // So: any loser that failed with a Postgres error must have failed with
    // 23P01, and at least one must have, proving the constraint actually fired
    // rather than everything having merely timed out.
    // SQLSTATE is five ALPHANUMERIC characters — 23P01 has a letter in it.
    const pgFailures = failures.filter((r: { error?: { code?: string } }) =>
      /^[0-9A-Z]{5}$/.test(String(r.error?.code ?? "")),
    );
    const wrongReason = pgFailures.filter(
      (r: { error?: { code?: string } }) => r.error?.code !== "23P01",
    );
    expect(
      wrongReason.map(
        (r: { error?: { code?: string; message?: string } }) =>
          `${r.error?.code}: ${r.error?.message}`,
      ),
    ).toEqual([]);
    expect(pgFailures.length).toBeGreaterThanOrEqual(1);

    // A non-overlapping (back-to-back) slot for the same resource still succeeds.
    const { error: backToBack } = await admin.from("appointments").insert({
      business_id: businessId, resource_id: resourceId,
      customer_name: "B2B", starts_at: SLOT_END, ends_at: "2099-03-01T05:00:00.000Z",
    });
    expect(backToBack).toBeNull();
  });

  it("blocks unauthenticated (anon) reads + writes via RLS", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anon: any = createClient(URL!, ANON!, { auth: { persistSession: false } });
    const { data: rows } = await anon.from("appointments").select("id").eq("business_id", businessId).limit(5);
    expect(rows ?? []).toHaveLength(0); // RLS hides every row from an anon caller

    const { error: insErr } = await anon.from("appointments").insert({
      business_id: businessId, resource_id: resourceId,
      customer_name: "Hacker", starts_at: "2099-04-01T03:00:00Z", ends_at: "2099-04-01T04:00:00Z",
    });
    expect(insErr).not.toBeNull(); // RLS write policy denies
  });
});

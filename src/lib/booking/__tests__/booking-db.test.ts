/**
 * DB-backed integration tests against the linked Supabase project.
 *   - Concurrency: N simultaneous bookings at one slot → exactly ONE wins
 *     (the GiST exclusion constraint, not app logic).
 *   - RLS isolation: an unauthenticated (anon) client cannot read or write
 *     appointments.
 *
 * Skips automatically when Supabase env isn't present (e.g. plain CI without
 * secrets). Creates a temp resource on an existing business and cleans up.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ready = Boolean(URL && SERVICE && ANON);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin: any = ready ? createClient(URL!, SERVICE!, { auth: { persistSession: false } }) : null;

let businessId = "";
let resourceId = "";
const SLOT_START = "2099-03-01T03:00:00.000Z";
const SLOT_END = "2099-03-01T04:00:00.000Z";

describe.skipIf(!ready)("booking DB guarantees", () => {
  beforeAll(async () => {
    const { data: biz } = await admin.from("businesses").select("id").limit(1).single();
    businessId = biz.id;
    const { data: res } = await admin.from("booking_resources")
      .insert({ business_id: businessId, display_name: "VITEST_TMP" }).select("id").single();
    resourceId = res.id;
  });

  afterAll(async () => {
    if (!resourceId) return;
    await admin.from("appointments").delete().eq("resource_id", resourceId);
    await admin.from("booking_resources").delete().eq("id", resourceId);
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
    const successes = results.filter((r) => !r.error);
    const failures = results.filter((r) => r.error);

    // THE guarantee: the GiST exclusion constraint lets exactly one racer in.
    // If it were dropped, every insert would succeed and this is what catches it.
    expect(successes.length).toBe(1);
    expect(failures.length).toBe(N - 1);

    // The losers should be rejected BY THE CONSTRAINT (23P01), not by something
    // incidental. This runs against the live remote project over the network,
    // though, so a racer can also die of a transport hiccup — a timeout, a
    // pooler blip, a 5xx — which carries no Postgres SQLSTATE. Demanding all
    // N-1 be exactly 23P01 made this test fail intermittently on network
    // weather while the guarantee itself held.
    //
    // So: any loser that failed with a Postgres error must have failed with
    // 23P01 (a 23505/40001/anything-else means the DB behaved differently and
    // we want to know), and at least one must have, proving the constraint
    // actually fired rather than everything having merely timed out.
    // SQLSTATE is five ALPHANUMERIC characters — 23P01 has a letter in it.
    const pgFailures = failures.filter((r) => /^[0-9A-Z]{5}$/.test(String(r.error?.code ?? "")));
    const wrongReason = pgFailures.filter((r) => r.error?.code !== "23P01");
    expect(
      wrongReason.map((r) => `${r.error?.code}: ${r.error?.message}`),
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

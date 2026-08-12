import { describe, it, expect, vi } from "vitest";
import { runHunt, type HuntRow } from "../run";

/**
 * The bug this exists to catch, because nothing else did:
 *
 * every candidate write went through `.upsert(...)` with the error ignored.
 * The conflict target was a PARTIAL unique index, which Postgres refuses as an
 * ON CONFLICT arbiter, so every write raised 42P10 — and the run reported
 * "5 to review", billed 45 cents, and stored nothing. tsc was clean, the unit
 * tests were green, and the feature had never once persisted a row.
 *
 * A run that cannot save its results must FAIL, loudly. It must never report
 * a count it didn't write.
 */

const HUNT: HuntRow = {
  id: "h1", business_id: "b1", name: "Test hunt",
  queries: ["plumber"], centre_label: "Parramatta", centre_lat: -33.8, centre_lng: 151.0,
  radius_m: 10000, criteria: "anyone", filters: {},
  target_count: 5, area_mode: "radius", suburbs: [], custom_params: [],
};

/**
 * Minimal Supabase double. `candidateError` simulates the upsert rejecting —
 * exactly what the partial index did in production.
 */
function fakeSb(opts: { candidateError?: string } = {}) {
  const runRow = { id: "run1" };
  const updates: Record<string, unknown>[] = [];

  const chain = (table: string) => {
    const api: Record<string, unknown> = {};
    const self = () => api;
    Object.assign(api, {
      select: self, eq: self, gte: self, in: self, limit: self, order: self,
      maybeSingle: async () => ({ data: table === "outreach_settings" ? null : null }),
      single: async () => ({ data: runRow, error: null }),
      insert: () => ({ select: () => ({ single: async () => ({ data: runRow, error: null }) }) }),
      update: (patch: Record<string, unknown>) => {
        if (table === "prospect_hunt_runs") updates.push(patch);
        return api;
      },
      upsert: async () => ({
        error: table === "prospect_candidates" && opts.candidateError
          ? { message: opts.candidateError } : null,
      }),
      then: undefined,
    });
    return api;
  };

  return { from: (t: string) => chain(t), __updates: updates };
}

describe("runHunt — a run that can't save must not claim success", () => {
  it("fails the run when candidate writes are rejected", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "test-key";

    // One real-looking Places hit, so screening has something to reject or keep.
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({
        places: [{
          id: "place-1",
          displayName: { text: "Ace Plumbing" },
          formattedAddress: "1 Test St",
          nationalPhoneNumber: "02 9000 0000",
          location: { latitude: -33.8, longitude: 151.0 },
        }],
      }),
    })));

    const sb = fakeSb({ candidateError: "there is no unique or exclusion constraint matching the ON CONFLICT specification" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await runHunt(sb as any, { ...HUNT, filters: { no_website: false } });

    expect(result.error).toBeTruthy();
    expect(result.error).toMatch(/couldn't save/i);

    // And the run row must say failed — not "done" with a count nobody stored.
    const finalStatus = (sb.__updates as Record<string, unknown>[])
      .map((u) => u.status).filter(Boolean).pop();
    expect(finalStatus).toBe("failed");
  }, 30_000);
});

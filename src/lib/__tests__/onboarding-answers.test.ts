/**
 * Storing onboarding answers when a secure field can't be encrypted.
 *
 * The throwing version meant one unencryptable credential 500'd the whole
 * payload: a client who filled in twenty fields lost all twenty and saw a
 * server error naming an env var they can't set. The safe version costs them
 * that one field — and, crucially, never falls back to storing the secret in
 * the clear, which is the only outcome worse than losing it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { OnboardingField } from "@/types/database";

const KEY = "ONBOARDING_SECRET_KEY";
const VALID = "a".repeat(64); // 64 hex chars

function field(id: string, type: OnboardingField["type"]): OnboardingField {
  return { id, type, label: id } as OnboardingField;
}

const SCHEMA: OnboardingField[] = [
  field("name", "short_text"),
  field("wifi", "secure"),
  field("notes", "long_text"),
];

async function load() {
  vi.resetModules();
  return import("@/lib/onboarding/answers");
}

describe("processAnswersForStorageSafe", () => {
  const original = process.env[KEY];
  beforeEach(() => { vi.resetModules(); });
  afterEach(() => {
    if (original === undefined) delete process.env[KEY];
    else process.env[KEY] = original;
  });

  it("encrypts a secure answer when the key is usable", async () => {
    process.env[KEY] = VALID;
    const { processAnswersForStorageSafe } = await load();
    const { stored, failed } = processAnswersForStorageSafe(SCHEMA, {
      name: "Sarah", wifi: "hunter2", notes: "gate code out back",
    });
    expect(failed).toEqual([]);
    expect(stored.name).toBe("Sarah");
    expect(stored.notes).toBe("gate code out back");
    expect(stored.wifi).toHaveProperty("enc");
    expect(JSON.stringify(stored.wifi)).not.toContain("hunter2");
  });

  it("keeps every other answer when a secure field can't be encrypted", async () => {
    delete process.env[KEY];
    const { processAnswersForStorageSafe } = await load();
    const { stored, failed } = processAnswersForStorageSafe(SCHEMA, {
      name: "Sarah", wifi: "hunter2", notes: "gate code out back",
    });
    expect(failed).toEqual(["wifi"]);
    expect(stored.name).toBe("Sarah");
    expect(stored.notes).toBe("gate code out back");
  });

  it("NEVER stores the secret in the clear when encryption fails", async () => {
    // The whole point. Losing the field is acceptable; leaking it is not.
    delete process.env[KEY];
    const { processAnswersForStorageSafe } = await load();
    const { stored } = processAnswersForStorageSafe(SCHEMA, { wifi: "hunter2" });
    expect(stored).not.toHaveProperty("wifi");
    expect(JSON.stringify(stored)).not.toContain("hunter2");
  });

  it("passes an already-encrypted answer straight through", async () => {
    // Autosave re-sends the merged draft, so a value encrypted on an earlier
    // pass must not be double-encrypted — or re-fail once the key is gone.
    delete process.env[KEY];
    const { processAnswersForStorageSafe } = await load();
    const prior = { enc: "v1.aaa.bbb.ccc" };
    const { stored, failed } = processAnswersForStorageSafe(SCHEMA, { wifi: prior });
    expect(failed).toEqual([]);
    expect(stored.wifi).toEqual(prior);
  });

  it("treats an empty secure answer as nothing to encrypt", async () => {
    delete process.env[KEY];
    const { processAnswersForStorageSafe } = await load();
    const { stored, failed } = processAnswersForStorageSafe(SCHEMA, { wifi: "", name: "Sarah" });
    expect(failed).toEqual([]);
    expect(stored.wifi).toBe("");
  });
});

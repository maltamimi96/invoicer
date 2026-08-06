import { describe, it, expect, vi, afterEach } from "vitest";
import {
  BIZ_COOKIE, BIZ_HINT_COOKIE, setActiveBusinessCookies, readBusinessHint,
} from "@/lib/business-cookie";

function fakeStore() {
  const set = vi.fn();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { store: { set } as any, set };
}

describe("setActiveBusinessCookies", () => {
  it("always writes both cookies", () => {
    // A hint that lags behind the real cookie makes tabs fight forever: the
    // guard compares against the hint, so a stale one is worse than none.
    const { store, set } = fakeStore();
    setActiveBusinessCookies(store, "biz-1");
    expect(set).toHaveBeenCalledTimes(2);
    expect(set.mock.calls.map((c) => c[0]).sort()).toEqual([BIZ_HINT_COOKIE, BIZ_COOKIE].sort());
    expect(set.mock.calls.every((c) => c[1] === "biz-1")).toBe(true);
  });

  it("keeps the authoritative cookie httpOnly and the hint readable", () => {
    const { store, set } = fakeStore();
    setActiveBusinessCookies(store, "biz-1");
    const real = set.mock.calls.find((c) => c[0] === BIZ_COOKIE)![2];
    const hint = set.mock.calls.find((c) => c[0] === BIZ_HINT_COOKIE)![2];
    // The server must never start trusting something JS can forge; the hint is
    // only ever compared against, never used to authorise anything.
    expect(real.httpOnly).toBe(true);
    expect(hint.httpOnly).toBe(false);
  });
});

describe("readBusinessHint", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "document");
  afterEach(() => {
    if (original) Object.defineProperty(globalThis, "document", original);
    else delete (globalThis as { document?: unknown }).document;
  });

  const withCookie = (cookie: string) =>
    Object.defineProperty(globalThis, "document", { value: { cookie }, configurable: true });

  it("finds the hint among other cookies", () => {
    withCookie(`theme=dark; ${BIZ_HINT_COOKIE}=biz-9; other=1`);
    expect(readBusinessHint()).toBe("biz-9");
  });

  it("does not match a cookie whose name merely ends with the hint's", () => {
    withCookie(`not_${BIZ_HINT_COOKIE}=wrong`);
    expect(readBusinessHint()).toBeNull();
  });

  it("returns null when absent", () => {
    withCookie("theme=dark");
    expect(readBusinessHint()).toBeNull();
  });

  it("returns null on the server, where there is no document", () => {
    delete (globalThis as { document?: unknown }).document;
    expect(readBusinessHint()).toBeNull();
  });
});

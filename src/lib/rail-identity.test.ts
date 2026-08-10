import { describe, it, expect } from "vitest";
import { packSections } from "@/components/layout/app-sidebar";

/**
 * Why the rail's paging arrows were dead.
 *
 * `packSections` builds a fresh array every call — correct for a pure
 * function, and fatal as a React effect dependency. The rail listed its packed
 * pages in an effect's dep array, so the effect ran after EVERY render,
 * including the render caused by clicking an arrow, and immediately reset the
 * page to whichever one holds the current route.
 *
 * The fix keys that effect on `pathname` alone. This test pins the property
 * that made the old code wrong, so a future edit that reintroduces
 * `pagesOfSections` as a dependency has this sitting next to it.
 */
describe("packSections identity", () => {
  it("returns a new array for identical input — never use it as an effect dep", () => {
    const secs = [
      { section: "A", items: [{ href: "/a" }] },
      { section: "B", items: [{ href: "/b" }] },
    ];
    const first = packSections(secs, 7);
    const second = packSections(secs, 7);

    expect(second).toEqual(first);   // same content
    expect(second).not.toBe(first);  // different object, every single call
  });
});

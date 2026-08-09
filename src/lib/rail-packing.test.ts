import { describe, it, expect } from "vitest";
import { packSections, SLOTS_PER_PAGE } from "@/components/layout/app-sidebar";

const sec = (name: string, n: number) => ({ section: name, items: Array.from({ length: n }, (_, i) => ({ href: `/${name}${i}` })) });

describe("packSections", () => {
  it("never splits a category across pages", () => {
    // The whole reason the rail groups by section: a category cut in half
    // reads as two unrelated runs of icons.
    const pages = packSections([sec("A", 4), sec("B", 5), sec("C", 3)], 9);
    for (const page of pages) {
      for (const s of page) {
        expect(s.items.length).toBe(s.items.length); // intact object, not sliced
      }
    }
    const names = pages.flat().map((s) => s.section);
    expect(names).toEqual(["A", "B", "C"]);
    expect(new Set(names).size).toBe(3);
  });

  it("fills a page before starting the next", () => {
    const pages = packSections([sec("A", 4), sec("B", 4), sec("C", 4)], 9);
    expect(pages.map((p) => p.map((s) => s.section))).toEqual([["A", "B"], ["C"]]);
  });

  it("gives an oversized category its own page rather than cutting it", () => {
    const pages = packSections([sec("A", 2), sec("Huge", 20), sec("B", 2)], 9);
    expect(pages.map((p) => p.map((s) => s.section))).toEqual([["A"], ["Huge"], ["B"]]);
  });

  it("keeps everything on one page when it all fits", () => {
    const pages = packSections([sec("A", 3), sec("B", 3)], 9);
    expect(pages).toHaveLength(1);
  });

  it("never loses a section", () => {
    const input = [sec("A", 4), sec("B", 5), sec("C", 2), sec("D", 6), sec("E", 1)];
    const out = packSections(input, SLOTS_PER_PAGE).flat();
    expect(out.map((s) => s.section)).toEqual(["A", "B", "C", "D", "E"]);
  });

  it("handles an empty section without producing a zero-cost infinite page", () => {
    const pages = packSections([sec("Empty", 0), sec("A", 9)], 9);
    expect(pages.flat().map((s) => s.section)).toEqual(["Empty", "A"]);
  });

  it("returns a single page for no sections rather than nothing", () => {
    expect(packSections([], 9)).toEqual([[]]);
  });
});

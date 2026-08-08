"use client";

/**
 * The business's words, available to any page — not just the sidebar.
 *
 * This is the fix for a real mismatch: the agency preset renamed Work Orders
 * to "Projects" in the nav, and the page it opened still said "Work Orders"
 * everywhere. The nav and the page now read the same resolved map.
 *
 * Resolution (business override → preset → built-in) happens on the server,
 * in the layout. The client is handed the answer, so a page can't resolve it
 * differently from the sidebar.
 */

import { createContext, useContext } from "react";
import { singularise, type Vocab } from "@/lib/nav/config";

const VocabContext = createContext<Record<string, string> | null>(null);

export function VocabProvider({
  labels, children,
}: { labels: Record<string, string> | null; children: React.ReactNode }) {
  return <VocabContext.Provider value={labels}>{children}</VocabContext.Provider>;
}

/**
 * What this business calls the thing at `href`.
 *
 * `fallbackPlural` is the built-in name, so a page that hasn't been given a
 * label still reads correctly — nothing renders blank or "undefined".
 */
export function useVocab(href: string, fallbackPlural: string): Vocab {
  const labels = useContext(VocabContext);
  const plural = labels?.[href] ?? fallbackPlural;
  return { plural, singular: singularise(plural) };
}

/** Lowercased, for mid-sentence use ("no projects yet"). */
export function lower(word: string): string {
  // Only lowercase a word that looks like ordinary title-case. An acronym or
  // a deliberately-capitalised brand name ("SEO Tasks") should stay as typed.
  return /^[A-Z][a-z]+(\s[A-Za-z][a-z]+)*$/.test(word) ? word.toLowerCase() : word;
}

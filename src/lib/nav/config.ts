/**
 * What the navigation is called, in what order, and what's hidden.
 *
 * The industry preset supplies defaults (an agency calls Work Orders
 * "Projects"); a business can override any of it. Plain module — the sidebar,
 * the settings editor and the pages themselves all read it, so a label can't
 * mean one thing in the nav and another on the page it opens.
 *
 * The naming is deliberate: `labels` is keyed by href, not by some separate
 * id, because the href is the one identifier the nav, the router and the
 * settings editor already agree on.
 */

export interface NavConfig {
  /** href → what to call it. */
  labels?: Record<string, string>;
  /** hrefs to hide. Hiding is not disabling — the route still works if you
   *  have the link, and the plugin system is what actually turns things off. */
  hidden?: string[];
  /** hrefs in the order they should appear. Anything missing keeps its
   *  default position, so a partial order isn't a way to lose items. */
  order?: string[];
}

/** A page's own noun, for headings and buttons — "Project" from "Projects". */
export interface Vocab {
  /** Plural, as shown in the nav: "Projects". */
  plural: string;
  /** Singular, for a heading or button: "Project". */
  singular: string;
}

/**
 * Resolve the label for an href.
 *
 * Order: the business's own override, then the preset's vocab, then the
 * built-in label. Anything else would make a preset able to override a
 * deliberate choice.
 */
export function labelFor(
  href: string,
  fallback: string,
  config: NavConfig | null | undefined,
  presetVocab: Record<string, string> | null | undefined,
): string {
  return config?.labels?.[href] ?? presetVocab?.[href] ?? fallback;
}

/**
 * Singularise a plural label well enough for a heading.
 *
 * Deliberately simple: it handles the endings that actually appear in this
 * app's nav ("Projects", "Proposals", "Deliveries", "Clients"). It's used for
 * button text, so being wrong is cosmetic — and a business that dislikes the
 * result can set the label themselves.
 */
export function singularise(plural: string): string {
  const p = plural.trim();
  if (/ies$/i.test(p)) return p.slice(0, -3) + "y";      // Deliveries → Delivery
  if (/(ses|xes|zes|ches|shes)$/i.test(p)) return p.slice(0, -2); // Boxes → Box
  if (/ss$/i.test(p)) return p;                          // Progress stays
  if (/s$/i.test(p)) return p.slice(0, -1);              // Projects → Project
  return p;
}

export function vocabFor(
  href: string,
  fallbackPlural: string,
  config: NavConfig | null | undefined,
  presetVocab: Record<string, string> | null | undefined,
): Vocab {
  const plural = labelFor(href, fallbackPlural, config, presetVocab);
  return { plural, singular: singularise(plural) };
}

export function isHidden(href: string, config: NavConfig | null | undefined): boolean {
  return Boolean(config?.hidden?.includes(href));
}

/**
 * Sort by the configured order, keeping unlisted items where they were.
 *
 * An item absent from `order` must NOT vanish or jump to the end: new nav
 * items ship all the time, and a business that reordered once shouldn't stop
 * seeing them or find them piled up at the bottom.
 */
export function applyOrder<T extends { href: string }>(
  items: T[],
  config: NavConfig | null | undefined,
): T[] {
  const order = config?.order;
  if (!order?.length) return items;
  const rank = new Map(order.map((h, i) => [h, i]));
  return items
    .map((item, i) => ({ item, i, rank: rank.get(item.href) }))
    .sort((a, b) => {
      if (a.rank === undefined && b.rank === undefined) return a.i - b.i;
      if (a.rank === undefined) return 1;
      if (b.rank === undefined) return -1;
      return a.rank - b.rank;
    })
    .map((x) => x.item);
}

/** Reject junk before it reaches the database. */
export function validateNavConfig(config: NavConfig): string | null {
  for (const [href, label] of Object.entries(config.labels ?? {})) {
    if (!href.startsWith("/")) return `"${href}" isn't a page.`;
    if (!label.trim()) return "A name can't be blank — remove the override instead.";
    if (label.length > 24) return `"${label}" is too long for the sidebar — keep it under 24 characters.`;
  }
  return null;
}

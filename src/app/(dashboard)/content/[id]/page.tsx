import { notFound } from "next/navigation";
import {
  getContentBrand,
  listContentTopics,
  listContentPieces,
  getContentBudget,
  scoutRunning,
} from "@/lib/actions/content";
import { listContentCampaigns, listContentCalendar } from "@/lib/actions/content-campaigns";
import { ContentBrandHub } from "@/components/content/content-brand-hub";

/**
 * A brand's hub — research, generate, plan, watch.
 *
 * Route-gated by the plugin resolver in (dashboard)/layout.tsx.
 */

/** `?m=YYYY-MM` — the calendar's month. Untrusted: it's in the URL. */
function parseMonth(raw: string | undefined): [number, number] {
  const now = new Date();
  const m = /^(\d{4})-(\d{2})$/.exec(raw ?? "");
  if (!m) return [now.getFullYear(), now.getMonth()];

  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  // A hand-edited ?m=2026-99 shouldn't roll into next year silently.
  if (year < 2000 || year > 2100 || month < 0 || month > 11) {
    return [now.getFullYear(), now.getMonth()];
  }
  return [year, month];
}

export default async function ContentBrandPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ m?: string }>;
}) {
  const { id } = await params;
  const { m } = await searchParams;
  const [year, month] = parseMonth(m);

  // The grid shows the neighbouring weeks' days too, so fetch a month either
  // side — otherwise cards in those leading/trailing cells silently vanish.
  const from = new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 10);
  const to = new Date(Date.UTC(year, month + 2, 0)).toISOString().slice(0, 10);

  try {
    const [brand, topics, pieces, campaigns, calendar, budget, scoutBusy] = await Promise.all([
      getContentBrand(id),
      listContentTopics(id),
      listContentPieces(id),
      listContentCampaigns(id),
      listContentCalendar(id, from, to),
      getContentBudget(),
      scoutRunning(id),
    ]);

    return (
      <ContentBrandHub
        brand={brand}
        topics={topics}
        pieces={pieces}
        campaigns={campaigns}
        calendar={calendar}
        calendarMonth={[year, month]}
        budget={budget}
        scoutBusy={scoutBusy}
      />
    );
  } catch {
    // Not found, or not this business's brand — RLS makes those the same thing.
    notFound();
  }
}

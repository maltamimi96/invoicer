/**
 * SEO report assembly (docs/SEO_AGENCY_PLAN.md, Phase 3). Pulls a period's
 * rankings movement, work delivered and next-period plan from existing SEO
 * data into the fields stored on seo_reports. Shared by the server action and
 * the MCP tool. Server-only (takes a Supabase client). Dependency-free — no
 * ranking data yet just yields an empty rankings section.
 */

function isoDate(d: Date): string { return d.toISOString().split("T")[0]; }

export interface ReportFields {
  title: string;
  period_start: string;
  period_end: string;
  metrics: Record<string, unknown>;
  work_log: Record<string, unknown>;
  plan: Record<string, unknown>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function assembleReport(sb: any, businessId: string, siteId: string, domain: string, periodDays = 30): Promise<ReportFields> {
  const end = new Date();
  const start = new Date(end.getTime() - periodDays * 86400000);
  const startISO = start.toISOString();
  const tbl = (n: string) => sb.from(n);

  const [snapsRes, contentRes, oppsDoneRes, oppsPlanRes] = await Promise.all([
    tbl("seo_keyword_snapshots").select("keyword, position, clicks, impressions, captured_at")
      .eq("business_id", businessId).eq("site_id", siteId).gte("captured_at", isoDate(start)).order("captured_at", { ascending: true }),
    tbl("seo_content_pieces").select("title, published_url, status, updated_at")
      .eq("business_id", businessId).eq("site_id", siteId).in("status", ["published", "approved"]).gte("updated_at", startISO).order("updated_at", { ascending: false }),
    tbl("seo_opportunities").select("title, type, updated_at")
      .eq("business_id", businessId).eq("site_id", siteId).eq("status", "done").gte("updated_at", startISO),
    tbl("seo_opportunities").select("title, type, priority")
      .eq("business_id", businessId).eq("site_id", siteId).eq("status", "queued").order("priority", { ascending: false }).limit(6),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byKw = new Map<string, { first: any; last: any }>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const s of (snapsRes.data ?? []) as any[]) {
    const cur = byKw.get(s.keyword);
    if (!cur) byKw.set(s.keyword, { first: s, last: s });
    else cur.last = s;
  }
  const rankings = [...byKw.entries()].map(([keyword, { first, last }]) => ({
    keyword,
    from: first.position ?? null,
    to: last.position ?? null,
    change: first.position != null && last.position != null ? Math.round((first.position - last.position) * 10) / 10 : null,
    clicks: last.clicks ?? 0,
    impressions: last.impressions ?? 0,
  })).sort((a, b) => (b.change ?? -999) - (a.change ?? -999)).slice(0, 25);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content = ((contentRes.data ?? []) as any[]).map((c) => ({ title: c.title, url: c.published_url, date: c.updated_at }));
  const totalClicks = rankings.reduce((n, r) => n + (r.clicks || 0), 0);
  const totalImpressions = rankings.reduce((n, r) => n + (r.impressions || 0), 0);

  return {
    title: `SEO report — ${domain} · ${isoDate(start)} to ${isoDate(end)}`,
    period_start: isoDate(start),
    period_end: isoDate(end),
    metrics: { rankings, totalClicks, totalImpressions, trackedKeywords: byKw.size },
    work_log: {
      contentShipped: content,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      opportunitiesDone: ((oppsDoneRes.data ?? []) as any[]).map((o) => ({ title: o.title, type: o.type })),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    plan: { next: ((oppsPlanRes.data ?? []) as any[]).map((o) => ({ title: o.title, type: o.type })) },
  };
}

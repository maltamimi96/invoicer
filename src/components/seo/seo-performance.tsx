"use client";

/**
 * Search performance — top queries from the nightly Search Console sync
 * (seo_keyword_snapshots). Position is the latest snapshot in the window;
 * clicks/impressions sum across it.
 */
import { TrendingUp, Plug } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";

export interface PerformanceData {
  rows: { keyword: string; position: number | null; clicks: number; impressions: number; ctr: number | null }[];
  totals: { clicks: number; impressions: number; keywords: number };
  lastSynced: string | null;
}

const pct = (n: number | null) => (n == null ? "—" : `${(n * 100).toFixed(1)}%`);
const pos = (n: number | null) => (n == null ? "—" : n.toFixed(1));

export function SeoPerformance({ data, hasGsc, onConnect }: { data: PerformanceData; hasGsc: boolean; onConnect: () => void }) {
  if (!hasGsc) {
    return (
      <div className="ch-empty rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
        <div className="w-12 h-12 rounded-xl bg-muted mx-auto flex items-center justify-center mb-3"><Plug className="w-6 h-6 text-muted-foreground" /></div>
        <h4 className="font-semibold">No Search Console connected</h4>
        <p className="text-sm text-muted-foreground mt-1 mb-4">Connect Google Search Console to pull real keyword positions, clicks and impressions — and to fill the rankings table in client reports.</p>
        <Button onClick={onConnect}>Go to Connections</Button>
      </div>
    );
  }

  if (data.rows.length === 0) {
    return (
      <div className="ch-empty rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
        <div className="w-12 h-12 rounded-xl bg-muted mx-auto flex items-center justify-center mb-3"><TrendingUp className="w-6 h-6 text-muted-foreground" /></div>
        <h4 className="font-semibold">No data synced yet</h4>
        <p className="text-sm text-muted-foreground mt-1">
          Search Console is connected — the sync runs nightly and Google&apos;s data lags 2–3 days, so the first rows land within a day.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Tile label="Clicks" value={data.totals.clicks.toLocaleString()} sub="last 28 days" />
        <Tile label="Impressions" value={data.totals.impressions.toLocaleString()} sub="last 28 days" />
        <Tile label="Queries" value={data.totals.keywords.toLocaleString()} sub={data.lastSynced ? `synced ${data.lastSynced}` : undefined} />
      </div>

      <div className="ch-table-wrap">
        <table className="ch-table w-full">
          <thead>
            <tr>
              <th>Query</th>
              <th className="num">Position</th>
              <th className="num">Clicks</th>
              <th className="num">Impressions</th>
              <th className="num">CTR</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.keyword}>
                <td className="break-words">{r.keyword}</td>
                <td className="num tabular-nums">{pos(r.position)}</td>
                <td className="num tabular-nums font-semibold">{r.clicks.toLocaleString()}</td>
                <td className="num tabular-nums">{r.impressions.toLocaleString()}</td>
                <td className="num tabular-nums">{pct(r.ctr)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Top {data.rows.length} queries by clicks. Position is the most recent daily snapshot; clicks and impressions are summed over the window.
      </p>
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold mt-1 tabular-nums">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

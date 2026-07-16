/**
 * Route-segment fallback for entity DETAIL pages ([id] segments).
 * The generic (dashboard)/loading.tsx is list-shaped (KPI strip + table),
 * which visibly reflows when a detail layout arrives — this mirrors the
 * DetailHero + fact-cards + content-panels shape instead.
 */
export function DetailSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Hero: avatar + title + actions */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 bg-muted rounded-xl" />
            <div className="space-y-2">
              <div className="h-6 w-48 bg-muted rounded-md" />
              <div className="h-3 w-64 bg-muted rounded-md" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-9 w-24 bg-muted rounded-xl" />
            <div className="h-9 w-28 bg-muted rounded-xl" />
          </div>
        </div>
      </div>

      {/* Fact cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl p-4 border border-border bg-card space-y-2">
            <div className="h-3 w-16 bg-muted rounded-md" />
            <div className="h-5 w-24 bg-muted rounded-md" />
          </div>
        ))}
      </div>

      {/* Tabs + content panel */}
      <div className="flex items-center gap-4 border-b border-border pb-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-4 w-20 bg-muted rounded-md" />
        ))}
      </div>
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-9 w-9 bg-muted rounded-lg" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-1/2 bg-muted rounded-md" />
              <div className="h-2.5 w-1/3 bg-muted rounded-md" />
            </div>
            <div className="h-4 w-16 bg-muted rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default DetailSkeleton;

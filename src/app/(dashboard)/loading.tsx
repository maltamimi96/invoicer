/**
 * Route-segment fallback while a (dashboard) page's RSCs stream in.
 * Mirrors the new Kirei layout — gradient accent header + 4 KPI tiles +
 * card list — so the canvas doesn't reflow when the real content arrives.
 */
export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Page header */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div className="flex items-stretch gap-3">
          <div className="w-1 rounded-full bg-muted" />
          <div className="space-y-2">
            <div className="h-8 w-56 bg-muted rounded-md" />
            <div className="h-3 w-72 bg-muted rounded-md" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-24 bg-muted rounded-xl" />
          <div className="h-9 w-32 bg-muted rounded-xl" />
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl p-4 border border-border bg-card space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 bg-muted rounded-md" />
              <div className="h-3 w-20 bg-muted rounded-md" />
            </div>
            <div className="h-6 w-28 bg-muted rounded-md" />
            <div className="h-3 w-16 bg-muted rounded-md" />
          </div>
        ))}
      </div>

      {/* Card list */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <div className="h-4 w-32 bg-muted rounded-md" />
        </div>
        <div className="p-2 space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border/70">
              <div className="h-10 w-10 bg-muted rounded-lg" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-3/5 bg-muted rounded-md" />
                <div className="h-2.5 w-2/5 bg-muted rounded-md" />
              </div>
              <div className="h-5 w-16 bg-muted rounded-full" />
              <div className="h-3 w-20 bg-muted rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

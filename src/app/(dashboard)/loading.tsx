/**
 * Route-segment fallback while a (dashboard) page's RSCs stream in.
 * Mirrors the prototype's page header + KPI strip + table skeleton so the
 * canvas doesn't reflow when the real content arrives.
 */
export default function Loading() {
  return (
    <div className="animate-pulse">
      {/* Page header */}
      <div className="ch-page-header">
        <div>
          <div className="h-7 w-48 bg-muted rounded-md" />
          <div className="h-3 w-64 bg-muted rounded-md mt-2.5" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-28 bg-muted rounded-md" />
          <div className="h-9 w-32 bg-muted rounded-md" />
        </div>
      </div>

      {/* Stat grid */}
      <div className="ch-stat-grid">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="ch-stat">
            <div className="h-3 w-24 bg-muted rounded-md" />
            <div className="h-7 w-32 bg-muted rounded-md" />
            <div className="h-2.5 w-20 bg-muted rounded-md" />
          </div>
        ))}
      </div>

      {/* Body */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <div className="h-4 w-32 bg-muted rounded-md" />
        </div>
        <div className="divide-y divide-border">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="px-4 py-3 flex items-center gap-4">
              <div className="h-3 w-20 bg-muted rounded-md" />
              <div className="h-3 w-32 bg-muted rounded-md" />
              <div className="h-3 w-24 bg-muted rounded-md ml-auto" />
              <div className="h-5 w-16 bg-muted rounded-full" />
              <div className="h-3 w-20 bg-muted rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

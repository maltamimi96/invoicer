/**
 * Mirrors the leads workspace shape — header, 4 KPIs, view switcher + search,
 * then the board — so the canvas doesn't reflow when the real content streams
 * in.
 */
export default function Loading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-8 w-24 bg-muted rounded-lg" />
        <div className="h-9 w-28 bg-muted rounded-lg" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-20 bg-muted rounded-xl" />
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="h-10 w-56 bg-muted rounded-xl" />
        <div className="h-10 w-64 bg-muted rounded-xl" />
      </div>

      <div className="flex gap-4 overflow-hidden xl:grid xl:grid-cols-5">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="w-[280px] shrink-0 xl:w-auto space-y-2">
            <div className="h-9 bg-muted rounded-lg" />
            {[...Array(3)].map((_, j) => (
              <div key={j} className="h-28 bg-muted rounded-xl" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

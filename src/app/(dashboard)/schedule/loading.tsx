export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-8 w-44 bg-muted rounded-lg" />
        <div className="flex gap-2">
          <div className="h-9 w-9 bg-muted rounded-lg" />
          <div className="h-9 w-32 bg-muted rounded-lg" />
          <div className="h-9 w-9 bg-muted rounded-lg" />
        </div>
      </div>
      <div className="grid grid-cols-7 gap-2">
        {[...Array(7)].map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-6 bg-muted rounded" />
            <div className="h-40 bg-muted rounded-xl" />
            {i % 2 === 0 && <div className="h-20 bg-muted/60 rounded-xl" />}
          </div>
        ))}
      </div>
    </div>
  );
}

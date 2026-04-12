export default function Loading() {
  return (
    <div className="flex h-[calc(100vh-8rem)] gap-0 border rounded-xl overflow-hidden animate-pulse">
      <div className="w-80 border-r flex flex-col gap-3 p-4">
        <div className="h-9 bg-muted rounded-lg" />
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-16 bg-muted rounded-lg" />
        ))}
      </div>
      <div className="flex-1 flex flex-col p-4 gap-3">
        <div className="h-14 bg-muted rounded-lg" />
        <div className="flex-1" />
        <div className="h-12 bg-muted rounded-lg" />
      </div>
    </div>
  );
}

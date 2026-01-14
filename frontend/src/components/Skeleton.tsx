export function CardSkeleton() {
  return (
    <div className="px-5 py-3 border-b border-border animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-5 h-5 bg-surfaceHighlight rounded" />
        <div className="h-4 bg-surfaceHighlight rounded w-48" />
      </div>
    </div>
  );
}

export function ListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </>
  );
}

export function HeaderSkeleton() {
  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden shadow-surface">
      <div className="px-5 py-3 border-b border-border bg-surfaceHighlight/50">
        <div className="h-4 bg-surfaceHighlight rounded w-20 animate-pulse" />
      </div>
      <ListSkeleton count={5} />
    </div>
  );
}

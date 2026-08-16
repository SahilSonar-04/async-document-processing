export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 rounded-md border border-subtle px-3 py-3">
      <div className="h-8 w-10 animate-pulse rounded-md bg-surface-raised" />
      <div className="h-3.5 max-w-xs flex-1 animate-pulse rounded bg-surface-raised" />
      <div className="h-3 w-16 animate-pulse rounded bg-surface-raised" />
      <div className="h-3 w-16 animate-pulse rounded bg-surface-raised" />
      <div className="h-3 w-20 animate-pulse rounded bg-surface-raised" />
    </div>
  );
}

export function SkeletonList({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}

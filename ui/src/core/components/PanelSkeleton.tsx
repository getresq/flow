interface PanelSkeletonProps {
  lines?: number;
}

export function PanelSkeleton({ lines = 4 }: PanelSkeletonProps) {
  return (
    <div className="space-y-4 px-4 py-3" data-testid="panel-skeleton">
      <div className="space-y-3">
        <div className="skeleton-shimmer h-5 w-2/3" />
        <div className="skeleton-shimmer h-4 w-1/2" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="skeleton-shimmer h-20 rounded-lg" />
        <div className="skeleton-shimmer h-20 rounded-lg" />
      </div>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skeleton-shimmer h-12 rounded-lg" />
      ))}
    </div>
  );
}

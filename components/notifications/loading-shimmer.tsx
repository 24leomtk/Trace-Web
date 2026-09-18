export function LoadingShimmer() {
  return (
    <div className="space-y-6 p-4">
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className="space-y-3"
          style={{ animationDelay: `${index * 100}ms` }}
        >
          <div className="animate-pulse space-y-2">
            <div className="h-3 bg-muted/60 w-full animate-shimmer"></div>
            <div
              className="h-3 bg-muted/60 w-3/4 animate-shimmer"
              style={{ animationDelay: "0.1s" }}
            ></div>
            <div
              className="h-3 bg-muted/60 w-1/2 animate-shimmer"
              style={{ animationDelay: "0.2s" }}
            ></div>
          </div>
        </div>
      ))}
    </div>
  );
}

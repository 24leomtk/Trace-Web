import { Skeleton } from "@/components/ui/skeleton"

export default function AppLoading() {
  return (
    <div className="flex animate-in flex-col gap-6 duration-300 fade-in">
      {/* Top Header / Mode Switcher placeholder */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-2xl" />
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-32 rounded-lg" />
            <Skeleton className="h-3 w-20 rounded-lg" />
          </div>
        </div>
        <Skeleton className="h-9 w-28" />
      </div>

      {/* Filter / Action Bar placeholder */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-10 flex-1 rounded-2xl" />
        <Skeleton className="size-10 shrink-0 rounded-2xl" />
      </div>

      {/* Timeline / Record cards skeletons */}
      <div className="space-y-4 pt-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex flex-col gap-3 border border-border/60 bg-card/60 p-4 shadow-2xs"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Skeleton className="size-6" />
                <Skeleton className="h-4 w-36" />
              </div>
              <Skeleton className="h-3 w-16" />
            </div>

            <div className="space-y-1.5 pt-1">
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-4/5" />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-5 w-20" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

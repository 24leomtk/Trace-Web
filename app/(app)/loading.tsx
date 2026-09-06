import { Skeleton } from "@/components/ui/skeleton"

export default function AppLoading() {
  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300">
      {/* Top Header / Mode Switcher placeholder */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-2xl" />
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-32 rounded-lg" />
            <Skeleton className="h-3 w-20 rounded-lg" />
          </div>
        </div>
        <Skeleton className="h-9 w-28 rounded-full" />
      </div>

      {/* Filter / Action Bar placeholder */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-10 flex-1 rounded-2xl" />
        <Skeleton className="size-10 rounded-2xl shrink-0" />
      </div>

      {/* Timeline / Record cards skeletons */}
      <div className="space-y-4 pt-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex flex-col gap-3 rounded-3xl border border-border/60 bg-card/60 p-4 shadow-2xs"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Skeleton className="size-6 rounded-full" />
                <Skeleton className="h-4 w-36 rounded-md" />
              </div>
              <Skeleton className="h-3 w-16 rounded-md" />
            </div>

            <div className="space-y-1.5 pt-1">
              <Skeleton className="h-3.5 w-full rounded-md" />
              <Skeleton className="h-3.5 w-4/5 rounded-md" />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Skeleton className="h-5 w-24 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

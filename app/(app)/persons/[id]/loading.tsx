import { Skeleton } from "@/components/ui/skeleton"

/** Mirrors person detail: back + name header + linked grid + merge card. */
export default function PersonDetailLoading() {
  return (
    <div
      className="flex animate-in flex-col gap-5 duration-300 fade-in"
      aria-busy="true"
      aria-label="Loading person"
    >
      <Skeleton className="h-8 w-32" />
      <div className="flex flex-col gap-1.5" aria-hidden="true">
        <Skeleton className="h-6 w-52" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-4 w-4/5" />
      </div>
      <div aria-hidden="true" className="flex flex-col gap-2">
        <Skeleton className="h-3 w-32" />
        <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="rounded-none border px-3 py-2">
              <Skeleton className="h-4 w-3/4" />
            </li>
          ))}
        </ul>
      </div>
      <div
        aria-hidden="true"
        className="flex flex-col gap-2 rounded-none border bg-card p-4"
      >
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3 w-full" />
        <div className="flex gap-2">
          <Skeleton className="h-9 flex-1" />
          <Skeleton className="h-9 w-20" />
        </div>
      </div>
    </div>
  )
}

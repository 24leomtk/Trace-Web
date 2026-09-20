import { Skeleton } from "@/components/ui/skeleton"

/** Mirrors vehicle detail: back + plate header + owner + linked grid + taxes. */
export default function VehicleDetailLoading() {
  return (
    <div
      className="flex animate-in flex-col gap-5 duration-300 fade-in"
      aria-busy="true"
      aria-label="Loading vehicle"
    >
      <Skeleton className="h-8 w-20" />
      <div className="flex flex-col gap-1.5" aria-hidden="true">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-56" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-3 w-48" />
          <Skeleton className="h-7 w-32" />
        </div>
      </div>
      <div
        aria-hidden="true"
        className="rounded-none border bg-card p-4"
      >
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="mt-2 h-3 w-1/2" />
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
        <Skeleton className="h-3 w-24" />
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  )
}

import { Skeleton } from "@/components/ui/skeleton";

// Customer storefront (menu, cart, checkout, orders) while the page loads.
export default function StorefrontLoading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading">
      <div className="flex flex-col items-center gap-3 pt-6 sm:pt-10">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-3.5 w-56" />
      </div>
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-28 shrink-0 rounded-full" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-2xl border border-border bg-card">
            <Skeleton className="aspect-[4/3] w-full rounded-none" />
            <div className="space-y-2 p-4">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

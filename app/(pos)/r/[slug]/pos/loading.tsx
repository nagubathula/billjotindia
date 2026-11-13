import { Skeleton } from "@/components/ui/skeleton";

// Counter POS: the outline of the billing screen while the menu and tabs load.
export default function PosLoading() {
  return (
    <div className="flex h-screen flex-col bg-background" aria-busy="true" aria-label="Loading POS">
      <div className="flex h-13 shrink-0 items-center gap-3 border-b border-border bg-card px-3">
        <Skeleton className="h-8 w-8" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="ml-auto h-8 w-72" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="flex-1 space-y-3 p-3">
          <div className="flex gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-24 rounded-full" />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {Array.from({ length: 18 }).map((_, i) => (
              <Skeleton key={i} className="h-[100px] rounded-xl" />
            ))}
          </div>
        </div>
        <div className="hidden w-96 shrink-0 flex-col gap-3 border-l border-border bg-card p-3 md:flex">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <div className="flex-1" />
          <Skeleton className="h-24 w-full" />
          <div className="grid grid-cols-3 gap-2">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        </div>
      </div>
    </div>
  );
}

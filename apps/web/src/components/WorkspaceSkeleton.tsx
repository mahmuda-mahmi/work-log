import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader } from './ui/card';
import { Skeleton } from './ui/skeleton';

function useSlowConnectionHint(delayMs = 5000): boolean {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs]);

  return slow;
}

export function ComposerSkeleton() {
  return (
    <Card className="border-t-2 border-t-primary">
      <CardHeader className="py-2.5">
        <Skeleton className="h-5 w-32" />
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-7 w-20 rounded-md" />
          <Skeleton className="h-7 w-24 rounded-md" />
          <Skeleton className="h-7 w-20 rounded-md" />
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 pt-3">
        <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-2 lg:grid-cols-[1fr_1.3fr_2.2fr_auto]">
          <div className="grid gap-1.5">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-9 w-full" />
          </div>
          <div className="grid gap-1.5">
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className="h-9 w-full" />
          </div>
          <div className="grid gap-1.5 md:col-span-2 lg:col-span-1">
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className="h-9 w-full" />
          </div>
          <Skeleton className="h-9 w-28 md:col-span-2 lg:col-span-1" />
        </div>
      </CardContent>
    </Card>
  );
}

export function ReportTableSkeleton({ showSlowHint = false }: { showSlowHint?: boolean }) {
  const slow = useSlowConnectionHint(5000);

  return (
    <Card>
      <CardHeader className="py-2.5">
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        {showSlowHint && slow ? (
          <span className="text-xs font-medium text-amber-700">
            Waking up server &amp; loading report…
          </span>
        ) : (
          <Skeleton className="h-4 w-28" />
        )}
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-zinc-200">
          <div className="grid grid-cols-[50px_1fr_1.2fr_2.4fr_1fr_120px] gap-3 bg-zinc-50 px-4 py-2.5">
            <Skeleton className="h-4 w-8" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16" />
          </div>
          {[0, 1, 2, 3].map((row) => (
            <div
              key={row}
              className="grid grid-cols-[50px_1fr_1.2fr_2.4fr_1fr_120px] items-center gap-3 px-4 py-3.5"
            >
              <Skeleton className="h-4 w-6" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-32" />
              <div className="grid gap-1.5">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
              <Skeleton className="h-6 w-20 rounded-md" />
              <div className="flex justify-end gap-1.5">
                <Skeleton className="h-7 w-7 rounded-md" />
                <Skeleton className="h-7 w-7 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function ReportPageSkeleton({ showSlowHint = true }: { showSlowHint?: boolean }) {
  return (
    <div className="grid gap-4">
      <Card className="px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-9 w-40" />
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-24" />
          </div>
        </div>
      </Card>
      <ComposerSkeleton />
      <ReportTableSkeleton showSlowHint={showSlowHint} />
    </div>
  );
}

export function WorkspaceShellSkeleton() {
  const slow = useSlowConnectionHint(5000);

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <header className="sticky top-0 z-40 w-full border-t-[3px] border-t-primary border-b border-b-zinc-800 bg-zinc-950 text-white shadow-sm">
        <div className="mx-auto flex min-h-14 w-full max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-1.5 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-white px-2.5">
              <img
                src="/default-logo.png"
                alt="Solution Art"
                className="h-6 w-auto object-contain"
              />
            </div>
            <div className="grid gap-1.5">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-24 bg-zinc-800" />
                <Skeleton className="h-4 w-12 rounded-full bg-zinc-800" />
              </div>
              <Skeleton className="h-3 w-20 bg-zinc-800" />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-16 bg-zinc-800" />
            <Skeleton className="h-8 w-20 bg-zinc-800" />
            <Skeleton className="h-8 w-16 bg-zinc-800" />
            <Skeleton className="h-8 w-16 bg-zinc-800" />
            <Skeleton className="h-8 w-22 bg-zinc-800" />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-4 sm:px-6 sm:py-5">
        {slow && (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs font-medium text-amber-800">
            Connecting to server (first request after idle may take a few seconds)…
          </div>
        )}
        <ReportPageSkeleton showSlowHint={false} />
      </main>
    </div>
  );
}

export function PageCardSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <Card>
      <CardHeader className="py-3">
        <Skeleton className="h-5 w-44" />
        <Skeleton className="h-8 w-28" />
      </CardHeader>
      <CardContent className="grid gap-3 pt-4">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}

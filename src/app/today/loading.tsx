export default function TodayLoading() {
  return (
    <div className="flex min-h-dvh h-dvh w-full flex-col bg-gray-950">
      <header className="flex shrink-0 items-center gap-3 border-b border-gray-800 px-3 py-2 sm:px-4">
        <div className="h-9 w-9 shrink-0 rounded-lg bg-gray-800 animate-pulse" aria-hidden />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-4 w-3/5 max-w-[200px] rounded bg-gray-800 animate-pulse" aria-hidden />
          <div className="h-3 w-2/5 max-w-[140px] rounded bg-gray-800/80 animate-pulse" aria-hidden />
        </div>
        <div className="h-8 w-20 shrink-0 rounded-md bg-gray-800 animate-pulse" aria-hidden />
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-gray-800 px-2 py-2 sm:px-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-9 w-20 shrink-0 rounded-lg bg-gray-800 animate-pulse"
              aria-hidden
            />
          ))}
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-hidden p-3 sm:p-4">
          <div className="h-5 w-40 rounded bg-gray-800 animate-pulse" aria-hidden />
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-14 w-full rounded-lg bg-gray-800/90 animate-pulse"
                aria-hidden
              />
            ))}
          </div>
        </div>

        <div className="shrink-0 border-t border-gray-800 px-3 py-3 sm:px-4">
          <div className="h-12 w-full rounded-lg bg-gray-800 animate-pulse" aria-hidden />
        </div>
      </div>
    </div>
  );
}

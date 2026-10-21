// Shown the instant you tap into a page while its data loads on the server,
// so navigation never feels frozen. Shapes roughly follow each page's layout.
type Variant = "list" | "detail" | "profile" | "calendar" | "form";

function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-full bg-neutral-200/80 ${className}`} />;
}

function Block({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-neutral-100 ${className}`} />;
}

export default function PageSkeleton({ variant = "list" }: { variant?: Variant }) {
  return (
    <main
      aria-busy="true"
      aria-label="Loading"
      className="lu-fade-in min-h-dvh bg-paper px-4 py-6 text-neutral-900 sm:px-6 sm:py-8 lg:px-8"
    >
      <div className="mx-auto max-w-6xl py-4 sm:py-6">
        {variant === "profile" ? (
          <>
            <Block className="h-40 w-full rounded-panel sm:h-56" />
            <div className="-mt-10 flex items-end gap-4 px-4">
              <div className="h-20 w-20 animate-pulse rounded-full border-4 border-paper bg-neutral-200" />
              <div className="flex-1 space-y-2 pb-2">
                <Bar className="h-6 w-48" />
                <Bar className="h-4 w-32 bg-neutral-100" />
              </div>
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Block key={i} className="h-28" />
              ))}
            </div>
          </>
        ) : (
          <>
            <Bar className="h-3 w-20" />
            <Bar className="mt-4 h-9 w-64 rounded-xl sm:w-80" />
            <Bar className="mt-4 h-4 w-full max-w-md bg-neutral-100" />

            {variant === "calendar" ? (
              <div className="mt-8 grid grid-cols-7 gap-2">
                {Array.from({ length: 14 }).map((_, i) => (
                  <Block key={i} className="h-20" />
                ))}
              </div>
            ) : variant === "detail" ? (
              <div className="mt-8 space-y-4">
                <Block className="h-48 rounded-panel" />
                <Block className="h-32 rounded-panel" />
                <Block className="h-24 rounded-panel" />
              </div>
            ) : variant === "form" ? (
              <div className="mt-8 max-w-2xl space-y-4">
                {[0, 1, 2, 3].map((i) => (
                  <Block key={i} className="h-14 rounded-xl" />
                ))}
              </div>
            ) : (
              <>
                <div className="mt-8 flex gap-6 border-b border-hairline pb-3">
                  <Bar className="h-4 w-16" />
                  <Bar className="h-4 w-16 bg-neutral-100" />
                  <Bar className="h-4 w-16 bg-neutral-100" />
                </div>
                <div className="mt-6 grid gap-2.5 lg:grid-cols-2">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-3.5">
                      <div className="h-12 w-12 shrink-0 animate-pulse rounded-2xl bg-neutral-100" />
                      <div className="flex-1 space-y-2">
                        <Bar className="h-3 w-24 bg-neutral-100" />
                        <Bar className="h-4 w-3/4" />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}

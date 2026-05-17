export default function Loading() {
  return (
    <main className="min-h-screen bg-white px-6 py-10 text-neutral-900">
      <div className="mx-auto max-w-6xl py-16">
        <div className="max-w-3xl">
          <div className="h-4 w-28 animate-pulse rounded-full bg-neutral-200" />
          <div className="mt-5 h-12 w-full max-w-xl animate-pulse rounded-2xl bg-neutral-200 md:h-16" />
          <div className="mt-5 h-5 w-full max-w-2xl animate-pulse rounded-full bg-neutral-100" />
          <div className="mt-3 h-5 w-2/3 animate-pulse rounded-full bg-neutral-100" />
        </div>

        <div className="mt-10 grid gap-6">
          {[1, 2, 3].map((item) => (
            <div
              key={item}
              className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm"
            >
              <div className="flex gap-4">
                <div className="h-16 w-16 shrink-0 animate-pulse rounded-2xl bg-neutral-100" />

                <div className="flex-1">
                  <div className="flex gap-2">
                    <div className="h-6 w-24 animate-pulse rounded-full bg-neutral-100" />
                    <div className="h-6 w-28 animate-pulse rounded-full bg-neutral-100" />
                  </div>

                  <div className="mt-5 h-7 w-2/3 animate-pulse rounded-xl bg-neutral-200" />
                  <div className="mt-4 h-4 w-full animate-pulse rounded-full bg-neutral-100" />
                  <div className="mt-3 h-4 w-3/4 animate-pulse rounded-full bg-neutral-100" />

                  <div className="mt-6 grid gap-4 md:grid-cols-3">
                    <div className="h-20 animate-pulse rounded-2xl bg-neutral-50" />
                    <div className="h-20 animate-pulse rounded-2xl bg-neutral-50" />
                    <div className="h-20 animate-pulse rounded-2xl bg-neutral-50" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

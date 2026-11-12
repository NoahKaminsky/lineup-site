import type { Metadata } from "next";
import Link from "next/link";
import PublicLayout, { PageIntro } from "@/app/components/site/PublicLayout";
import { CITIES } from "@/app/lib/cities";
import { loadDirectory } from "./data";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Find a beauty or grooming pro near you",
  description:
    "Verified barbers, hairstylists, nail, lash and brow artists across Canada. Pick your city to see who's on LineUp.",
  alternates: { canonical: "/beauty" },
};

export default async function BeautyIndexPage() {
  const { pros, shops } = await loadDirectory();
  const count = new Map<string, number>();
  for (const item of [...pros, ...shops]) count.set(item.city.slug, (count.get(item.city.slug) || 0) + 1);
  const live = CITIES.filter((c) => count.has(c.slug)).sort((a, b) => (count.get(b.slug) || 0) - (count.get(a.slug) || 0));
  const provinces = Array.from(new Set(CITIES.map((c) => c.province)));

  return (
    <PublicLayout>
      <PageIntro
        eyebrow="Find a pro"
        title={
          <>
            Beauty and grooming, near you.
            <span className="block text-neutral-400">Pick your city.</span>
          </>
        }
        subtitle="Every pro listed has been verified by LineUp. If your city doesn't have anyone yet, post a request anyway: pros nearby are alerted when one comes in. Looking for a salon or barbershop? Find a shop instead."
      />

      <div className="mx-auto max-w-6xl space-y-14 px-4 pb-24 sm:px-6">
        {live.length ? (
          <section>
            <h2 className="text-xs font-medium text-neutral-500">On LineUp now</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {live.map((city) => (
                <li key={city.slug}>
                  <Link
                    href={`/beauty/${city.slug}`}
                    className="flex items-baseline justify-between rounded-3xl bg-white p-5 ring-1 ring-ink/[0.07] transition-shadow hover:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.18)]"
                  >
                    <span className="text-lg font-semibold tracking-tight">
                      {city.name}, {city.province}
                    </span>
                    <span className="text-sm text-neutral-500">{count.get(city.slug)} listed</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section>
          <h2 className="text-xs font-medium text-neutral-500">All cities</h2>
          <div className="mt-4 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {provinces.map((province) => (
              <div key={province}>
                <p className="text-sm font-semibold">{province}</p>
                <ul className="mt-2 space-y-1.5 text-sm text-neutral-600">
                  {CITIES.filter((c) => c.province === province).map((city) => (
                    <li key={city.slug}>
                      <Link href={`/beauty/${city.slug}`} className="hover:text-ink">
                        {city.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      </div>
    </PublicLayout>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import PublicLayout from "@/app/components/site/PublicLayout";
import { getPublicIssues, weekStart } from "@/lib/email/issues";
import NewsSignup from "./NewsSignup";
import { newsSerif } from "./fonts";

export const metadata: Metadata = {
  title: "The LineUp | Weekly news",
  description: "The LineUp: weekly news from LineUp, plus every past issue.",
};

const serif = "font-[family-name:var(--font-news-serif)]";

function fmt(dateKey: string, options: Intl.DateTimeFormatOptions) {
  return new Date(`${dateKey}T12:00:00Z`).toLocaleDateString("en-CA", { ...options, timeZone: "UTC" });
}

function todayLine() {
  return new Date().toLocaleDateString("en-CA", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Winnipeg",
  });
}

// A rule that draws itself across the page on load.
function Rule({ delay = 0, double = false }: { delay?: number; double?: boolean }) {
  return (
    <div aria-hidden="true" className="lu-rule" style={{ animationDelay: `${delay}ms` }}>
      <div className="h-px bg-ink" />
      {double ? <div className="mt-[3px] h-[2px] bg-ink" /> : null}
    </div>
  );
}

export default function NewsPage() {
  const issues = getPublicIssues();
  const [lead, ...rest] = issues;
  const weeks = new Map<string, typeof rest>();
  for (const issue of rest) {
    const key = weekStart(issue.date);
    weeks.set(key, [...(weeks.get(key) || []), issue]);
  }

  return (
    <PublicLayout>
      <div className={`${newsSerif.variable} lu-newsprint`}>
        <div className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-6 sm:pt-12">
          {/* ── Masthead ─────────────────────────────────────────── */}
          <header>
            <div className="lu-rise-in flex items-center justify-between gap-4 pb-2 text-[10px] font-medium uppercase tracking-[0.2em] text-neutral-600 sm:text-[11px]">
              <span>Vol. 1 · No. {issues.length}</span>
              <span className="hidden sm:inline">Canadian edition</span>
              <span>Weekly · Free</span>
            </div>
            <Rule double delay={80} />
            <h1
              className={`${serif} lu-masthead py-4 text-center text-[clamp(3.5rem,13vw,9.5rem)] leading-[0.9] tracking-[-0.02em] text-ink sm:py-6`}
            >
              <span className="italic">The</span> LineUp
            </h1>
            <Rule delay={220} />
            <div className="lu-rise-in flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-[11px] uppercase tracking-[0.16em] text-neutral-600 sm:text-xs" style={{ animationDelay: "320ms" }}>
              <span>{todayLine()}</span>
              <span className={`${serif} text-sm normal-case italic tracking-normal text-ink sm:text-base`}>
                Your weekly beauty &amp; grooming news
              </span>
            </div>
            <Rule double delay={360} />
          </header>

          {lead ? (
            <div className="mt-10 grid gap-10 lg:grid-cols-12 lg:gap-0">
              {/* ── Lead story ─────────────────────────────────── */}
              <article className="lu-rise-in lg:col-span-8 lg:border-r lg:border-ink/20 lg:pr-10" style={{ animationDelay: "440ms" }}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
                  Latest weekly issue · {fmt(lead.date, { month: "long", day: "numeric" })}
                </p>
                <Link href={`/news/${lead.slug}`} className="group block">
                  <h2
                    className={`${serif} mt-3 text-[clamp(2.75rem,7vw,5.5rem)] leading-[0.95] tracking-[-0.02em] text-ink decoration-1 underline-offset-[10px] group-hover:underline`}
                  >
                    {lead.title}
                  </h2>
                </Link>
                <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
                  By {lead.byline}
                </p>
                <div className="mt-6 h-px bg-ink/20" />
                <p className="lu-dropcap mt-6 text-[17px] leading-8 text-neutral-800 sm:columns-2 sm:gap-10">
                  {lead.summary} Read the full issue as it went out to everyone on the list, and sign up to get the
                  next one the day it&apos;s sent.
                </p>
                <Link
                  href={`/news/${lead.slug}`}
                  className="group mt-8 inline-flex items-center gap-2 border-b border-ink pb-1 text-sm font-semibold uppercase tracking-[0.14em] text-ink"
                >
                  Read the issue
                  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1" fill="none" aria-hidden="true">
                    <path d="M3 8h9M8.5 4.5L12 8l-3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
              </article>

              {/* ── Subscribe box, like a classifieds panel ───── */}
              <aside className="lu-rise-in lg:col-span-4 lg:pl-10" style={{ animationDelay: "540ms" }}>
                <div className="border-[3px] border-double border-ink p-5 sm:p-6">
                  <p className="text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-600">
                    Home delivery
                  </p>
                  <p className={`${serif} mt-2 text-center text-[2.25rem] leading-none text-ink`}>
                    Get <span className="italic">The LineUp</span>
                  </p>
                  <p className="mt-3 text-center text-sm leading-6 text-neutral-600">
                    A new issue every week, straight to your inbox. Unsubscribe anytime.
                  </p>
                  <div className="mt-5">
                    <NewsSignup compact />
                  </div>
                </div>

                <div className="mt-8">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">Also on LineUp</p>
                  <ul className="mt-3 divide-y divide-ink/15 border-y border-ink/15">
                    {[
                      { href: "/about", title: "Meet the founders", note: "Why we built LineUp" },
                      { href: "/faq", title: "How it all works", note: "Booking, payments, plans" },
                      { href: "/discover", title: "Browse pros", note: "Find someone near you" },
                    ].map((item) => (
                      <li key={item.href}>
                        <Link href={item.href} className="group block py-3.5">
                          <span className={`${serif} block text-xl leading-tight text-ink group-hover:underline`}>{item.title}</span>
                          <span className="text-xs text-neutral-500">{item.note}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </aside>
            </div>
          ) : (
            <p className={`${serif} mt-16 text-center text-3xl text-neutral-500`}>The first edition is on the press.</p>
          )}

          {/* ── The archive, week by week ──────────────────────── */}
          {weeks.size > 0 ? (
            <section className="mt-16" aria-labelledby="archive-heading">
              <Rule double />
              <h2 id="archive-heading" className="py-3 text-center text-[11px] font-semibold uppercase tracking-[0.24em] text-ink">
                From the archive
              </h2>
              <Rule />
              <div className="grid sm:grid-cols-2 lg:grid-cols-3">
                {[...weeks.entries()].map(([week, weekIssues], index) => (
                  <div
                    key={week}
                    className="lu-rise-in border-ink/20 py-8 sm:px-6 sm:[&:nth-child(2n)]:border-l lg:[&:nth-child(2n)]:border-l-0 lg:[&:not(:nth-child(3n+1))]:border-l"
                    style={{ animationDelay: `${index * 80}ms` }}
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
                      Week of {fmt(week, { month: "long", day: "numeric", year: "numeric" })}
                    </p>
                    {weekIssues.map((issue) => (
                      <Link key={issue.slug} href={`/news/${issue.slug}`} className="group mt-3 block">
                        <h3 className={`${serif} text-[2rem] leading-[1.02] text-ink group-hover:underline`}>{issue.title}</h3>
                        <p className="mt-2 text-sm leading-6 text-neutral-600">{issue.summary}</p>
                        <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
                          {fmt(issue.date, { weekday: "short", month: "short", day: "numeric" })} · By {issue.byline}
                        </p>
                      </Link>
                    ))}
                  </div>
                ))}
              </div>
              <Rule />
            </section>
          ) : null}
        </div>
      </div>
    </PublicLayout>
  );
}

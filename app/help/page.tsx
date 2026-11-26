import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { HELP_SECTIONS } from "@/app/lib/helpGuides";
import { TITLE, buttonClass, panelClass } from "@/app/components/ui";
import GuideControls from "./GuideControls";

export const metadata: Metadata = {
  title: "Help and guides | LineUp",
  description: "Step-by-step guides for booking on LineUp, running your business as a pro, and running a shop with Studio.",
};

// Every main feature as a short "how do I…" guide, grouped by who you are,
// each with a button straight to the right page.
export default function HelpPage() {
  return (
    <main className="min-h-screen bg-paper px-4 py-8 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl py-6 sm:py-8">
        <p className="text-sm font-medium text-neutral-500">Help</p>
        <h1 className={`mt-1 ${TITLE.pro}`}>How LineUp works</h1>
        <p className="mt-3 max-w-xl text-[15px] leading-7 text-neutral-600">
          Short guides for everything you can do here, with a button to the right page. Pick your side.
        </p>

        <nav aria-label="Guides for" className="mt-6 flex flex-wrap gap-2">
          {HELP_SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className={buttonClass("secondary", "md")}>
              {s.title}
            </a>
          ))}
        </nav>

        {HELP_SECTIONS.map((section) => (
          <section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`} className="scroll-mt-24 pt-12">
            <h2 id={`${section.id}-title`} className="text-2xl font-semibold tracking-[-0.03em] text-ink">
              {section.title}
            </h2>
            <p className="mt-1 text-[15px] text-neutral-500">{section.intro}</p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {section.guides.map((g) => (
                <article key={g.id} id={`${section.id}-${g.id}`} className={`${panelClass} flex scroll-mt-24 flex-col p-5`}>
                  <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{g.title}</h3>
                  <ol className="mt-3 flex-1 space-y-2">
                    {g.steps.map((step, i) => (
                      <li key={step} className="flex gap-3 text-sm leading-6 text-neutral-700">
                        <span
                          aria-hidden="true"
                          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink/[0.06] text-[11px] font-semibold tabular-nums text-ink"
                        >
                          {i + 1}
                        </span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                  {g.link ? (
                    <Link
                      href={g.link.href}
                      className="group mt-4 inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-medium text-ink sm:min-h-0"
                    >
                      {g.link.label}
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                    </Link>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        ))}

        <div className={`${panelClass} mt-14 flex flex-wrap items-center justify-between gap-4 p-6`}>
          <div>
            <p className="text-[15px] font-semibold text-ink">Still stuck?</p>
            <p className="mt-0.5 text-sm text-neutral-500">Check the FAQ, or send us a message and we&apos;ll get back to you.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/faq" className={buttonClass("secondary", "md")}>
              Read the FAQ
            </Link>
            <Link href="/contact" className={buttonClass("primary", "md")}>
              Contact us
            </Link>
          </div>
        </div>

        <GuideControls />
      </div>
    </main>
  );
}

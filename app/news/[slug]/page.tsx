import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PublicLayout from "@/app/components/site/PublicLayout";
import { getIssueWebHtml, getPublicIssues } from "@/lib/email/issues";
import NewsSignup from "../NewsSignup";
import IssueFrame from "./IssueFrame";
import { newsSerif } from "../fonts";

type Params = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return getPublicIssues().map((issue) => ({ slug: issue.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const issue = getPublicIssues().find((i) => i.slug === slug);
  if (!issue) return { title: "News | LineUp" };
  return { title: `${issue.title} | LineUp News`, description: issue.summary };
}

export default async function IssuePage({ params }: Params) {
  const { slug } = await params;
  const issues = getPublicIssues();
  const index = issues.findIndex((i) => i.slug === slug);
  if (index < 0) notFound();
  const issue = issues[index];
  const newer = issues[index - 1];
  const older = issues[index + 1];

  const serif = "font-[family-name:var(--font-news-serif)]";

  return (
    <PublicLayout>
      <div className={`${newsSerif.variable} lu-newsprint`}>
        <div className="mx-auto max-w-3xl px-4 pt-8 sm:px-6 sm:pt-12">
          {/* Small masthead back to the front page. */}
          <div aria-hidden="true" className="lu-rule">
            <div className="h-px bg-ink" />
            <div className="mt-[3px] h-[2px] bg-ink" />
          </div>
          <div className="flex items-center justify-between py-2.5">
            <Link href="/news" className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-600 hover:text-ink">
              ← Front page
            </Link>
            <Link href="/news" className={`${serif} text-2xl leading-none text-ink sm:text-3xl`}>
              <span className="italic">The</span> LineUp
            </Link>
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-600">No. {issues.length - index}</span>
          </div>
          <div aria-hidden="true" className="lu-rule" style={{ animationDelay: "120ms" }}>
            <div className="h-px bg-ink" />
          </div>

          <p className="lu-rise-in mt-10 text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500" style={{ animationDelay: "80ms" }}>
            {new Date(`${issue.date}T12:00:00Z`).toLocaleDateString("en-CA", {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
              timeZone: "UTC",
            })}
          </p>
          <h1
            className={`${serif} lu-masthead mt-3 text-center text-[clamp(3rem,9vw,5.5rem)] leading-[0.95] text-ink`}
          >
            {issue.title}
          </h1>
          <p className="lu-rise-in mx-auto mt-5 max-w-xl text-center text-lg leading-8 text-neutral-700" style={{ animationDelay: "260ms" }}>
            {issue.summary}
          </p>
          <p className="lu-rise-in mt-5 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500" style={{ animationDelay: "320ms" }}>
            By {issue.byline}
          </p>
        </div>

        <div className="lu-rise-in mx-auto mt-10 max-w-3xl px-2 sm:px-6" style={{ animationDelay: "380ms" }}>
          <div className="border-[3px] border-double border-ink p-1.5 sm:p-2">
            <IssueFrame html={getIssueWebHtml(issue)} title={issue.title} />
          </div>
        </div>

        <div className="mx-auto max-w-3xl px-4 pb-24 pt-12 sm:px-6">
          <div className="border-y border-ink py-6 text-center">
            <p className={`${serif} text-3xl leading-none text-ink`}>
              Get the next <span className="italic">edition</span>
            </p>
            <div className="mx-auto mt-5 max-w-md text-left">
              <NewsSignup compact />
            </div>
          </div>
          <nav aria-label="More issues" className="mt-8 grid gap-3 sm:grid-cols-2">
            {older ? (
              <Link href={`/news/${older.slug}`} className="group border-t border-ink/30 pt-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">← Older</p>
                <p className={`${serif} mt-1 text-2xl leading-tight text-ink group-hover:underline`}>{older.title}</p>
              </Link>
            ) : (
              <span />
            )}
            {newer ? (
              <Link href={`/news/${newer.slug}`} className="group border-t border-ink/30 pt-3 text-right">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">Newer →</p>
                <p className={`${serif} mt-1 text-2xl leading-tight text-ink group-hover:underline`}>{newer.title}</p>
              </Link>
            ) : null}
          </nav>
        </div>
      </div>
    </PublicLayout>
  );
}

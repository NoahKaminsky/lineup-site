import { getNewsletterLaunchHtml, NEWSLETTER_LAUNCH_SUBJECT } from "./newsletterLaunch";
import { getNewsletterMarch27Html } from "./newsletterMarch27";

// Every newsletter issue, newest first. /news lists the public ones grouped
// by week, and /news/<slug> shows each in full.
//
// Writing a new newsletter: add its template file next to these, then add an
// entry here with `public: true` (or false for pro-only or promo issues that
// shouldn't be on the website).

export type NewsletterIssue = {
  slug: string;
  title: string;
  subject: string;
  date: string; // YYYY-MM-DD it went out
  summary: string;
  audience: "Everyone" | "Clients" | "Pros";
  byline: string;
  public: boolean;
  html: (email: string) => string;
};

export const NEWSLETTER_ISSUES: NewsletterIssue[] = [
  {
    slug: "lineup-is-live",
    title: "LineUp is live",
    subject: NEWSLETTER_LAUNCH_SUBJECT,
    date: "2026-10-17",
    summary:
      "LineUp is officially open in Winnipeg. How to set up your account, post what you want as a client, and start getting booked as a pro.",
    audience: "Everyone",
    byline: "Noah Kaminsky",
    public: true,
    html: getNewsletterLaunchHtml,
  },
  {
    slug: "account-creation",
    title: "Account creation is here",
    subject: "LineUp Newsletter",
    date: "2026-03-27",
    summary:
      "The first LineUp newsletter: accounts open for testing, why we're building LineUp, and the mission behind it.",
    audience: "Everyone",
    byline: "The LineUp team",
    public: true,
    html: getNewsletterMarch27Html,
  },
];

export function getPublicIssues() {
  const today = new Date().toISOString().slice(0, 10);
  return NEWSLETTER_ISSUES.filter((issue) => issue.public && issue.date <= today).sort((a, b) =>
    b.date.localeCompare(a.date)
  );
}

// The issue as a web page: same email, minus the personal unsubscribe line,
// with links opening in a new tab.
export function getIssueWebHtml(issue: NewsletterIssue) {
  return issue
    .html("")
    .replace(/To stop receiving these emails,[\s\S]*?unsubscribe here<\/a>\.?/i, "")
    .replace(/<head>/i, '<head><base target="_blank" /><style>html,body{height:auto!important;min-height:0!important;overflow:hidden}</style>');
}

// Monday of the week a date falls in, e.g. "2026-10-12".
export function weekStart(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - ((day + 6) % 7));
  return date.toISOString().slice(0, 10);
}

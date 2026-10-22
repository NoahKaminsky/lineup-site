// LineUp's social accounts, shown at the bottom of every public page.
export const LINEUP_SOCIALS = [
  {
    label: "Instagram",
    handle: "@lineup_aesthetics",
    href: "https://www.instagram.com/lineup_aesthetics/",
    icon: (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
        <rect x="2.75" y="2.75" width="14.5" height="14.5" rx="4.25" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="10" cy="10" r="3.4" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="14.4" cy="5.6" r="1" fill="currentColor" />
      </svg>
    ),
  },
  {
    label: "TikTok",
    handle: "@line.up.aesthetic",
    href: "https://www.tiktok.com/@line.up.aesthetic",
    icon: (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
        <path d="M12 3v9.5a3.25 3.25 0 1 1-3.25-3.25" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <path d="M12 3c.4 2.2 1.9 3.6 4 3.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    ),
  },
];

export default function SocialLinks({ className = "" }: { className?: string }) {
  return (
    <ul className={`flex flex-wrap items-center gap-2 ${className}`} aria-label="LineUp on social media">
      {LINEUP_SOCIALS.map((social) => (
        <li key={social.label}>
          <a
            href={social.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`LineUp on ${social.label} (${social.handle})`}
            className="group inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium text-ink ring-1 ring-inset ring-ink/15 transition-all duration-300 hover:-translate-y-0.5 hover:bg-ink hover:text-white hover:ring-ink"
          >
            <span className="transition-transform duration-300 group-hover:scale-110">{social.icon}</span>
            <span>{social.handle}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

// First-run guidance: which tours, page tips and checklists someone has seen.
// Pure helpers (tested in tests/guides); the client store is in
// app/components/guides/useGuides.ts.

// Keys are "kind:name", e.g. "tour:shop", "tip:services", "checklist:customer".
export type GuideKey = `${"tour" | "tip" | "checklist"}:${string}`;

export function isSeen(seen: readonly string[], key: GuideKey): boolean {
  return seen.includes(key);
}

// Adds a key once, keeping order; never grows past a sane size.
export function withSeen(seen: readonly string[], key: GuideKey): string[] {
  if (seen.includes(key)) return [...seen];
  return [...seen, key].slice(-200);
}

// Union of two lists (this browser + the profile), without repeats.
export function mergeSeen(a: readonly string[] | null | undefined, b: readonly string[] | null | undefined): string[] {
  const out: string[] = [];
  for (const k of [...(a || []), ...(b || [])]) if (typeof k === "string" && k && !out.includes(k)) out.push(k);
  return out.slice(-200);
}

// "Show tips again" clears page tips and tours; checklists keep their state
// because they retire on their own once everything is done.
export function withoutReplayable(seen: readonly string[]): string[] {
  return seen.filter((k) => !k.startsWith("tip:") && !k.startsWith("tour:"));
}

// ---- Getting-started checklists ---------------------------------------

export type ChecklistStep = { key: string; label: string; why: string; href?: string; done: boolean };

// A new customer's first steps. Notifications only count where this browser
// can do them; otherwise that step is treated as done rather than nagging.
export function customerChecklist(input: {
  savedPros: number;
  requests: number;
  bookings: number;
  hasPhoto: boolean;
  push: { supported: boolean; subscribed: boolean; denied: boolean };
}): ChecklistStep[] {
  const active = input.requests + input.bookings > 0;
  return [
    {
      key: "find",
      label: "Find a pro you like",
      why: "Look through Explore and tap the heart on anyone you'd book.",
      href: "/discover",
      done: input.savedPros > 0 || active,
    },
    {
      key: "book",
      label: "Make your first booking",
      why: "Pick an open time on a pro's profile, or post a request and get offers.",
      href: "/requests/new",
      done: active,
    },
    {
      key: "notify",
      label: "Turn on notifications",
      why: "Hear about offers, confirmations and reminders the moment they happen.",
      done: !input.push.supported || input.push.denied || input.push.subscribed,
    },
    {
      key: "photo",
      label: "Add a profile photo",
      why: "So your pro knows who's at the door.",
      href: "/account#photo",
      done: input.hasPhoto,
    },
  ];
}

// What's left for a shop to be fully running. Owners also get payouts.
export function shopChecklist(input: {
  isOwner: boolean;
  hasAddress: boolean;
  hasTagline: boolean;
  teamCount: number;
  bookableWithoutServices: number;
  live: boolean;
  payoutsReady: boolean;
  shared: boolean;
  hasSlug: boolean;
}): ChecklistStep[] {
  return [
    { key: "address", label: "Add the shop's address", why: "So clients can find you and see you in Shops near them.", href: "/studio/settings", done: input.hasAddress },
    { key: "tagline", label: "Write a one-line tagline", why: "The first thing clients read on your shop's page.", href: "/studio/settings", done: input.hasTagline },
    { key: "team", label: "Invite your team", why: "Each pro gets their own column on the calendar and their own bookings.", href: "/studio/team", done: input.teamCount > 1 },
    {
      key: "services",
      label: "Make sure every pro has services",
      why: "Clients can only book services a pro has listed. Each pro adds theirs on their Services page.",
      href: "/studio/team",
      done: input.bookableWithoutServices === 0,
    },
    { key: "plan", label: "Choose a plan", why: "Turns on the shop page, walk-ins and front desk.", done: input.live },
    ...(input.isOwner
      ? [{ key: "payouts", label: "Set up payouts to the shop", why: "Where the shop's cut, booth rent and memberships are paid.", href: "/studio/settings", done: input.payoutsReady }]
      : []),
    ...(input.hasSlug
      ? [{ key: "share", label: "Share your shop's booking page", why: "Put the link in your Instagram bio and send it to your regulars.", done: input.shared }]
      : []),
  ];
}

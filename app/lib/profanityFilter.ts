import leoProfanity from "leo-profanity";

// Client-side check only (no dedicated API route backs most of the
// direct-insert flows this guards — chat, reviews, requests — matching how
// the rest of those flows already validate on the client before insert).
export function containsProfanity(text: string | null | undefined): boolean {
  if (!text || !text.trim()) return false;
  return leoProfanity.check(text);
}

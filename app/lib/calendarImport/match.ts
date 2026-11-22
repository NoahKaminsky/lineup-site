import type { Confidence, TeamPro } from "./types";

// Matching a staff name from a file ("Alex", "Alex R.", "alex rivera") to
// someone on the shop's team.
//   confident: the full name, or a first name only one team member has
//   check:     a partial match (initial, nickname-ish prefix, part of the name)
//   none:      nobody fits

export function normName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchPro(staffText: string | null | undefined, team: TeamPro[]): { proId: string | null; confidence: Confidence } {
  const s = normName(staffText || "");
  if (!s || !team.length) return { proId: null, confidence: "none" };
  const people = team.map((p) => {
    const full = normName(p.name);
    const parts = full.split(" ").filter(Boolean);
    return { id: p.id, full, first: parts[0] || "", last: parts[parts.length - 1] || "" };
  });

  const exact = people.filter((p) => p.full === s);
  if (exact.length === 1) return { proId: exact[0].id, confidence: "confident" };

  const [sFirst = "", ...rest] = s.split(" ");
  const sLast = rest[rest.length - 1] || "";

  // "Alex" when only one Alex is on the team.
  if (!rest.length) {
    const byFirst = people.filter((p) => p.first === sFirst);
    if (byFirst.length === 1) return { proId: byFirst[0].id, confidence: "confident" };
    const byPrefix = people.filter((p) => p.first.startsWith(sFirst) || sFirst.startsWith(p.first));
    if (byPrefix.length === 1 && sFirst.length >= 3) return { proId: byPrefix[0].id, confidence: "check" };
    return { proId: null, confidence: "none" };
  }

  // "Alex R" / "Alex Rivera-Smith": same first name, last name starts alike.
  const byBoth = people.filter((p) => p.first === sFirst && (p.last.startsWith(sLast) || sLast.startsWith(p.last)));
  if (byBoth.length === 1) return { proId: byBoth[0].id, confidence: sLast.length > 1 ? "confident" : "check" };

  const byFirst = people.filter((p) => p.first === sFirst);
  if (byFirst.length === 1) return { proId: byFirst[0].id, confidence: "check" };

  return { proId: null, confidence: "none" };
}

// A team member named inside free text, like an event title "Fade - Jordan w/ Alex".
// Returns the pro and the text with their name taken out.
export function findProInText(text: string, team: TeamPro[]): { proId: string | null; confidence: Confidence; rest: string } {
  const lower = ` ${normName(text)} `;
  const hits: { id: string; confidence: Confidence; name: string }[] = [];
  for (const p of team) {
    const full = normName(p.name);
    const first = full.split(" ")[0];
    if (full && lower.includes(` ${full} `)) hits.push({ id: p.id, confidence: "confident", name: full });
    else if (first.length >= 3 && lower.includes(` ${first} `)) {
      // Only if no one else on the team shares that first name.
      const shared = team.filter((o) => normName(o.name).split(" ")[0] === first).length;
      if (shared === 1) hits.push({ id: p.id, confidence: "check", name: first });
    }
  }
  if (hits.length !== 1) return { proId: null, confidence: "none", rest: text };
  const hit = hits[0];
  const pattern = new RegExp(`\\s*(?:\\bw\\/|\\bwith\\b|\\bby\\b|[-–—:|@])?\\s*\\b${hit.name.split(" ").join("\\s+")}\\b`, "i");
  return { proId: hit.id, confidence: hit.confidence, rest: text.replace(pattern, " ").replace(/\s+/g, " ").trim() };
}

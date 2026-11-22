// Pulling the client and the service out of free text in a calendar event:
// titles like "Jordan Lee - Skin fade", "Skin fade with Jordan", "Jordan
// (Beard trim)", and notes with a phone number or email in them.

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
// North American numbers: (204) 555-0134, 204-555-0134, +1 204 555 0134.
const PHONE_RE = /(?:\+?1[\s.-]?)?\(?\b(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})\b/;

const SERVICE_WORDS =
  /\b(cut|haircut|fade|trim|beard|shave|line ?up|colou?r|highlights?|balayage|blow ?out|blowdry|style|braids?|locs?|perm|treatment|nails?|mani(cure)?|pedi(cure)?|gel|acrylics?|fill|lash(es)?|lift|brows?|wax(ing)?|thread(ing)?|tint|lamination|sugaring|makeup|glam|facial|massage|consult(ation)?|appointment|appt|kids?|touch ?up|extensions?)\b/i;

export function findEmail(text: string) {
  return text.match(EMAIL_RE)?.[0].toLowerCase() || null;
}

export function findPhone(text: string) {
  const m = text.match(PHONE_RE);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : null;
}

// A "Client: Jordan Lee" or "Name: Jordan Lee" line in the notes.
export function findLabelledName(text: string) {
  const m = text.match(/^\s*(?:client|customer|name|guest)\s*[:-]\s*(.+)$/im);
  return m ? clean(m[1]) : null;
}

function clean(value: string) {
  const t = value.replace(EMAIL_RE, "").replace(PHONE_RE, "").replace(/[()[\]]/g, " ").replace(/\s+/g, " ").trim();
  return t.replace(/^[-–—:|,\s]+|[-–—:|,\s]+$/g, "") || null;
}

function looksLikeService(value: string) {
  return SERVICE_WORDS.test(value);
}

// Splits an event title into a client name and a service.
export function splitTitle(title: string): { client: string | null; service: string | null } {
  const t = title.replace(/\s+/g, " ").trim();
  if (!t) return { client: null, service: null };

  // "Skin fade with Jordan" / "Skin fade for Jordan"
  let m = t.match(/^(.+?)\s+(?:with|for)\s+(.+)$/i);
  if (m && looksLikeService(m[1]) && !looksLikeService(m[2])) return { client: clean(m[2]), service: clean(m[1]) };

  // "Jordan (Skin fade)" / "Skin fade (Jordan)"
  m = t.match(/^(.+?)\s*\((.+)\)\s*$/);
  if (m) {
    return looksLikeService(m[2]) && !looksLikeService(m[1])
      ? { client: clean(m[1]), service: clean(m[2]) }
      : looksLikeService(m[1])
      ? { client: clean(m[2]), service: clean(m[1]) }
      : { client: clean(m[1]), service: clean(m[2]) };
  }

  // "Jordan Lee - Skin fade" / "Skin fade - Jordan Lee" / "Jordan: Fade"
  const parts = t.split(/\s+[-–—|:]\s+|\s*:\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const serviceIndex = parts.findIndex(looksLikeService);
    if (serviceIndex !== -1) {
      const service = parts[serviceIndex];
      const client = parts.filter((_, i) => i !== serviceIndex).join(" ");
      return { client: clean(client), service: clean(service) };
    }
    return { client: clean(parts[0]), service: clean(parts.slice(1).join(" - ")) };
  }

  // One phrase: a service word means it's the service, otherwise a name.
  return looksLikeService(t) ? { client: null, service: clean(t) } : { client: clean(t), service: null };
}

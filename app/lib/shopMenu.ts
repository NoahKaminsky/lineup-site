// The shop's service menu for "What would you like?": every service the
// team books online, merged by name across pros ("Fade" and "fade " are one
// item), with the lowest price and shortest time, most-offered first.

export type MenuService = { name: string; priceLabel: string | null; minutes: number };

export function serviceKey(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function priceOf(label: string | null): number | null {
  const n = Number(String(label ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function shopMenu(pros: { services: MenuService[] }[]) {
  const items = new Map<string, { key: string; name: string; from: number | null; minutes: number | null; pros: number }>();
  for (const pro of pros) {
    const seen = new Set<string>();
    for (const s of pro.services) {
      const key = serviceKey(s.name);
      if (!key) continue;
      const item = items.get(key) || { key, name: s.name.trim(), from: null, minutes: null, pros: 0 };
      const price = priceOf(s.priceLabel);
      if (price !== null && (item.from === null || price < item.from)) item.from = price;
      if (item.minutes === null || s.minutes < item.minutes) item.minutes = s.minutes;
      if (!seen.has(key)) item.pros++;
      seen.add(key);
      items.set(key, item);
    }
  }
  return [...items.values()].sort((a, b) => b.pros - a.pros || a.name.localeCompare(b.name)).slice(0, 16);
}
